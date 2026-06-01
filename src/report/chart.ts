import type { OutcomeAttribution, TraceEvent } from "../types";
import type { AggregateRow } from "./aggregate";

export function renderScalingCliffSvg(rows: AggregateRow[]): string {
  const width = 720;
  const height = 420;
  const margin = 56;
  const data = rows.map((row) => ({
    backend: row.backend,
    x: row.corpusSize,
    y: row.meanCostUsd,
  }));
  const maxX = Math.max(1, ...data.map((point) => point.x));
  const maxY = Math.max(0.000001, ...data.map((point) => point.y));
  const backends = [...new Set(data.map((point) => point.backend))];
  const lines = backends.map((backend) => {
    const points = data
      .filter((point) => point.backend === backend)
      .sort((left, right) => left.x - right.x)
      .map(
        (point) =>
          `${scaleX(point.x, maxX, width, margin)},${scaleY(point.y, maxY, height, margin)}`,
      )
      .join(" ");
    return `<polyline fill="none" stroke="currentColor" stroke-width="2" points="${points}" />`;
  });
  const labels = data.map(
    (point) =>
      `<text x="${scaleX(point.x, maxX, width, margin)}" y="${scaleY(point.y, maxY, height, margin) - 8}" font-size="11">${escapeXml(
        `${point.backend} $${point.y.toFixed(5)}`,
      )}</text>`,
  );

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Cost per task versus corpus size">`,
    `<rect width="${width}" height="${height}" fill="white" />`,
    `<g color="black" font-family="Arial, sans-serif">`,
    `<line x1="${margin}" y1="${height - margin}" x2="${width - margin}" y2="${height - margin}" stroke="currentColor" />`,
    `<line x1="${margin}" y1="${margin}" x2="${margin}" y2="${height - margin}" stroke="currentColor" />`,
    `<text x="${width / 2 - 80}" y="${height - 16}" font-size="13">Corpus size (sessions)</text>`,
    `<text x="16" y="${margin - 20}" font-size="13">Mean cost per task</text>`,
    ...lines,
    ...labels,
    `</g>`,
    `</svg>`,
  ].join("\n");
}

export function renderCostWaterfallSvg(rows: OutcomeAttribution[]): string {
  const width = 760;
  const height = 420;
  const margin = 56;
  const latestSize = Math.max(0, ...rows.map((row) => row.corpusSize));
  const data = rows
    .filter((row) => row.corpusSize === latestSize)
    .flatMap((row) => [
      { label: `${row.backend} task`, value: row.costPerTask },
      { label: `${row.backend} retry`, value: row.retryTailCost },
      { label: `${row.backend} context`, value: row.contextInflationCost },
    ]);
  const maxY = Math.max(0.000001, ...data.map((point) => point.value));
  const barWidth = Math.max(24, (width - margin * 2) / Math.max(1, data.length) - 12);
  const bars = data.map((point, index) => {
    const x = margin + index * (barWidth + 12);
    const y = scaleY(point.value, maxY, height, margin);
    const barHeight = height - margin - y;
    return [
      `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="currentColor" opacity="0.7" />`,
      `<text x="${x}" y="${height - 30}" font-size="10" transform="rotate(25 ${x} ${height - 30})">${escapeXml(
        point.label,
      )}</text>`,
      `<text x="${x}" y="${y - 6}" font-size="10">${escapeXml(`$${point.value.toFixed(6)}`)}</text>`,
    ].join("\n");
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Token cost waterfall">`,
    `<rect width="${width}" height="${height}" fill="white" />`,
    `<g color="black" font-family="Arial, sans-serif">`,
    `<text x="${margin}" y="30" font-size="16">Cost waterfall at largest corpus N=${latestSize}</text>`,
    `<line x1="${margin}" y1="${height - margin}" x2="${width - margin}" y2="${height - margin}" stroke="currentColor" />`,
    `<line x1="${margin}" y1="${margin}" x2="${margin}" y2="${height - margin}" stroke="currentColor" />`,
    ...bars,
    `</g>`,
    `</svg>`,
  ].join("\n");
}

export function renderTraceComparisonSvg(events: TraceEvent[]): string {
  const width = 760;
  const height = 360;
  const backends = ["filesystem", "mongodb"] as const;
  const rows = backends.map((backend) => ({
    backend,
    modelTurns: events.filter((event) => event.backend === backend && event.kind === "model")
      .length,
    retrievals: events.filter((event) => event.backend === backend && event.kind === "retrieval")
      .length,
    retries: events.filter((event) => event.backend === backend && event.kind === "retry").length,
    retrievedTokens: events
      .filter((event) => event.backend === backend)
      .reduce((total, event) => total + (event.retrievedTokens ?? 0), 0),
  }));
  const max = Math.max(
    1,
    ...rows.flatMap((row) => [
      row.modelTurns,
      row.retrievals,
      row.retries,
      row.retrievedTokens / 100,
    ]),
  );
  const yPositions = [88, 180];
  const blocks = rows.flatMap((row, rowIndex) => {
    const y = yPositions[rowIndex] ?? 88;
    return [
      `<text x="40" y="${y}" font-size="14">${row.backend}</text>`,
      metricBar("model turns", row.modelTurns, max, 190, y - 20),
      metricBar("retrievals", row.retrievals, max, 190, y + 10),
      metricBar("retries", row.retries, max, 190, y + 40),
      metricBar("retrieved tokens / 100", row.retrievedTokens / 100, max, 190, y + 70),
    ];
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Trace comparison">`,
    `<rect width="${width}" height="${height}" fill="white" />`,
    `<g color="black" font-family="Arial, sans-serif">`,
    `<text x="40" y="36" font-size="16">Redacted Trace Comparison</text>`,
    ...blocks,
    `</g>`,
    `</svg>`,
  ].join("\n");
}

function scaleX(value: number, max: number, width: number, margin: number): number {
  return margin + (value / max) * (width - margin * 2);
}

function scaleY(value: number, max: number, height: number, margin: number): number {
  return height - margin - (value / max) * (height - margin * 2);
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (char) => {
    const replacements: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;",
    };
    return replacements[char] ?? char;
  });
}

function metricBar(label: string, value: number, max: number, x: number, y: number): string {
  const width = (value / max) * 360;
  return [
    `<text x="${x}" y="${y + 12}" font-size="11">${escapeXml(label)}</text>`,
    `<rect x="${x + 130}" y="${y}" width="${width}" height="16" fill="currentColor" opacity="0.7" />`,
    `<text x="${x + 500}" y="${y + 12}" font-size="11">${escapeXml(value.toFixed(value % 1 === 0 ? 0 : 1))}</text>`,
  ].join("\n");
}
