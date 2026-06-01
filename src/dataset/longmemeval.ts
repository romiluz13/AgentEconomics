import type { ConversationTurn, MemorySession, TaskSpec } from "../types";

export interface ParsedLongMemEvalEntry {
  task: TaskSpec;
  sessions: MemorySession[];
}

type JsonObject = Record<string, unknown>;

export async function loadLongMemEval(path: string): Promise<ParsedLongMemEvalEntry[]> {
  const text = await Bun.file(path).text();
  const parsed = JSON.parse(text) as unknown;
  return parseLongMemEval(parsed);
}

export function parseLongMemEval(input: unknown): ParsedLongMemEvalEntry[] {
  const rows = normalizeRows(input);
  return rows.map((row, index) => parseEntry(row, index));
}

function normalizeRows(input: unknown): JsonObject[] {
  if (Array.isArray(input)) return input.map(asObject);
  const object = asObject(input);
  const candidate = object.data ?? object.examples ?? object.rows;
  if (Array.isArray(candidate)) return candidate.map(asObject);
  throw new Error("LongMemEval input must be an array or an object with data/examples/rows.");
}

function parseEntry(row: JsonObject, index: number): ParsedLongMemEvalEntry {
  const questionId = readString(row, ["question_id", "questionId", "id"], `q-${index + 1}`);
  const questionType = readString(row, ["question_type", "questionType", "type"], "unknown");
  const question = readRequiredString(row, ["question", "query", "prompt"], questionId);
  const goldAnswer = readRequiredString(
    row,
    ["answer", "gold_answer", "goldAnswer", "target"],
    questionId,
  );
  const rawSessions = readSessions(row);
  const sessionIds = readStringArray(row, [
    "haystack_session_ids",
    "haystackSessionIds",
    "session_ids",
  ]);
  const sessionDates = readStringArray(row, ["haystack_dates", "haystackDates", "session_dates"]);
  const sessions = rawSessions.map((session, sessionIndex) =>
    normalizeSession(
      session,
      questionId,
      sessionIndex,
      sessionIds[sessionIndex],
      sessionDates[sessionIndex],
    ),
  );
  const answerSessionIds = readStringArray(row, [
    "answer_session_ids",
    "answerSessionIds",
    "target_session_ids",
    "evidence_session_ids",
  ]);
  const fallbackAnswerIds =
    sessions.length > 0 ? [sessions[0]?.id ?? `${questionId}-session-1`] : [];

  return {
    task: {
      questionId,
      questionType,
      question,
      goldAnswer,
      answerSessionIds: answerSessionIds.length > 0 ? answerSessionIds : fallbackAnswerIds,
    },
    sessions,
  };
}

function readSessions(row: JsonObject): unknown[] {
  for (const key of [
    "sessions",
    "haystack_sessions",
    "haystackSessions",
    "memory",
    "conversation",
  ]) {
    const value = row[key];
    if (Array.isArray(value)) return value;
  }
  const single = row.session ?? row.haystack;
  return single ? [single] : [];
}

function normalizeSession(
  raw: unknown,
  questionId: string,
  index: number,
  sessionId?: string,
  sessionDate?: string,
): MemorySession {
  if (Array.isArray(raw)) {
    return {
      id: sessionId ?? `${questionId}-session-${index + 1}`,
      sourceQuestionIds: [questionId],
      turns: raw.map((turn) => normalizeTurn(turn)),
      metadata: sessionDate ? { date: sessionDate } : {},
    };
  }
  const object = asObject(raw);
  const id = readString(
    object,
    ["session_id", "sessionId", "id"],
    sessionId ?? `${questionId}-session-${index + 1}`,
  );
  const turns = readTurns(object);
  return {
    id,
    sourceQuestionIds: [questionId],
    turns,
    metadata: readMetadata(object),
  };
}

function readTurns(session: JsonObject): ConversationTurn[] {
  const candidates = [session.turns, session.messages, session.conversation];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map((turn) => normalizeTurn(turn));
    }
  }
  const text = readString(session, ["content", "text", "document"], "");
  return text ? [{ role: "user", content: text }] : [];
}

function normalizeTurn(raw: unknown): ConversationTurn {
  if (typeof raw === "string") return { role: "user", content: raw };
  const object = asObject(raw);
  const role = normalizeRole(readString(object, ["role", "speaker"], "user"));
  return {
    role,
    content: readString(object, ["content", "text", "message"], ""),
    timestamp: readString(object, ["timestamp", "time", "created_at"], undefined),
  };
}

function normalizeRole(role: string): ConversationTurn["role"] {
  const lower = role.toLowerCase();
  if (lower === "assistant" || lower === "system" || lower === "tool") return lower;
  return "user";
}

function readMetadata(object: JsonObject): Record<string, string | number | boolean> {
  const metadata = object.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const output: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(metadata as JsonObject)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      output[key] = value;
    }
  }
  return output;
}

function readString(object: JsonObject, keys: string[], fallback: string | undefined): string {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return fallback ?? "";
}

function readRequiredString(object: JsonObject, keys: string[], questionId: string): string {
  const value = readString(object, keys, "");
  if (!value) throw new Error(`Missing required field ${keys.join("/")} for ${questionId}.`);
  return value;
}

function readStringArray(object: JsonObject, keys: string[]): string[] {
  for (const key of keys) {
    const value = object[key];
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry)).filter(Boolean);
    }
    if (typeof value === "string" && value.trim()) return [value.trim()];
  }
  return [];
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a JSON object.");
  }
  return value as JsonObject;
}
