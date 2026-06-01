import type { OutcomeAttribution } from "../types";

export function renderOutcomeAttribution(attribution: OutcomeAttribution[]): string {
  return [
    "# Token-to-outcome attribution",
    "",
    "This report connects inference spend to completed work. It separates useful outcomes from token leakage caused by retries and inflated context.",
    "",
    "## Cost Per Completed Correct Outcome",
    "",
    "| Backend | Corpus N | Cost per correct answer | Useful outcome rate | Latency per correct answer |",
    "|---|---:|---:|---:|---:|",
    ...attribution.map(
      (row) =>
        `| ${row.backend} | ${row.corpusSize} | ${
          row.costPerCorrectAnswer === null ? "n/a" : money(row.costPerCorrectAnswer)
        } | ${percent(row.usefulOutcomeRate)} | ${
          row.latencyPerCorrectAnswerMs === null
            ? "n/a"
            : `${row.latencyPerCorrectAnswerMs.toFixed(0)} ms`
        } |`,
    ),
    "",
    "## Token Leakage Signals",
    "",
    "| Backend | Corpus N | Retry-tail cost | Retry-tail tokens | Context-inflation cost | Context tokens | Routing candidates |",
    "|---|---:|---:|---:|---:|---:|---:|",
    ...attribution.map(
      (row) =>
        `| ${row.backend} | ${row.corpusSize} | ${money(row.retryTailCost)} | ${row.retryTailTokens} | ${money(
          row.contextInflationCost,
        )} | ${row.contextInflationTokens} | ${row.routingOpportunity?.eligibleTasks ?? 0} |`,
    ),
    "",
    "## Interpretation",
    "",
    "Retry-tail tokens show where the agent needed additional reasoning or tool loops before producing an answer. Context-inflation tokens show how much retrieved or read context was pushed into the trace. Routing candidates are correct single-turn tasks that may be safe to audit on a cheaper model tier.",
  ].join("\n");
}

function money(value: number): string {
  return `$${value.toFixed(6)}`;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
