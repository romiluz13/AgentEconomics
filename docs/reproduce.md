# Reproduce

## Synthetic Smoke

```bash
bun install
bun run benchmark -- demo --backend filesystem,memongo-context --memongo-base-url http://127.0.0.1:3847 --run-id synthetic-smoke
```

## Memongo Sidecar

Run memongo from a pinned checkout before live benchmarks. AgentEconomics talks to it only through `MEMONGO_BASE_URL` and does not vendor or modify memongo source.

## Full Benchmark

```bash
bun run benchmark -- \
  --backend filesystem,memongo-context \
  --sizes 10,50,100,300,500 \
  --tasks 20 \
  --repetitions 3 \
  --model gpt-5.5 \
  --judge-model gpt-5.5 \
  --grove-api-mode responses \
  --grove-auth-header api-key \
  --loop-budget 10 \
  --dataset /path/to/longmemeval_s_cleaned.json \
  --memongo-base-url http://127.0.0.1:3847 \
  --memongo-enrichment-mode enabled \
  --memongo-query-decomposition-mode enabled \
  --memongo-enrichment-model DeepSeek-V4-Pro \
  --memongo-repo https://github.com/romiluz13/Memongo \
  --memongo-commit <pinned-commit> \
  --run-id memongo-enriched-final-gpt55-complete
```

Use `--dry-run-estimate` first and set `--max-cost-usd` to bound spend.