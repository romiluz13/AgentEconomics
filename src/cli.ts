import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type DryRunEstimate, estimateBenchmarkCost } from "./artifacts/estimate";
import {
  createRunManifest,
  createTasksetArtifact,
  finalizeManifest,
  type RunManifest,
  type TasksetArtifact,
} from "./artifacts/manifest";
import { publicConfig, writePublicArtifacts } from "./artifacts/redaction";
import { FilesystemBackend } from "./backends/filesystem";
import { MongoDbBackend } from "./backends/mongodb";
import type { Backend } from "./backends/types";
import { parseArgs, requireLiveModelConfig } from "./config";
import { loadPricing } from "./cost/pricing";
import { buildCorpus, selectStratifiedTasks } from "./dataset/corpus";
import { loadLongMemEval } from "./dataset/longmemeval";
import { aggregateResults } from "./report/aggregate";
import {
  renderCostWaterfallSvg,
  renderScalingCliffSvg,
  renderTraceComparisonSvg,
} from "./report/chart";
import { renderMethodologyDoc, renderReproduceDoc, renderResultsDoc } from "./report/docs";
import { renderFairness, renderMarkdownReport } from "./report/markdown";
import { renderOutcomeAttribution } from "./report/outcome-attribution";
import { buildStatisticsReport, type StatisticsReport } from "./report/statistics";
import { failureRecord, runOneTask } from "./runner/task-runner";
import { attributeOutcomes } from "./trace/attribution";
import { writeTraceJsonl } from "./trace/events";
import type {
  BackendId,
  BenchmarkConfig,
  FailureRecord,
  PricingTable,
  RunResult,
  TraceEvent,
} from "./types";

export async function main(argv = Bun.argv.slice(2)): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(helpText());
    return;
  }

  const startedAt = new Date().toISOString();
  const config = parseArgs(argv);
  requireLiveModelConfig(config);
  const resolvedPricingPath = resolve(config.pricingPath);
  const resolvedDatasetPath = resolve(datasetPath(config));
  const pricing = await loadPricing(resolvedPricingPath);
  const entries = await loadLongMemEval(resolvedDatasetPath);
  const tasks = selectStratifiedTasks(entries, config.tasks, config.seed);
  if (tasks.length === 0) throw new Error("No tasks selected from dataset.");

  const artifactDir = resolve(config.outDir, config.runId);
  const runDir = resolve(".runs", config.runId);
  const publicDir = resolve("public-artifacts", config.runId);
  const publicLatestDir = resolve("public-artifacts", "latest");
  await mkdir(artifactDir, { recursive: true });
  await mkdir(runDir, { recursive: true });
  await mkdir(publicDir, { recursive: true });
  await mkdir(publicLatestDir, { recursive: true });

  const failures: FailureRecord[] = [];
  const taskset = createTasksetArtifact(config.runId, config.seed, tasks);
  const dryRunEstimate = estimateBenchmarkCost({ config, entries, tasks, pricing });
  await writeJson(resolve(artifactDir, "dry-run-estimate.json"), dryRunEstimate);
  if (config.dryRunEstimate) {
    await writeJson(resolve(artifactDir, "config.json"), publicConfig(config));
    await writeJson(resolve(artifactDir, "taskset.json"), taskset);
    console.log(`Dry-run estimate: $${dryRunEstimate.estimatedUpperBoundUsd.toFixed(6)}`);
    console.log(`Wrote estimate artifacts to ${artifactDir}`);
    return;
  }
  assertWithinCostLimit(config, dryRunEstimate);

  const results: RunResult[] = [];
  const allTraceEvents: TraceEvent[] = [];
  let spentUsd = 0;
  let stopAllRuns = false;

  for (const size of config.sizes) {
    if (stopAllRuns) break;
    const corpus = buildCorpus(entries, tasks, size, config.seed);
    for (const backendId of config.backends) {
      if (stopAllRuns) break;
      const backend = createBackend(backendId, config, pricing);
      const context = await backend.setup(corpus, runDir).catch((error: unknown) => {
        failures.push(
          failureRecord("backend_setup_failure", error, {
            backend: backendId,
            corpusSize: corpus.size,
          }),
        );
        return undefined;
      });
      if (!context) continue;
      try {
        for (let repetition = 1; repetition <= config.repetitions; repetition += 1) {
          for (const task of tasks) {
            if (stopAllRuns) break;
            const result = await runOneTask({
              backendId,
              task,
              repetition,
              corpusSize: corpus.size,
              config,
              pricing,
              tools: context.tools,
              ingestionCostUsd: context.ingestionCost.costUsd,
              failures,
            });
            results.push(result);
            allTraceEvents.push(...result.traceEvents);
            spentUsd += result.costUsd + result.judgeCostUsd;
            if (config.maxCostUsd !== undefined && spentUsd > config.maxCostUsd) {
              failures.push(
                failureRecord(
                  "max_cost_exceeded",
                  `Actual spend $${spentUsd.toFixed(6)} exceeded --max-cost-usd ${config.maxCostUsd}.`,
                  {
                    backend: backendId,
                    corpusSize: corpus.size,
                    taskId: task.questionId,
                    repetition,
                  },
                ),
              );
              stopAllRuns = true;
            }
          }
        }
      } finally {
        await context.teardown();
      }
    }
  }

  const manifest = finalizeManifest(
    await createRunManifest({
      config,
      argv,
      datasetPath: resolvedDatasetPath,
      pricingPath: resolvedPricingPath,
      startedAt,
      failures,
    }),
    new Date().toISOString(),
  );
  await writeArtifacts({
    config,
    pricing,
    results,
    traceEvents: allTraceEvents,
    artifactDir,
    publicDir,
    publicLatestDir,
    manifest,
    taskset,
    failures,
    dryRunEstimate,
  });
  console.log(`Wrote artifacts to ${artifactDir}`);
}

function createBackend(
  backendId: BackendId,
  config: BenchmarkConfig,
  pricing: PricingTable,
): Backend {
  if (backendId === "filesystem") return new FilesystemBackend();
  return new MongoDbBackend({
    memongoBaseUrl: config.memongoBaseUrl,
    mongodbUri: config.mongodbUri,
    pricing,
  });
}

function assertWithinCostLimit(config: BenchmarkConfig, estimate: DryRunEstimate): void {
  if (config.maxCostUsd === undefined) return;
  if (estimate.estimatedUpperBoundUsd <= config.maxCostUsd) return;
  throw new Error(
    `Dry-run estimate $${estimate.estimatedUpperBoundUsd.toFixed(
      6,
    )} exceeds --max-cost-usd ${config.maxCostUsd}. Increase the limit or reduce the run matrix.`,
  );
}

async function writeArtifacts(options: {
  config: BenchmarkConfig;
  pricing: PricingTable;
  results: RunResult[];
  traceEvents: TraceEvent[];
  artifactDir: string;
  publicDir: string;
  publicLatestDir: string;
  manifest: RunManifest;
  taskset: TasksetArtifact;
  failures: FailureRecord[];
  dryRunEstimate: DryRunEstimate;
}): Promise<void> {
  const aggregates = aggregateResults(options.results);
  const attribution = attributeOutcomes(options.results, options.pricing, options.config.model);
  const statistics = buildStatisticsReport(options.results, options.failures);
  const fairness = renderFairness(options.config);
  const report = renderMarkdownReport(options.config, aggregates, attribution);
  const scalingCliffSvg = renderScalingCliffSvg(aggregates);
  const costWaterfallSvg = renderCostWaterfallSvg(attribution);
  const traceComparisonSvg = renderTraceComparisonSvg(options.traceEvents);

  await writeJson(resolve(options.artifactDir, "config.json"), publicConfig(options.config));
  await writeJson(resolve(options.artifactDir, "run-manifest.json"), options.manifest);
  await writeJson(resolve(options.artifactDir, "taskset.json"), options.taskset);
  await writeJson(resolve(options.artifactDir, "dry-run-estimate.json"), options.dryRunEstimate);
  await writeJson(resolve(options.artifactDir, "statistics.json"), statistics);
  await writeJson(resolve(options.artifactDir, "results.json"), {
    results: options.results,
    aggregates,
    attribution,
    failures: options.failures,
  });
  await writeTraceJsonl(resolve(options.artifactDir, "traces.jsonl"), options.traceEvents);
  await writeFile(resolve(options.artifactDir, "report.md"), report);
  await writeFile(
    resolve(options.artifactDir, "outcome-attribution.md"),
    renderOutcomeAttribution(attribution),
  );
  await writeFile(resolve(options.artifactDir, "fairness.md"), fairness);
  await writeFile(resolve(options.artifactDir, "scaling-cliff.svg"), scalingCliffSvg);
  await writeFile(resolve(options.artifactDir, "cost-waterfall.svg"), costWaterfallSvg);
  await writeFile(resolve(options.artifactDir, "trace-comparison.svg"), traceComparisonSvg);
  await writePublicArtifacts({
    publicDir: options.publicDir,
    config: publicConfig(options.config),
    manifest: options.manifest,
    taskset: options.taskset,
    statistics,
    attribution,
    fairness,
    report,
    scalingCliffSvg,
    costWaterfallSvg,
    traceComparisonSvg,
    traceEvents: options.traceEvents,
  });
  await writePublicArtifacts({
    publicDir: options.publicLatestDir,
    config: publicConfig(options.config),
    manifest: options.manifest,
    taskset: options.taskset,
    statistics,
    attribution,
    fairness,
    report,
    scalingCliffSvg,
    costWaterfallSvg,
    traceComparisonSvg,
    traceEvents: options.traceEvents,
  });
  await writeDocs(
    statistics,
    options.config.runId,
    scalingCliffSvg,
    costWaterfallSvg,
    traceComparisonSvg,
  );
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeDocs(
  statistics: StatisticsReport,
  runId: string,
  scalingCliffSvg: string,
  costWaterfallSvg: string,
  traceComparisonSvg: string,
): Promise<void> {
  await mkdir(resolve("docs", "assets"), { recursive: true });
  await writeFile(resolve("docs", "methodology.md"), renderMethodologyDoc());
  await writeFile(resolve("docs", "reproduce.md"), renderReproduceDoc(runId));
  await writeFile(resolve("docs", "results.md"), renderResultsDoc(statistics));
  await writeFile(resolve("docs", "assets", "scaling-cliff.svg"), scalingCliffSvg);
  await writeFile(resolve("docs", "assets", "cost-waterfall.svg"), costWaterfallSvg);
  await writeFile(resolve("docs", "assets", "trace-comparison.svg"), traceComparisonSvg);
}

function datasetPath(config: BenchmarkConfig): string {
  if (config.datasetPath) return config.datasetPath;
  if (config.demo) {
    return fileURLToPath(new URL("../tests/fixtures/synthetic-longmemeval.json", import.meta.url));
  }
  throw new Error("Pass --dataset /path/to/longmemeval_s_cleaned.json or use demo mode.");
}

export function helpText(): string {
  return [
    "AgentEconomics",
    "",
    "Usage:",
    "  bun run src/cli.ts demo",
    "  bun run src/cli.ts -- --backend filesystem,mongodb --dataset ./longmemeval_s_cleaned.json",
    "",
    "Options:",
    "  --backend filesystem,mongodb",
    "  --sizes 10,50,100,300,500",
    "  --tasks 20",
    "  --repetitions 3",
    "  --max-cost-usd 25",
    "  --dry-run-estimate",
    "  --model gpt-5.5",
    "  --judge-model gpt-5.5",
    "  --loop-budget 10",
    "  --dataset /path/to/longmemeval_s_cleaned.json",
    "  --out ./artifacts",
    "  --run-id run-2026-06-01",
    "  --seed 42",
    "  --pricing ./pricing.json",
    "  --memongo-base-url http://127.0.0.1:3847",
    "  --mongodb-uri mongodb://127.0.0.1:27017/agent-economics",
    "  --grove-base-url https://grove-gateway-prod.azure-api.net/grove-foundry-prod/openai/v1",
    "  --grove-auth-header api-key",
    "  --grove-api-mode responses",
    "  --grove-api-key env-or-literal-key",
    "  --mock-model",
  ].join("\n");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
