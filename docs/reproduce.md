# Reproduce

## Synthetic Smoke

```bash
bun install
bun run benchmark -- demo --backend filesystem,mongodb --run-id synthetic-smoke
```

## Full Benchmark

```bash
bun run benchmark -- \
  --backend filesystem,mongodb \
  --sizes 10,50,100,300,500 \
  --tasks 20 \
  --repetitions 3 \
  --model gpt-5.5 \
  --judge-model gpt-5.5 \
  --grove-api-mode responses \
  --grove-auth-header api-key \
  --loop-budget 10 \
  --dataset /path/to/longmemeval_s_cleaned.json \
  --mongodb-uri mongodb://127.0.0.1:27017/agent-economics \
  --run-id longmem-final-gpt55
```

Use `--dry-run-estimate` first and set `--max-cost-usd` to bound spend.