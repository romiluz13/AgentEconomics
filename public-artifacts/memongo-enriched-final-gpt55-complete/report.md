# AgentEconomics report

## Executive Summary

Lowest observed cost per correct answer: $0.066253 on memongo-context at N=100.
Largest corpus measured: N=500, with 60 run(s) per listed backend.

## Headline Metrics

| Backend | Corpus N | Runs | Accuracy | Mean cost | Median cost | Mean turns | Mean input tokens |
|---|---:|---:|---:|---:|---:|---:|---:|
| filesystem | 36 | 60 | 76.7% | $0.134582 | $0.053350 | 4.32 | 24939 |
| memongo-context | 36 | 60 | 65.0% | $0.049916 | $0.029155 | 2.27 | 8614 |
| filesystem | 50 | 60 | 70.0% | $0.134328 | $0.054285 | 4.37 | 25014 |
| memongo-context | 50 | 60 | 58.3% | $0.044963 | $0.028685 | 2.25 | 7619 |
| filesystem | 100 | 60 | 68.3% | $0.214242 | $0.080935 | 4.47 | 40804 |
| memongo-context | 100 | 60 | 63.3% | $0.041960 | $0.027760 | 2.23 | 7099 |
| filesystem | 300 | 60 | 73.3% | $0.456224 | $0.127092 | 4.95 | 88451 |
| memongo-context | 300 | 60 | 55.0% | $0.049853 | $0.028978 | 2.28 | 8472 |
| filesystem | 500 | 60 | 65.0% | $0.689078 | $0.200605 | 5.50 | 134705 |
| memongo-context | 500 | 60 | 48.3% | $0.048234 | $0.030070 | 2.33 | 8074 |

## Fairness Disclosure

- Model: gpt-5.5
- Judge model: gpt-5.5
- Grove API mode: responses
- Loop budget: 10
- Repetitions: 3
- Backends: filesystem, memongo-context
- Same task set, corpus object, system prompt skeleton, model endpoint mode, and judge are used for every backend.
- Temperature is fixed only for providers/endpoints that support it; Grove Responses for gpt-5.5 rejects temperature and is documented in config.json.
- Filesystem uses list/grep/read over whole Markdown files after matching.
- `memongo-context` uses the external memongo `/v1/context-bundle` API; `memongo-search` uses `/v1/search-detailed`.
- `mongodb-text` is a naive direct MongoDB text-index diagnostic baseline, not memongo.
- Memongo ingestion cost is estimated and reported separately from per-task inference cost.

## Attribution

| Backend | Corpus N | Cost per task | Cost per correct answer | Retry-tail tokens | Context tokens | Useful outcome rate |
|---|---:|---:|---:|---:|---:|---:|
| filesystem | 36 | $0.134582 | $0.175542 | 1500145 | 468823 | 76.7% |
| memongo-context | 36 | $0.049916 | $0.076793 | 515497 | 230953 | 65.0% |
| filesystem | 50 | $0.134328 | $0.191897 | 1503411 | 472914 | 70.0% |
| memongo-context | 50 | $0.044963 | $0.077079 | 455800 | 225194 | 58.3% |
| filesystem | 100 | $0.214242 | $0.313525 | 2452967 | 655387 | 68.3% |
| memongo-context | 100 | $0.041960 | $0.066253 | 423800 | 223055 | 63.3% |
| filesystem | 300 | $0.456224 | $0.622124 | 5318997 | 1072434 | 73.3% |
| memongo-context | 300 | $0.049853 | $0.090642 | 508257 | 229920 | 55.0% |
| filesystem | 500 | $0.689078 | $1.060120 | 8097420 | 1464411 | 65.0% |
| memongo-context | 500 | $0.048234 | $0.099794 | 485109 | 238030 | 48.3% |
