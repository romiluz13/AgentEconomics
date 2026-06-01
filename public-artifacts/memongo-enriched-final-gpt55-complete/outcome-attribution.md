# Token-to-outcome attribution

This report connects inference spend to completed work. It separates useful outcomes from token leakage caused by retries and inflated context.

## Cost Per Completed Correct Outcome

| Backend | Corpus N | Cost per correct answer | Useful outcome rate | Latency per correct answer |
|---|---:|---:|---:|---:|
| filesystem | 36 | $0.175542 | 76.7% | 12482 ms |
| memongo-context | 36 | $0.076793 | 65.0% | 6093 ms |
| filesystem | 50 | $0.191897 | 70.0% | 10205 ms |
| memongo-context | 50 | $0.077079 | 58.3% | 6802 ms |
| filesystem | 100 | $0.313525 | 68.3% | 12592 ms |
| memongo-context | 100 | $0.066253 | 63.3% | 6839 ms |
| filesystem | 300 | $0.622124 | 73.3% | 15207 ms |
| memongo-context | 300 | $0.090642 | 55.0% | 8831 ms |
| filesystem | 500 | $1.060120 | 65.0% | 14202 ms |
| memongo-context | 500 | $0.099794 | 48.3% | 7579 ms |

## Token Leakage Signals

| Backend | Corpus N | Retry-tail cost | Retry-tail tokens | Context-inflation cost | Context tokens | Routing candidates |
|---|---:|---:|---:|---:|---:|---:|
| filesystem | 36 | $7.500725 | 1500145 | $2.344115 | 468823 | 0 |
| memongo-context | 36 | $2.577485 | 515497 | $1.154765 | 230953 | 0 |
| filesystem | 50 | $7.517055 | 1503411 | $2.364570 | 472914 | 0 |
| memongo-context | 50 | $2.279000 | 455800 | $1.125970 | 225194 | 0 |
| filesystem | 100 | $12.264835 | 2452967 | $3.276935 | 655387 | 0 |
| memongo-context | 100 | $2.119000 | 423800 | $1.115275 | 223055 | 0 |
| filesystem | 300 | $26.594985 | 5318997 | $5.362170 | 1072434 | 0 |
| memongo-context | 300 | $2.541285 | 508257 | $1.149600 | 229920 | 0 |
| filesystem | 500 | $40.487100 | 8097420 | $7.322055 | 1464411 | 0 |
| memongo-context | 500 | $2.425545 | 485109 | $1.190150 | 238030 | 0 |

## Interpretation

Retry-tail tokens show where the agent needed additional reasoning or tool loops before producing an answer. Context-inflation tokens show how much retrieved or read context was pushed into the trace. Routing candidates are correct single-turn tasks that may be safe to audit on a cheaper model tier.