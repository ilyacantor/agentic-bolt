# DCL Bounded-Autonomy Demo (Replit-ready)

**Goal:** When you drop a new dataset (CSV/Parquet) into `./sample` or `./data`, the agent:
1) Introspects schema + samples
2) Calls a REAL LLM (OpenAI) to propose mappings to the canonical ontology in `ontology/catalog.yml`
3) Runs richer validation (types, PK/FK, email/date sanity, join explosion)
4) Publishes **DuckDB SQL views** (`dcl_customer`, `dcl_order`) automatically if confidence is high enough; otherwise publishes partial views and logs issues

This is a **POC** per our guardrails (fastest path, no UI).

---

## Quick Start (Replit)
1. Create a new **Python** Repl.
2. Upload all files from this folder.
3. Add your OpenAI key in the Replit Secrets tab: `OPENAI_API_KEY`.
4. `pip install -r requirements.txt`
5. `python demo.py`

Now drag more CSVs into `sample/` or create a `data/` folder and drop files there. The agent polls every few seconds and will map & publish views automatically.

---

## What it Publishes
- `dcl_customer`
- `dcl_order`

Run inside a Python shell or add simple prints:
```python
import duckdb
con = duckdb.connect("registry.duckdb")
print(con.sql("SELECT * FROM dcl_customer LIMIT 5").df())
print(con.sql("SELECT * FROM dcl_order LIMIT 5").df())
```

---

## Guardrails (applied)
- **POC vs MVP vs Vision:** This is **POC** (single script, no UI).
- **Transparency:** Real LLM calls; if LLM JSON is malformed, a deterministic fallback tries heuristics.
- **Validation:** PK uniqueness, FK resolution, type/semantic checks (email regex, timestamp parse), and join-explosion guard.
- **Autonomy bias:** Will **auto-publish partial** mappings to avoid blocking; logs issues for later review.

---

## Config
- Ontology: `ontology/catalog.yml`
- Data directories watched: `sample/` and `data/`

---

## Troubleshooting
- If you see LLM JSON parse errors, the script will retry once and then fall back to heuristics.
- If no views appear, check `registry.log` and ensure your CSVs have headers.
- To reset the demo, delete `registry.duckdb` and re-run.

Enjoy!
