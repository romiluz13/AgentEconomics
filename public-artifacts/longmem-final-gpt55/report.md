# AgentEconomics report

## Executive Summary

Lowest observed cost per correct answer: $0.062021 on mongodb at N=36.
Largest corpus measured: N=500, with 60 run(s) per listed backend.

## Headline Metrics

| Backend | Corpus N | Runs | Accuracy | Mean cost | Median cost | Mean turns | Mean input tokens |
|---|---:|---:|---:|---:|---:|---:|---:|
| filesystem | 36 | 60 | 73.3% | $0.123714 | $0.053560 | 4.33 | 22863 |
| mongodb | 36 | 60 | 46.7% | $0.028943 | $0.015800 | 3.30 | 4019 |
| filesystem | 50 | 60 | 76.7% | $0.128074 | $0.062273 | 4.25 | 23754 |
| mongodb | 50 | 60 | 43.3% | $0.031486 | $0.016370 | 3.40 | 4436 |
| filesystem | 100 | 60 | 73.3% | $0.200231 | $0.085410 | 4.38 | 37993 |
| mongodb | 100 | 60 | 40.0% | $0.029737 | $0.012070 | 3.30 | 4248 |
| filesystem | 300 | 60 | 75.0% | $0.455869 | $0.131208 | 4.93 | 88628 |
| mongodb | 300 | 60 | 31.7% | $0.035789 | $0.013737 | 3.65 | 4965 |
| filesystem | 500 | 60 | 65.0% | $0.800434 | $0.206160 | 5.48 | 157009 |
| mongodb | 500 | 60 | 30.0% | $0.030144 | $0.017253 | 3.43 | 4285 |

## Fairness Disclosure

- Model: gpt-5.5
- Judge model: gpt-5.5
- Grove API mode: responses
- Loop budget: 10
- Repetitions: 3
- Backends: filesystem, mongodb
- Same task set, corpus object, system prompt skeleton, model endpoint mode, and judge are used for every backend.
- Temperature is fixed only for providers/endpoints that support it; Grove Responses for gpt-5.5 rejects temperature and is documented in config.json.
- Filesystem uses list/grep/read over whole Markdown files after matching.
- MongoDB/memongo ingestion cost is reported separately from per-task inference cost.

## Attribution

| Backend | Corpus N | Cost per task | Cost per correct answer | Retry-tail tokens | Context tokens | Useful outcome rate |
|---|---:|---:|---:|---:|---:|---:|
| filesystem | 36 | $0.123714 | $0.168700 | 1374642 | 464024 | 73.3% |
| mongodb | 36 | $0.028943 | $0.062021 | 243730 | 69771 | 46.7% |
| filesystem | 50 | $0.128074 | $0.167053 | 1427900 | 494759 | 76.7% |
| mongodb | 50 | $0.031486 | $0.072659 | 269609 | 74353 | 43.3% |
| filesystem | 100 | $0.200231 | $0.273042 | 2284437 | 635538 | 73.3% |
| mongodb | 100 | $0.029737 | $0.074343 | 257015 | 71806 | 40.0% |
| filesystem | 300 | $0.455869 | $0.607826 | 5327157 | 995985 | 75.0% |
| mongodb | 300 | $0.035789 | $0.113019 | 304728 | 81956 | 31.7% |
| filesystem | 500 | $0.800434 | $1.231437 | 9435379 | 1515729 | 65.0% |
| mongodb | 500 | $0.030144 | $0.100481 | 259430 | 77621 | 30.0% |
