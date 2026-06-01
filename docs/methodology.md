# Methodology

AgentEconomics measures cost per completed correct outcome, not raw token usage.

## Controlled Variables

- Same task set, corpus seed, model, Grove API mode, loop budget, and judge for every backend.
- Same LongMemEval-S source file is used locally; the raw dataset is never committed.
- Grove Responses requests use `store: false` and no temperature for `gpt-5.5` because the endpoint rejects temperature.
- MongoDB Docker runs are described as MongoDB indexed retrieval, not Atlas Vector Search.

## Measurement

- Agent inference cost and judge cost are separated.
- Ingestion cost is reported separately and can be amortized by workload volume.
- Retry-tail tokens are tokens after the first model turn.
- Context-inflation tokens are retrieved/read tokens recorded in trace events.
- Statistics are paired by task ID, corpus size, and repetition.