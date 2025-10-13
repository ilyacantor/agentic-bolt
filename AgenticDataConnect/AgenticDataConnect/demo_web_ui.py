import os, time, json, re, glob, yaml, duckdb, pandas as pd, warnings, threading
from dataclasses import dataclass
from typing import Dict, Any, List, Optional
from google import genai
from google.genai import types

from fastapi import FastAPI
from fastapi.responses import HTMLResponse

# Config
DATA_DIRS = ["dcl_agency_demo/sample", "dcl_agency_demo/data"]
CATALOG_PATH = "dcl_agency_demo/ontology/catalog.yml"
DB_PATH = "dcl_agency_demo/registry.duckdb"
CONF_THRESHOLD = 0.70
AUTO_PUBLISH_PARTIAL = True
LLM_MODEL = os.getenv("LLM_MODEL", "gemini-2.0-flash-exp")

# Gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
client = None
if GEMINI_API_KEY:
    client = genai.Client(api_key=GEMINI_API_KEY)
else:
    print("⚠️ GEMINI_API_KEY not set.")

# Shared state for web view
EVENT_LOG: List[str] = []

def log_event(msg: str):
    print(msg)
    EVENT_LOG.append(msg)
    if len(EVENT_LOG) > 50:
        EVENT_LOG.pop(0)

def load_catalog(path=CATALOG_PATH):
    with open(path, "r") as f:
        return yaml.safe_load(f)

def infer_types(df: pd.DataFrame) -> Dict[str, str]:
    mapping = {}
    for col in df.columns:
        series = df[col]
        if pd.api.types.is_integer_dtype(series):
            mapping[col] = "integer"
        elif pd.api.types.is_float_dtype(series):
            mapping[col] = "numeric"
        else:
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    pd.to_datetime(series.dropna().head(50),
                                   format="%Y-%m-%d %H:%M:%S",
                                   errors="raise")
                mapping[col] = "datetime"
            except Exception:
                try:
                    pd.to_datetime(series.dropna().head(50),
                                   errors="coerce")
                    mapping[col] = "datetime"
                except Exception:
                    mapping[col] = "string"
    return mapping

def list_tables() -> Dict[str, Any]:
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
                    "samples": df.head(5).to_dict(orient="records")
                }
            except Exception as e:
                log_event(f"[WARN] Skipping {path}: {e}")
    return tables

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
        m = re.search(r"\{.*\}\s*$", content, re.DOTALL)
        text = m.group(0) if m else content
        result = json.loads(text)
        # Handle both formats
        if isinstance(result, list):
            return {"mappings": result}
        return result
    except Exception as e:
        log_event(f"[Gemini ERROR] {e}")
        return None

@dataclass
class Scorecard:
    confidence: float
    blockers: List[str]
    issues: List[str]
    mappings: List[str]
    joins: List[str]

def publish_temp_tables(con, tables: Dict[str, Any]):
    for tname, info in tables.items():
        path = info["path"]
        if path.endswith(".csv"):
            con.sql(f"CREATE OR REPLACE VIEW src_{tname} AS SELECT * FROM read_csv_auto('{path}')")
        else:
            con.sql(f"CREATE OR REPLACE VIEW src_{tname} AS SELECT * FROM read_parquet('{path}')")

def mk_sql_expr(src: Any, transform: str):
    if isinstance(src, list):
        parts = " || ' ' || ".join([f"COALESCE({c}, '')" for c in src])
        return parts + " AS value"
    if transform and transform.startswith("cast"):
        return f"CAST({src} AS DOUBLE) AS value"
    if transform and transform.startswith("parse_timestamp"):
        return f"TRY_STRPTIME({src}, '%Y-%m-%d %H:%M:%S') AS value"
    if transform and (transform.startswith("lower") or transform == 'lower_trim'):
        return f"LOWER(TRIM({src})) AS value"
    return f"{src} AS value"

def validate_and_score(con, ontology: Dict[str, Any], proposal: Dict[str, Any]) -> Scorecard:
    issues, blockers, mappings, joins, confs = [], [], [], [], []
    for m in proposal.get("mappings", []):
        ent = m["entity"]
        src_table = f"src_{m['source_table']}"
        edef = ontology["entities"][ent]
        for f in m["fields"]:
            onto = f["onto_field"]
            src = f["source"]
            conf = float(f.get("confidence", 0.7))
            confs.append(conf)
            mappings.append(f"{src_table}.{src} looks like {onto}")
            if "join" in f:
                joins.append(f"{src_table}.{src} joins with dcl_{ent}.{onto}")
        # Basic PK check
        pk = edef.get("pk")
        if pk:
            try:
                uniq = con.sql(f"SELECT COUNT(DISTINCT {pk})*1.0/NULLIF(COUNT(*),0) FROM src_{m['source_table']}").fetchone()[0] or 0
                if uniq < 0.995:
                    issues.append(f"{ent} might have duplicate {pk} values")
            except Exception: pass
    agg_conf = sum(confs)/len(confs) if confs else 0.75
    return Scorecard(confidence=agg_conf, blockers=blockers, issues=issues, mappings=mappings, joins=joins)

def publish_views(con, proposal: Dict[str, Any]):
    for m in proposal.get("mappings", []):
        ent = m["entity"]
        src_table = f"src_{m['source_table']}"
        selects = []
        for f in m["fields"]:
            onto = f["onto_field"]
            expr = mk_sql_expr(f["source"], f.get("transform","identity"))
            selects.append(expr.replace(" AS value", f" AS {onto}"))
        sql = f"CREATE OR REPLACE VIEW dcl_{ent} AS SELECT {', '.join(selects)} FROM {src_table}"
        con.sql(sql)

def agent_loop():
    catalog = load_catalog(CATALOG_PATH)
    con = duckdb.connect(DB_PATH)
    seen = set()
    log_event("The agent is watching for new data files...")
    while True:
        tables = list_tables()
        keys = tuple(sorted(tables.keys()))
        if keys and keys != seen:
            log_event(f"I found new data sources: {', '.join(tables.keys())}.")
            publish_temp_tables(con, tables)
            proposal = llm_propose_mappings(catalog, tables)
            if not proposal:
                log_event("I could not generate a mapping proposal this time.")
                seen = keys
                continue
            score = validate_and_score(con, catalog, proposal)
            if score.mappings:
                log_event("Here is how I matched fields:")
                for m in score.mappings:
                    log_event(f"- {m}")
            if score.joins:
                log_event("To connect them, I proposed joins:")
                for j in score.joins:
                    log_event(f"- {j}")
            if score.confidence >= CONF_THRESHOLD and not score.blockers:
                publish_views(con, proposal)
                log_event(f"I am about {score.confidence:.0%} confident. I created unified views so you can now query across these sources.")
            elif AUTO_PUBLISH_PARTIAL and not score.blockers:
                publish_views(con, proposal)
                log_event(f"I applied the mappings, but with some issues: {score.issues}")
            else:
                log_event("I paused because of blockers and did not publish the mappings.")
            seen = keys
        time.sleep(5)

# Start agent loop in background
threading.Thread(target=agent_loop, daemon=True).start()

# FastAPI app
app = FastAPI()

@app.get("/", response_class=HTMLResponse)
def dashboard():
    html = "<h1>DCL Agent Dashboard</h1><meta http-equiv='refresh' content='5'>"
    html += "<div style='font-family:Arial;white-space:pre-line'>" + "\n".join(EVENT_LOG[-20:]) + "</div>"
    return HTMLResponse(content=html)
