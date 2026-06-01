import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { estimateTokens } from "../agent/tokenizer";
import { renderSessionMarkdown } from "../dataset/corpus";
import type { Corpus } from "../types";
import type { Backend, BackendRunContext, ToolDefinition, ToolExecutionResult } from "./types";

export class FilesystemBackend implements Backend {
  readonly id = "filesystem" as const;

  async setup(corpus: Corpus, runDir: string): Promise<BackendRunContext> {
    const root = resolve(runDir, `filesystem-corpus-${corpus.id}`);
    await mkdir(root, { recursive: true });
    for (const session of corpus.sessions) {
      await writeFile(join(root, `${safeFileName(session.id)}.md`), renderSessionMarkdown(session));
    }

    return {
      backend: this.id,
      corpus,
      tools: createFilesystemTools(root),
      ingestionCost: {
        tokens: 0,
        costUsd: 0,
        notes: "Filesystem materialization has no model cost.",
      },
      teardown: async () => {
        await rm(root, { recursive: true, force: true });
      },
    };
  }
}

function createFilesystemTools(root: string): ToolDefinition[] {
  return [
    {
      name: "list_files",
      description: "List available session markdown files.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      execute: async () => {
        const files = await listMarkdownFiles(root);
        return textResult(files.join("\n"));
      },
    },
    {
      name: "grep_files",
      description: "Search session markdown files for a literal or regex pattern.",
      parameters: {
        type: "object",
        properties: { pattern: { type: "string", description: "Search pattern." } },
        required: ["pattern"],
        additionalProperties: false,
      },
      execute: async (args) => grepFiles(root, stringArg(args, "pattern")),
    },
    {
      name: "read_file",
      description: "Read an entire session markdown file by relative path.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Relative markdown file path." } },
        required: ["path"],
        additionalProperties: false,
      },
      execute: async (args) => readRelativeFile(root, stringArg(args, "path")),
    },
  ];
}

async function grepFiles(root: string, pattern: string): Promise<ToolExecutionResult> {
  const rgResult = await runRg(root, pattern);
  if (rgResult !== undefined) return textResult(rgResult);

  const files = await listMarkdownFiles(root);
  const matches: string[] = [];
  const regex = new RegExp(escapeForRegex(pattern), "i");
  for (const file of files) {
    const text = await Bun.file(join(root, file)).text();
    const lines = text.split("\n");
    lines.forEach((line, index) => {
      if (regex.test(line)) matches.push(`${file}:${index + 1}:${line}`);
    });
  }
  return textResult(matches.join("\n") || "No matches.");
}

async function runRg(root: string, pattern: string): Promise<string | undefined> {
  try {
    const process = Bun.spawn(["rg", "--line-number", "--max-count", "20", "--", pattern, "."], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await process.exited;
    const output = await new Response(process.stdout).text();
    if (exitCode === 0) return output.trim();
    if (exitCode === 1) return "No matches.";
    return undefined;
  } catch {
    return undefined;
  }
}

async function readRelativeFile(root: string, rawPath: string): Promise<ToolExecutionResult> {
  const fileName = basename(rawPath);
  const fullPath = resolve(root, fileName);
  if (!fullPath.startsWith(`${root}/`) && fullPath !== root) {
    throw new Error("Path escapes corpus directory.");
  }
  const content = await Bun.file(fullPath).text();
  return textResult(content);
}

async function listMarkdownFiles(root: string): Promise<string[]> {
  const entries = await readdir(root);
  return entries.filter((entry) => entry.endsWith(".md")).sort();
}

function textResult(content: string): ToolExecutionResult {
  return {
    content,
    retrievedBytes: new TextEncoder().encode(content).length,
    retrievedTokens: estimateTokens(content),
  };
}

function stringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim())
    throw new Error(`Missing string argument: ${key}`);
  return value.trim();
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "_");
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
