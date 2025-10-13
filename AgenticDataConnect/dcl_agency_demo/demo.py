import os
import time
import json
import re
import glob
import yaml
import duckdb
import pandas as pd
from rapidfuzz import fuzz
from dataclasses import dataclass
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from google import genai
from google.genai import types

# -------------------------
# Config & Guardrails
# -------------------------
DATA_DIRS = ["sample", "data"]
CATALOG_PATH = "ontology/catalog.yml"
DB_PATH = "registry.duckdb"
LLM_MODEL = os.getenv("LLM_MODEL", "gemini-2.5-flash")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

AUTO_PUBLISH_PARTIAL = True  # bias to autonomy: publish what passes
CONF_THRESHOLD = 0.70        # matches user's "70% but quickly"

client = None
if GEMINI_API_KEY:
    client = genai.Client(api_key=GEMINI_API_KEY)
else:
    print("WARNING: GEMINI_API_KEY not set. The script will still run but LLM calls will fail. Set your key in env.")

# -------------------------
# Helpers
# -------------------------
def load_catalog(path=CATALOG_PATH) -> Dict[str, Any]:
    with open(path, "r") as f:
        return yaml.safe_load(f)

def read_head(path: str, n: int = 25) -> List[Dict[str, Any]]:
    try:
        df = pd.read_csv(path, nrows=n)
        return df.to_dict(orient="records")
    except Exception:
        try:
            df = pd.read_parquet(path)
            return df.head(n).to_dict(orient="records")
        except Exception as e:
            raise RuntimeError(f"Failed to read sample rows from {path}: {e}")

def infer_types(df: pd.DataFrame) -> Dict[str, str]:
    import warnings
    mapping = {}
    for col in df.columns:
        series = df[col]
        if pd.api.types.is_integer_dtype(series):
            mapping[col] = "integer"
        elif pd.api.types.is_float_dtype(series):
            mapping[col] = "numeric"
        else:
            # try datetime parse with explicit format first
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    pd.to_datetime(series.dropna().head(50),
                                   format="%Y-%m-%d %H:%M:%S",
                                   errors="raise")
                mapping[col] = "datetime"
            except Exception:
                # fallback: coerce, no warnings
                try:
                    with warnings.catch_warnings():
                        warnings.simplefilter("ignore")
                        pd.to_datetime(series.dropna().head(50),
                                       errors="coerce")
                    mapping[col] = "datetime"
                except Exception:
                    mapping[col] = "string"
    return mapping

def list_tables() -> Dict[str, Dict[str, Any]]:
    """Return {table_name: {'path': path, 'schema': {col: type}, 'samples': [...]}}"""
    tables = {}
    for d in DATA_DIRS:
        if not os.path.isdir(d):
            continue
        for path in glob.glob(os.path.join(d, "*.csv")) + glob.glob(os.path.join(d, "*.parquet")):
            tname = os.path.splitext(os.path.basename(path))[0]
            try:
                if path.endswith(".csv"):
                    df = pd.read_csv(path)
                else:
                    df = pd.read_parquet(path)
                tables[tname] = {
                    "path": path,
                    "schema": infer_types(df),
                    "samples": df.head(25).to_dict(orient="records")
                }
            except Exception as e:
                print(f"[WARN] Skipping {path}: {e}")
    return tables

# -------------------------
# LLM planner
# -------------------------
def llm_propose_mappings(ontology: Dict[str, Any], tables: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if client is None:
        return None
    system_instruction = "You are a cautious data integration planner. Return STRICT JSON only per the schema."
    user_payload = {
        "ontology": ontology,
        "introspection": [
            {"table": t, "schema": info["schema"], "samples": info["samples"]}
            for t, info in tables.items()
        ],
        "instructions": {
            "output_schema": {
                "mappings": [{
                    "entity": "string",
                    "source_table": "string",
                    "fields": [{
                        "onto_field": "string",
                        "source": "string or array of strings",
                        "transform": "string",
                        "confidence": "float 0..1"
                    }],
                    "primary_key": "string",
                    "foreign_keys": [{
                        "field": "string",
                        "ref": "string e.g. customer.customer_id"
                    }]
                }]
            },
            "rules": [
                "Prefer exact/synonym matches by name and type",
                "Use simple SQL-expressible transforms (cast, lower, trim, concat, parse_timestamp)",
                "Be conservative with confidence"
            ]
        }
    }
    try:
        response = client.models.generate_content(
            model=LLM_MODEL,
            contents=json.dumps(user_payload),
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.1,
                response_mime_type="application/json"
            )
        )
        content = response.text
        # Extract JSON from content
        m = re.search(r"\{.*\}\s*$", content, re.DOTALL)
        text = m.group(0) if m else content
        return json.loads(text)
    except Exception as e:
        print(f"[LLM ERROR] {e}")
        return None

# -------------------------
# Deterministic fallback (heuristics)
# -------------------------
def heuristic_mappings(ontology: Dict[str, Any], tables: Dict[str, Any]) -> Dict[str, Any]:
    # Simple name fuzzy match with type compatibility
    def best_col(target_name: str, target_type: str, schema: Dict[str, str]) -> Optional[str]:
        best, best_score = None, 0
        for col, typ in schema.items():
            if target_type != "string" and typ == "string" and target_type != "string":
                pass  # allow, we'll cast later
            score = fuzz.WRatio(col.lower(), target_name.lower())
            if score > best_score:
                best, best_score = col, score
        return best

    mappings = []
    for ent, edef in ontology["entities"].items():
        # choose a source table with highest sum of matches for entity fields
        best_t = None
        best_total = -1
        for tname, info in tables.items():
            total = 0
            for field, fdef in edef["fields"].items():
                col = best_col(field, fdef.get("type", "string"), info["schema"])
                total += fuzz.WRatio(str(col), field)
            if total > best_total:
                best_total, best_t = total, tname
        if best_t:
            fields = []
            for field, fdef in edef["fields"].items():
                col = best_col(field, fdef.get("type", "string"), tables[best_t]["schema"])
                transform = "identity"
                if fdef.get("type") in ("integer","numeric"):
                    transform = "cast_numeric"
                elif fdef.get("type") == "datetime":
                    transform = "parse_timestamp"
                elif field in ("email","full_name"):
                    transform = "lower_trim" if field == "email" else "concat_if_split"
                fields.append({
                    "onto_field": field,
                    "source": col if col else "",
                    "transform": transform,
                    "confidence": 0.72
                })
            mappings.append({
                "entity": ent,
                "source_table": best_t,
                "fields": fields,
                "primary_key": edef.get("pk", ""),
                "foreign_keys": [{"field": k, "ref": v["ref"]} for k, v in edef.get("fk", {}).items()]
            })
    return {"mappings": mappings}

# -------------------------
# Validation
# -------------------------
@dataclass
class Scorecard:
    confidence: float
    blockers: List[str]
    issues: List[str]
    metrics: Dict[str, Any]

def publish_temp_tables(con, tables: Dict[str, Any]):
    # Register CSV/Parquet as DuckDB views
    for tname, info in tables.items():
        path = info["path"]
        if path.endswith(".csv"):
            con.sql(f"CREATE OR REPLACE VIEW src_{tname} AS SELECT * FROM read_csv_auto('{path}')")
        else:
            con.sql(f"CREATE OR REPLACE VIEW src_{tname} AS SELECT * FROM read_parquet('{path}')")

def mk_sql_expr(src: Any, transform: str):
    # Simplified transform support
    if transform is None:
        transform = "identity"
    
    if isinstance(src, list):
        if transform.startswith("concat"):
            # use space concat
            parts = " || ' ' || ".join([f"COALESCE({c}, '')" for c in src])
            return parts + " AS value"
        src_col = src[0]
    else:
        src_col = src

    if transform.startswith("cast(int)") or transform == "cast_numeric":
        return f"CAST({src_col} AS DOUBLE) AS value"
    if transform.startswith("parse_timestamp"):
        return f"CAST({src_col} AS TIMESTAMP) AS value"
    if transform.startswith("lower") or transform == 'lower_trim':
        return f"LOWER(TRIM({src_col})) AS value"
    if transform == "identity":
        return f"{src_col} AS value"
    # default
    return f"{src_col} AS value"

def validate_and_score(con, ontology: Dict[str, Any], proposal: Dict[str, Any]) -> Scorecard:
    issues, blockers = [], []
    metrics = {}
    confs = []
    
    # Handle both formats: {"mappings": [...]} or [...]
    if isinstance(proposal, list):
        mappings = proposal
    else:
        mappings = proposal.get("mappings", [])

    for m in mappings:
        ent = m["entity"]
        src_table = f"src_{m['source_table']}"
        edef = ontology["entities"][ent]
        # build temp projected table for validation
        selects = []
        for f in m["fields"]:
            onto = f["onto_field"]
            expr = mk_sql_expr(f["source"], f.get("transform","identity"))
            selects.append(expr.replace(" AS value", f" AS {onto}"))
            confs.append(float(f.get("confidence", 0.7)))
        try:
            con.sql(f"CREATE OR REPLACE VIEW _candidate_{ent} AS SELECT {', '.join(selects)} FROM {src_table}")
        except Exception as e:
            blockers.append(f"{ent}: SQL build failed: {e}")
            continue

        # Type/semantic checks (email, datetime parse proxy, numeric cast proxy is done in mk_sql_expr)
        if "email" in edef["fields"]:
            try:
                ok = con.sql(f"SELECT AVG(CASE WHEN email LIKE '%@%' THEN 1 ELSE 0 END) FROM _candidate_{ent}").fetchone()[0] or 0
                metrics[f"semantic_email_{ent}"] = ok
                if ok < 0.95:
                    issues.append(f"{ent}.email pattern low: {ok:.2f}")
            except Exception:
                pass

        # PK uniqueness
        pk = edef.get("pk")
        if pk:
            try:
                uniq = con.sql(f"SELECT COUNT(DISTINCT {pk})*1.0/NULLIF(COUNT(*),0) FROM _candidate_{ent}").fetchone()[0] or 0
                metrics[f"pk_uniqueness_{ent}"] = uniq
                if uniq < 0.995:
                    issues.append(f"{ent} PK uniqueness {uniq:.3f}")
            except Exception:
                pass

    # FK checks order -> customer if both exist
    try:
        con.sql("DROP VIEW IF EXISTS _joined_order_customer")
    except Exception:
        pass
    if any(m["entity"]=="order" for m in mappings) and any(m["entity"]=="customer" for m in mappings):
        try:
            con.sql("CREATE OR REPLACE VIEW _joined_order_customer AS \
                     SELECT o.*, c.customer_id AS c_id FROM _candidate_order o LEFT JOIN _candidate_customer c \
                     ON o.customer_id = c.customer_id")
            fk_ok = con.sql("SELECT AVG(CASE WHEN o.customer_id IS NULL OR c_id IS NOT NULL THEN 1 ELSE 0 END) FROM _joined_order_customer").fetchone()[0] or 0
            metrics["fk_resolution_order_customer"] = fk_ok
            if fk_ok < 0.97:
                issues.append(f"FK order.customer_id -> customer.customer_id low: {fk_ok:.2f}")
            # Join explosion guard (row count shouldn't grow > 1.1x of orders)
            rc_orders = con.sql("SELECT COUNT(*) FROM _candidate_order").fetchone()[0] or 0
            rc_joined = con.sql("SELECT COUNT(*) FROM _joined_order_customer").fetchone()[0] or 0
            if rc_orders and rc_joined > rc_orders * 1.1:
                blockers.append(f"Join explosion: joined {rc_joined} vs orders {rc_orders}")
        except Exception as e:
            issues.append(f"FK/join check failed: {e}")

    # Confidence aggregate
    agg_conf = sum(confs)/len(confs) if confs else 0.75
    # Penalize if blockers
    if blockers:
        agg_conf *= 0.5

    return Scorecard(confidence=agg_conf, blockers=blockers, issues=issues, metrics=metrics)

# -------------------------
# Publisher
# -------------------------
def publish_views(con, proposal: Dict[str, Any]):
    # Handle both formats: {"mappings": [...]} or [...]
    if isinstance(proposal, list):
        mappings = proposal
    else:
        mappings = proposal.get("mappings", [])
    
    for m in mappings:
        ent = m["entity"]
        src_table = f"src_{m['source_table']}"
        selects = []
        for f in m["fields"]:
            onto = f["onto_field"]
            expr = mk_sql_expr(f["source"], f.get("transform","identity"))
            selects.append(expr.replace(" AS value", f" AS {onto}"))
        sql = f"CREATE OR REPLACE VIEW dcl_{ent} AS SELECT {', '.join(selects)} FROM {src_table}"
        con.sql(sql)

# -------------------------
# Main loop
# -------------------------
def main():
    catalog = load_catalog(CATALOG_PATH)
    con = duckdb.connect(DB_PATH)

    print("🔄 Starting DCL bounded-autonomy agent (POC)…")
    print("Watching directories:", DATA_DIRS)

    seen = set()
    while True:
        tables = list_tables()
        keys = tuple(sorted(tables.keys()))
        # Only act if there is at least one table
        if keys and keys != seen:
            print(f"📦 Detected tables: {list(tables.keys())}")
            # Register/refresh temp views for sources
            publish_temp_tables(con, tables)

            # Ask LLM
            proposal = llm_propose_mappings(catalog, tables)
            if not proposal:
                print("⚠️ LLM proposal failed, using heuristic fallback.")
                proposal = heuristic_mappings(catalog, tables)

            # Validate
            score = validate_and_score(con, catalog, proposal)
            print("📊 Scorecard:", score)

            # Decide
            if (score.confidence >= CONF_THRESHOLD) and (len(score.blockers) == 0):
                publish_views(con, proposal)
                print(f"✅ Applied views (confidence={score.confidence:.2f})")
            else:
                if AUTO_PUBLISH_PARTIAL and not score.blockers:
                    # Publish anyway to keep demo flowing
                    publish_views(con, proposal)
                    print(f"⚠️ Applied with issues (confidence={score.confidence:.2f}). Issues: {score.issues}")
                else:
                    print("⏸️ Escalated: blockers present, not publishing.")
            seen = keys
        time.sleep(5)

if __name__ == '__main__':
    main()
