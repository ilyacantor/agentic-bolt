
import os, time, json, glob, duckdb, pandas as pd, yaml, warnings, threading, re, traceback
from fastapi import FastAPI, Query
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
import google.generativeai as genai
from rag_engine import RAGEngine

DB_PATH = "registry.duckdb"
ONTOLOGY_PATH = "ontology/catalog.yml"
SCHEMAS_DIR = "schemas"
CONF_THRESHOLD = 0.70
AUTO_PUBLISH_PARTIAL = True

if os.getenv("GEMINI_API_KEY"):
    genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
else:
    print("⚠️ GEMINI_API_KEY not set. LLM proposals may be unavailable.")

EVENT_LOG: List[str] = []
GRAPH_STATE = {"nodes": [], "edges": [], "confidence": None, "last_updated": None}
SOURCES_ADDED: List[str] = []
ENTITY_SOURCES: Dict[str, List[str]] = {}
AUTO_INGEST_UNMAPPED = False
ontology = None
LLM_CALLS = 0
LLM_TOKENS = 0
rag_engine = None

def log(msg: str):
    print(msg, flush=True)
    if not EVENT_LOG or EVENT_LOG[-1] != msg:
        EVENT_LOG.append(msg)
    if len(EVENT_LOG) > 50:
        EVENT_LOG.pop(0)

def load_ontology():
    with open(ONTOLOGY_PATH, "r") as f:
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
                    pd.to_datetime(series.dropna().head(50), errors="coerce")
                    mapping[col] = "datetime"
                except Exception:
                    mapping[col] = "string"
    return mapping

def snapshot_tables_from_dir(source_key: str, dir_path: str) -> Dict[str, Any]:
    tables = {}
    for path in glob.glob(os.path.join(dir_path, "*.csv")):
        tname = os.path.splitext(os.path.basename(path))[0]
        df = pd.read_csv(path)
        tables[tname] = {
            "path": path,
            "schema": infer_types(df),
            "samples": df.head(8).to_dict(orient="records")
        }
    return tables

def register_src_views(con, source_key: str, tables: Dict[str, Any]):
    for tname, info in tables.items():
        path = info["path"]
        view_name = f"src_{source_key}_{tname}"
        con.sql(f"CREATE OR REPLACE VIEW {view_name} AS SELECT * FROM read_csv_auto('{path}')")

def mk_sql_expr(src: Any, transform: str):
    if isinstance(src, list):
        parts = " || ' ' || ".join([f"COALESCE({c}, '')" for c in src])
        return parts + " AS value"
    if transform.startswith("cast"):
        return f"CAST({src} AS DOUBLE) AS value"
    if transform.startswith("parse_timestamp"):
        return f"TRY_STRPTIME({src}, '%Y-%m-%d %H:%M:%S') AS value"
    if transform.startswith("lower") or transform == 'lower_trim':
        return f"LOWER(TRIM({src})) AS value"
    return f"{src} AS value"

@dataclass
class Scorecard:
    confidence: float
    blockers: List[str]
    issues: List[str]
    joins: List[Dict[str,str]]

def safe_llm_call(prompt: str, source_key: str, tables: Dict[str, Any]) -> Dict[str, Any]:
    """Wrapper around Gemini calls that guarantees a result with proper logging."""
    global LLM_CALLS, LLM_TOKENS
    
    try:
        resp = genai.GenerativeModel("gemini-2.5-pro").generate_content(prompt)
        LLM_CALLS += 1
        try:
            usage = resp.usage_metadata
            LLM_TOKENS += usage.get("total_token_count", 0)
        except Exception:
            pass
        
        try:
            text = resp.text.strip()
            if text.startswith("```"):
                text = re.sub(r"^```(?:json)?\n?", "", text)
                text = re.sub(r"\n?```$", "", text)
                text = text.strip()
            m = re.search(r"\{.*\}", text, re.DOTALL)
            if not m:
                raise ValueError("No JSON object found in response")
            return json.loads(m.group(0))
        except Exception as parse_err:
            os.makedirs("logs", exist_ok=True)
            with open("logs/llm_failures.log", "a") as f:
                f.write(f"--- PARSE ERROR ({time.strftime('%Y-%m-%d %H:%M:%S')}) ---\n")
                f.write(f"Source: {source_key}\n")
                f.write(f"Response: {resp.text if hasattr(resp, 'text') else 'N/A'}\n")
                f.write(f"Error: {parse_err}\n\n")
            log(f"[LLM PARSE ERROR] Falling back to heuristic for {source_key}")
            return None
    
    except Exception as e:
        os.makedirs("logs", exist_ok=True)
        with open("logs/llm_failures.log", "a") as f:
            f.write(f"--- LLM ERROR ({time.strftime('%Y-%m-%d %H:%M:%S')}) ---\n")
            f.write(f"Source: {source_key}\n")
            f.write(f"{traceback.format_exc()}\n\n")
        log(f"[LLM ERROR] {e} - Falling back to heuristic for {source_key}")
        return None

def llm_propose(ontology: Dict[str, Any], source_key: str, tables: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    global rag_engine
    if not os.getenv("GEMINI_API_KEY"):
        return None
    
    # Build RAG context if available
    rag_context = ""
    if rag_engine:
        try:
            # Collect all fields from tables and get similar mappings
            all_similar = []
            for table_name, table_info in tables.items():
                schema = table_info.get('schema', {})
                for field_name, field_type in schema.items():
                    similar = rag_engine.retrieve_similar_mappings(
                        field_name=field_name,
                        field_type=field_type,
                        source_system=source_key,
                        top_k=3,
                        min_confidence=0.7
                    )
                    all_similar.extend(similar)
            
            # Deduplicate and get top examples
            seen = set()
            unique_similar = []
            for mapping in all_similar:
                key = f"{mapping['source_field']}_{mapping['ontology_entity']}"
                if key not in seen:
                    seen.add(key)
                    unique_similar.append(mapping)
            
            # Build context from top 5 most similar
            unique_similar.sort(key=lambda x: x.get('similarity', 0), reverse=True)
            top_similar = unique_similar[:5]
            
            if top_similar:
                rag_context = rag_engine.build_context_for_llm(top_similar)
                log(f"📚 RAG: Retrieved {len(top_similar)} similar mappings for context")
        except Exception as e:
            log(f"⚠️ RAG retrieval failed: {e}")
    
    sys_prompt = (
        "You are a data integration planner. Given an ontology and a set of new tables from a source system, "
        "produce a STRICT JSON plan with proposed mappings and joins.\n\n"
        "Output format (strict JSON!):\n"
        "{"
        '  "mappings": ['
        '    {"entity":"customer","source_table":"<table>", "fields":[{"source":"<col>", "onto_field":"customer_id", "confidence":0.92}]},'
        '    {"entity":"transaction","source_table":"<table>", "fields":[{"source":"<col>", "onto_field":"amount", "confidence":0.88}]}'
        "  ],"
        '  "joins": [ {"left":"<table>.<col>", "right":"<table>.<col>", "reason":"why"} ]'
        "}"
    )
    
    # Build RAG context section properly
    rag_section = f"{rag_context}\n\n" if rag_context else ""
    
    # Construct full prompt with all sections
    prompt = (
        f"{sys_prompt}\n\n"
        f"{rag_section}"
        f"Ontology:\n{json.dumps(ontology)}\n\n"
        f"SourceKey: {source_key}\n"
        f"Tables:\n{json.dumps(tables)}\n\n"
        f"Return ONLY JSON."
    )
    
    result = safe_llm_call(prompt, source_key, tables)
    
    # Store successful mappings in RAG
    if result and rag_engine:
        try:
            for mapping in result.get("mappings", []):
                entity = mapping.get("entity")
                source_table = mapping.get("source_table")
                for field in mapping.get("fields", []):
                    rag_engine.store_mapping(
                        source_field=field["source"],
                        source_type="string",  # We can enhance this later
                        ontology_entity=f"{entity}.{field['onto_field']}",
                        source_system=source_key,
                        transformation="direct",
                        confidence=field.get("confidence", 0.8),
                        validated=False
                    )
            log(f"💾 Stored {len(result.get('mappings', []))} mappings to RAG")
        except Exception as e:
            log(f"⚠️ Failed to store mappings in RAG: {e}")
    
    return result

def heuristic_plan(ontology: Dict[str, Any], source_key: str, tables: Dict[str, Any]) -> Dict[str, Any]:
    mappings, joins = [], []
    key_fields = ["accountid","AccountId","KUNNR","CustomerID","CUST_ID","entityId","customerid","parentcustomerid","Id","CUST_ID"]
    email_fields = ["email","emailaddress1","Email","EMAIL"]
    amount_fields = ["amount","Amount","NETWR","TotalAmount","estimatedvalue","AMOUNT"]
    date_fields = ["createdon","CreatedDate","CloseDate","ERDAT","ORDER_DATE","tranDate","created_at","CREATED_AT","OrderDate","ORDER_DATE"]
    for tname, info in tables.items():
        cols = list(info["schema"].keys())
        cust = next((c for c in cols if c in key_fields or c.lower() in ["customer_id","cust_id","id","accountid","account_id"]), None)
        email = next((c for c in cols if c in email_fields or "email" in c.lower()), None)
        amount = next((c for c in cols if c in amount_fields or "amount" in c.lower() or "price" in c.lower()), None)
        datec = next((c for c in cols if c in date_fields or "date" in c.lower()), None)
        if cust or email:
            fields = []
            if cust: fields.append({"source": cust, "onto_field": "customer_id", "confidence": 0.85})
            if email: fields.append({"source": email, "onto_field": "email", "confidence": 0.8})
            mappings.append({"entity":"customer","source_table": f"{source_key}_{tname}", "fields": fields})
        if amount or datec:
            fields = []
            if amount: fields.append({"source": amount, "onto_field": "amount", "confidence": 0.82})
            if datec: fields.append({"source": datec, "onto_field": "order_date", "confidence": 0.8})
            mappings.append({"entity":"transaction","source_table": f"{source_key}_{tname}", "fields": fields})
    # naive joins on shared key names
    name_to_tables = {}
    for t, info in tables.items():
        for c in info["schema"].keys():
            name_to_tables.setdefault(c.lower(), []).append(t)
    for key in ["accountid","customerid","kunnr","cust_id","account_id","id"]:
        if key in name_to_tables and len(name_to_tables[key])>1:
            T = name_to_tables[key]
            for i in range(len(T)-1):
                joins.append({"left": f"{T[i]}.{key}", "right": f"{T[i+1]}.{key}", "reason": f"shared key {key}"})
    return {"mappings": mappings, "joins": joins}

def apply_plan(con, source_key: str, plan: Dict[str, Any]) -> Scorecard:
    issues, blockers, joins = [], [], []
    confs = []
    per_entity_views = {}
    for m in plan.get("mappings", []):
        ent = m["entity"]
        src_table = f"src_{m['source_table']}"
        selects = []
        for f in m["fields"]:
            onto = f["onto_field"]
            src = f["source"]
            confs.append(float(f.get("confidence", 0.75)))
            selects.append(f"{src} AS {onto}")
        if not selects:
            continue
        table_suffix = m['source_table'].split('_',1)[1] if '_' in m['source_table'] else m['source_table']
        view_name = f"dcl_{ent}_{source_key}_{table_suffix}"
        src_table = f"src_{source_key}_{table_suffix}" if '_' not in m['source_table'] else f"src_{m['source_table']}"
        try:
            con.sql(f"CREATE OR REPLACE VIEW {view_name} AS SELECT {', '.join(selects)} FROM {src_table}")
            per_entity_views.setdefault(ent, []).append(view_name)
            GRAPH_STATE["edges"].append({"source": src_table, "target": f"dcl_{ent}", "label": f"{m['source_table']} → {ent}", "type": "mapping"})
        except Exception as e:
            blockers.append(f"{ent}: failed view {view_name}: {e}")
    for ent, views in per_entity_views.items():
        union_sql = " UNION ALL ".join([f"SELECT * FROM {v}" for v in views])
        try:
            con.sql(f"CREATE OR REPLACE VIEW dcl_{ent} AS {union_sql}")
            ENTITY_SOURCES.setdefault(ent, []).append(source_key)
        except Exception as e:
            blockers.append(f"{ent}: union failed: {e}")
    for j in plan.get("joins", []):
        joins.append({"left": j["left"], "right": j["right"], "reason": j.get("reason","")})
        GRAPH_STATE["edges"].append({
            "source": f"src_{source_key}_{j['left'].split('.')[0]}",
            "target": f"src_{source_key}_{j['right'].split('.')[0]}",
            "label": j["left"].split('.')[-1] + " ↔ " + j["right"].split('.')[-1],
            "type": "join"
        })
    conf = sum(confs)/len(confs) if confs else 0.8
    return Scorecard(confidence=conf, blockers=blockers, issues=issues, joins=joins)

def add_graph_nodes_for_source(source_key: str, tables: Dict[str, Any]):
    for t in tables.keys():
        node_id = f"src_{source_key}_{t}"
        label = f"{t} ({source_key.title()})"
        GRAPH_STATE["nodes"].append({"id": node_id, "label": label, "type": "source"})
    for ent in ["customer","transaction"]:
        if not any(n["id"] == f"dcl_{ent}" for n in GRAPH_STATE["nodes"]):
            GRAPH_STATE["nodes"].append({"id": f"dcl_{ent}", "label": f"{ent.title()} (Unified)", "type": "ontology"})

def preview_table(con, name: str, limit: int = 6) -> List[Dict[str,Any]]:
    try:
        df = con.sql(f"SELECT * FROM {name} LIMIT {limit}").to_df()
        records = df.to_dict(orient="records")
        for record in records:
            for key, value in record.items():
                if pd.isna(value):
                    record[key] = None
                elif isinstance(value, (pd.Timestamp, pd.Timedelta)):
                    record[key] = str(value)
        return records
    except Exception:
        return []

def connect_source(source_key: str) -> Dict[str, Any]:
    global ontology
    if ontology is None:
        ontology = load_ontology()
    schema_dir = os.path.join(SCHEMAS_DIR, source_key)
    if not os.path.isdir(schema_dir):
        return {"error": f"Unknown source '{source_key}'"}
    tables = snapshot_tables_from_dir(source_key, schema_dir)
    con = duckdb.connect(DB_PATH)
    register_src_views(con, source_key, tables)
    add_graph_nodes_for_source(source_key, tables)
    plan = llm_propose(ontology, source_key, tables)
    if not plan:
        plan = heuristic_plan(ontology, source_key, tables)
        log(f"I connected to {source_key.title()} (schema sample) and generated a heuristic plan. I mapped obvious IDs and foreign keys and published a basic unified view.")
    else:
        log(f"I connected to {source_key.title()} (schema sample) and proposed mappings and joins.")
    score = apply_plan(con, source_key, plan)
    GRAPH_STATE["confidence"] = score.confidence
    GRAPH_STATE["last_updated"] = time.strftime("%I:%M:%S %p")
    SOURCES_ADDED.append(source_key)
    ents = ", ".join(sorted(tables.keys()))
    log(f"I found these entities: {ents}.")
    if score.joins:
        log("To connect them, I proposed joins like " + "; ".join([f"{j['left']} with {j['right']}" for j in score.joins]) + ".")
    if score.confidence >= CONF_THRESHOLD and not score.blockers:
        log(f"I am about {int(score.confidence*100)}% confident. I created unified views so you can now query across these sources.")
    elif AUTO_PUBLISH_PARTIAL and not score.blockers:
        log(f"I applied the mappings, but with some issues: {score.issues}")
    else:
        log("I paused because of blockers and did not publish.")
    previews = {"sources": {}, "ontology": {}}
    for t in tables.keys():
        previews["sources"][f"src_{source_key}_{t}"] = preview_table(con, f"src_{source_key}_{t}")
    for ent in ["customer","transaction"]:
        previews["ontology"][f"dcl_{ent}"] = preview_table(con, f"dcl_{ent}")
    return {"ok": True, "score": score.confidence, "previews": previews}

def reset_demo():
    global EVENT_LOG, GRAPH_STATE, SOURCES_ADDED, ENTITY_SOURCES, ontology, LLM_CALLS, LLM_TOKENS
    EVENT_LOG = []
    GRAPH_STATE = {"nodes": [], "edges": [], "confidence": None, "last_updated": None}
    SOURCES_ADDED = []
    ENTITY_SOURCES = {}
    LLM_CALLS = 0
    LLM_TOKENS = 0
    ontology = load_ontology()
    try:
        os.remove(DB_PATH)
    except FileNotFoundError:
        pass
    log("I reset the demo. Pick a source from the menu to add it.")

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.on_event("startup")
async def startup_event():
    """Initialize RAG engine on startup."""
    global rag_engine
    try:
        rag_engine = RAGEngine(persist_dir="./chroma_db")
        log("✅ RAG Engine initialized successfully")
    except Exception as e:
        log(f"⚠️ RAG Engine initialization failed: {e}. Continuing without RAG.")

@app.get("/", response_class=HTMLResponse)
def index():
    with open("static/index.html", "r", encoding="utf-8") as f:
        html_content = f.read()
    return HTMLResponse(content=html_content)

@app.get("/state")
def state():
    return JSONResponse({
        "events": EVENT_LOG,
        "timeline": EVENT_LOG[-5:],
        "graph": GRAPH_STATE,
        "preview": {"sources": {}, "ontology": {}},
        "llm": {"calls": LLM_CALLS, "tokens": LLM_TOKENS},
        "auto_ingest_unmapped": AUTO_INGEST_UNMAPPED
    })

@app.get("/connect")
def connect(source: str = Query(..., regex="^(dynamics|salesforce|sap|netsuite|legacy_sql|snowflake)$")):
    res = connect_source(source)
    return JSONResponse(res)

@app.get("/reset")
def reset():
    reset_demo()
    return JSONResponse({"ok": True})

@app.get("/preview")
def preview(node: Optional[str] = None):
    con = duckdb.connect(DB_PATH)
    sources, ontology_tables = {}, {}
    if node:
        try:
            if node.startswith("src_"):
                sources[node] = preview_table(con, node)
            elif node.startswith("dcl_"):
                ontology_tables[node] = preview_table(con, node)
        except Exception:
            pass
    else:
        for ent in ["customer","transaction"]:
            ontology_tables[f"dcl_{ent}"] = preview_table(con, f"dcl_{ent}")
    return JSONResponse({"sources": sources, "ontology": ontology_tables})

@app.get("/toggle_auto_ingest")
def toggle_auto_ingest(enabled: bool = Query(...)):
    global AUTO_INGEST_UNMAPPED
    AUTO_INGEST_UNMAPPED = enabled
    return JSONResponse({"ok": True, "enabled": AUTO_INGEST_UNMAPPED})

@app.get("/rag/stats")
def rag_stats():
    """Get RAG engine statistics."""
    if not rag_engine:
        return JSONResponse({"error": "RAG Engine not initialized"}, status_code=503)
    try:
        stats = rag_engine.get_stats()
        return JSONResponse(stats)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

@app.post("/api/infer")
async def infer_schema(request: Dict[str, Any]):
    fields = request.get("fields", [])
    
    if not os.getenv("GEMINI_API_KEY"):
        return JSONResponse({"error": "GEMINI_API_KEY not configured"}, status_code=500)
    
    prompt = f"""
You are a data integration assistant.
Your ONLY job is to output valid JSON for ontology mappings.

Schema:
{{
  "mappings": [
    {{
      "name": string,
      "type": string,
      "suggested_mapping": string,
      "transformation": string
    }}
  ]
}}

Guidelines:
- Output ONLY JSON (no prose, no markdown).
- Use "suggested_mapping" to map to enterprise ontology domains (CRM, Finance, Geography, Sales, etc).
- Use "transformation" for normalization or conversions.
- Respect the given "type" (Text, Number, DateTime, Currency, etc).

Fields:
{fields}
"""
    
    try:
        model = genai.GenerativeModel("gemini-2.5-pro")
        result = model.generate_content(prompt)
        raw_text = result.text.strip()
        
        # Strip markdown code blocks if present
        raw_text = raw_text.replace('```json\n', '').replace('\n```', '').replace('```', '')
        
        # Parse JSON
        import json as json_module
        try:
            parsed = json_module.loads(raw_text)
        except Exception:
            # Fallback if JSON parsing fails
            parsed = {
                "mappings": [
                    {
                        "name": f["name"],
                        "type": f["type"],
                        "suggested_mapping": "Unknown",
                        "transformation": "Review required"
                    }
                    for f in fields
                ]
            }
        
        return JSONResponse(content=parsed)
    
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.get("/agentic-connection", response_class=HTMLResponse)
def agentic_connection():
    with open("static/agentic-connection.html", "r", encoding="utf-8") as f:
        html_content = f.read()
    return HTMLResponse(content=html_content)
