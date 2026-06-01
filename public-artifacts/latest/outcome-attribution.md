# Token-to-outcome attribution

This report connects inference spend to completed work. It separates useful outcomes from token leakage caused by retries and inflated context.

## Cost Per Completed Correct Outcome

| Backend | Corpus N | Cost per correct answer | Useful outcome rate | Latency per correct answer |
|---|---:|---:|---:|---:|
| filesystem | 36 | $0.168700 | 73.3% | 9448 ms |
| mongodb | 36 | $0.062021 | 46.7% | 3527 ms |
| filesystem | 50 | $0.167053 | 76.7% | 8376 ms |
| mongodb | 50 | $0.072659 | 43.3% | 3852 ms |
| filesystem | 100 | $0.273042 | 73.3% | 11442 ms |
| mongodb | 100 | $0.074343 | 40.0% | 3309 ms |
| filesystem | 300 | $0.607826 | 75.0% | 11907 ms |
| mongodb | 300 | $0.113019 | 31.7% | 3783 ms |
| filesystem | 500 | $1.231437 | 65.0% | 13353 ms |
| mongodb | 500 | $0.100481 | 30.0% | 3555 ms |

## Token Leakage Signals

| Backend | Corpus N | Retry-tail cost | Retry-tail tokens | Context-inflation cost | Context tokens | Routing candidates |
|---|---:|---:|---:|---:|---:|---:|
| filesystem | 36 | $6.873210 | 1374642 | $2.320120 | 464024 | 0 |
| mongodb | 36 | $1.218650 | 243730 | $0.348855 | 69771 | 0 |
| filesystem | 50 | $7.139500 | 1427900 | $2.473795 | 494759 | 0 |
| mongodb | 50 | $1.348045 | 269609 | $0.371765 | 74353 | 0 |
| filesystem | 100 | $11.422185 | 2284437 | $3.177690 | 635538 | 0 |
| mongodb | 100 | $1.285075 | 257015 | $0.359030 | 71806 | 0 |
| filesystem | 300 | $26.635785 | 5327157 | $4.979925 | 995985 | 0 |
| mongodb | 300 | $1.523640 | 304728 | $0.409780 | 81956 | 0 |
| filesystem | 500 | $47.176895 | 9435379 | $7.578645 | 1515729 | 0 |
| mongodb | 500 | $1.297150 | 259430 | $0.388105 | 77621 | 0 |

## Interpretation

Retry-tail tokens show where the agent needed additional reasoning or tool loops before producing an answer. Context-inflation tokens show how much retrieved or read context was pushed into the trace. Routing candidates are correct single-turn tasks that may be safe to audit on a cheaper model tier.