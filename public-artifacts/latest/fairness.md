# Fairness controls

Run ID: longmem-final-gpt55
Model: gpt-5.5
Grove API mode: responses
Loop budget: 10
Repetitions: 3
Seed: 42

- Retrieval tools are the only intended difference between backends.
- Filesystem context is represented as session Markdown files and read whole-file after grep.
- MongoDB context is retrieved through direct MongoDB or a memongo-compatible HTTP API.
- Judge cost is tracked separately because it is identical across backends for the same task.
- Ingestion and embedding cost are reported separately and can be amortized by the reader.