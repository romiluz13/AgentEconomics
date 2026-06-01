# Fairness controls

Run ID: memongo-enriched-final-gpt55-complete
Model: gpt-5.5
Grove API mode: responses
Loop budget: 10
Repetitions: 3
Seed: 42

- Retrieval tools are the only intended difference between backends.
- Filesystem context is represented as session Markdown files and read whole-file after grep.
- Memongo context is retrieved through a pinned external memongo HTTP sidecar.
- Direct MongoDB text indexing is labeled `mongodb-text` and treated as a diagnostic baseline only.
- Judge cost is tracked separately because it is identical across backends for the same task.
- Ingestion and embedding cost are reported separately and can be amortized by the reader.