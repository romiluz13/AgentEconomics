import type { Corpus, MemorySession, TaskSpec } from "../types";
import type { ParsedLongMemEvalEntry } from "./longmemeval";

export function selectStratifiedTasks(
  entries: ParsedLongMemEvalEntry[],
  count: number,
  seed: number,
): TaskSpec[] {
  const groups = new Map<string, TaskSpec[]>();
  for (const entry of entries) {
    const bucket = groups.get(entry.task.questionType) ?? [];
    bucket.push(entry.task);
    groups.set(entry.task.questionType, bucket);
  }

  const shuffledGroups = [...groups.values()]
    .map((tasks) => shuffle(tasks, seed + tasks.length))
    .sort((left, right) => left[0]?.questionType.localeCompare(right[0]?.questionType ?? "") ?? 0);

  const selected: TaskSpec[] = [];
  let cursor = 0;
  while (selected.length < count && shuffledGroups.some((group) => cursor < group.length)) {
    for (const group of shuffledGroups) {
      const task = group[cursor];
      if (task && selected.length < count) selected.push(task);
    }
    cursor += 1;
  }

  return selected;
}

export function buildGlobalSessionPool(entries: ParsedLongMemEvalEntry[]): MemorySession[] {
  const byId = new Map<string, MemorySession>();
  for (const entry of entries) {
    for (const session of entry.sessions) {
      const existing = byId.get(session.id);
      if (!existing) {
        byId.set(session.id, session);
        continue;
      }
      existing.sourceQuestionIds = [
        ...new Set([...existing.sourceQuestionIds, entry.task.questionId]),
      ];
    }
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function buildCorpus(
  entries: ParsedLongMemEvalEntry[],
  tasks: TaskSpec[],
  requestedSize: number,
  seed: number,
): Corpus {
  const pool = buildGlobalSessionPool(entries);
  const sessionById = new Map(pool.map((session) => [session.id, session]));
  const requiredIds = new Set(tasks.flatMap((task) => task.answerSessionIds));
  const answerSessions = [...requiredIds]
    .map((id) => sessionById.get(id))
    .filter((session): session is MemorySession => Boolean(session));

  const answerIds = new Set(answerSessions.map((session) => session.id));
  const distractorCandidates = pool.filter((session) => !answerIds.has(session.id));
  const distractorCount = Math.max(0, requestedSize - answerSessions.length);
  const distractors = shuffle(distractorCandidates, seed + requestedSize).slice(0, distractorCount);
  const sessions = [...answerSessions, ...distractors].sort((left, right) =>
    left.id.localeCompare(right.id),
  );

  return {
    id: `n-${requestedSize}-seed-${seed}`,
    size: sessions.length,
    sessions,
    answerSessionIds: answerSessions.map((session) => session.id),
    distractorSessionIds: distractors.map((session) => session.id),
  };
}

export function renderSessionMarkdown(session: MemorySession): string {
  const metadata = Object.entries(session.metadata ?? {})
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n");
  const turns = session.turns
    .map((turn, index) => {
      const time = turn.timestamp ? ` (${turn.timestamp})` : "";
      return `### ${index + 1}. ${turn.role}${time}\n\n${turn.content.trim()}`;
    })
    .join("\n\n");

  return [
    `# Session ${session.id}`,
    `Source questions: ${session.sourceQuestionIds.join(", ")}`,
    metadata ? `\n## Metadata\n${metadata}` : "",
    `\n## Conversation\n${turns}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function shuffle<T>(items: T[], seed: number): T[] {
  const copy = [...items];
  let state = seed >>> 0;
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = nextRandomState(state);
    const swapIndex = state % (index + 1);
    const current = copy[index];
    const swap = copy[swapIndex];
    if (current !== undefined && swap !== undefined) {
      copy[index] = swap;
      copy[swapIndex] = current;
    }
  }
  return copy;
}

function nextRandomState(state: number): number {
  return (state * 1664525 + 1013904223) >>> 0;
}
