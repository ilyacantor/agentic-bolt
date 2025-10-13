
import os, time, json, glob, duckdb, pandas as pd, yaml, warnings, threading, re, traceback
from fastapi import FastAPI, Query
from fastapi.responses import HTMLResponse, JSONResponse
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
import google.generativeai as genai

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
    if not os.getenv("GEMINI_API_KEY"):
        return None
    
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
    prompt = (
        f"{sys_prompt}\n\n"
        f"Ontology:\n{json.dumps(ontology)}\n\n"
        f"SourceKey: {source_key}\n"
        f"Tables:\n{json.dumps(tables)}\n\n"
        f"Return ONLY JSON."
    )
    
    return safe_llm_call(prompt, source_key, tables)

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

@app.get("/", response_class=HTMLResponse)
def index():
    html = """
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>DCL Agent — Sources Demo</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="https://unpkg.com/qtip2@3.0.3/dist/jquery.qtip.min.css">
  <style>
    body { font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 0; background:#0b0f14; color:#e6eef5;}
    header { padding:16px 20px; display:flex; align-items:center; gap:12px; border-bottom:1px solid #1b2430; position:sticky; top:0; background:#0b0f14; z-index:10;}
    select, button { background:#121a24; color:#e6eef5; border:1px solid #2a3644; padding:8px 10px; border-radius:10px; cursor:pointer; }
    button:disabled { opacity:0.5; cursor:not-allowed; }
    button.primary { background:#2563eb; border-color:#2563eb; }
    .wrap { display:flex; flex-direction:column; gap:16px; padding:16px; }
    #graphWrapper { display:flex; gap:16px; align-items:flex-start; }
    #narrationPanel { flex: 0 0 320px; max-width: 320px; min-width: 320px; }
    .card { background:#0d131b; border:1px solid #1b2430; border-radius:14px; padding:14px; }
    .title { font-weight:600; margin:0 0 8px 0; color:#cfe7ff; }
    #log { white-space:pre-line; line-height:1.45; color:#d6e2ee; }
    #cy { flex: 1 1 auto; width:100%; height:520px; min-height:520px; max-height:520px; background:#0a0f15; border:1px solid #1b2430; border-radius:12px; overflow:hidden;}
    .badge, .llm-badge { position:absolute; background:#142133; border:1px solid #29405b; color:#bfe1ff; padding:4px 8px; border-radius:8px; font-size:11px; }
    .badge { bottom:16px; right:16px; }
    .badge.good { background:#0e2f1b; border-color:#1b5e2b; color:#bfffd0; }
    .badge.warn { background:#39250e; border-color:#7a4d14; color:#ffd3aa; }
    .badge.pause { background:#2c2c2c; border-color:#444; color:#ddd; }
    .llm-badge { top:16px; left:16px; background:#1a2330; border-color:#2c3f55; color:#9ecbff; }
    .controls { display:flex; gap:8px; align-items:center;}
    .timeline { font-size:13px; color:#b2c3d6;}
    .grid2 { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
    table { width:100%; border-collapse: collapse; }
    th, td { border-bottom:1px solid #1b2430; padding:6px 8px; font-size:13px; }
    th { color:#a8c7ff; text-align:left; }
    table tr:nth-child(even) { background:#111822; }
    td { max-width: 160px; overflow:hidden; text-overflow: ellipsis; white-space:nowrap; }
    .pill { padding:2px 8px; border-radius:999px; border:1px solid #253144; font-size:12px; color:#b5cbe6; }
    .toggle { margin-left:auto; display:flex; gap:8px; align-items:center; }
  </style>
</head>
<body>
  <header>
    <div class="controls">
      <select id="source">
        <option value="dynamics">Connect Dynamics CRM (schema sample)</option>
        <option value="salesforce">Connect Salesforce (schema sample)</option>
        <option value="sap">Connect SAP ERP (schema sample)</option>
        <option value="netsuite">Connect NetSuite (schema sample)</option>
        <option value="legacy_sql">Connect Legacy SQL Server (schema sample)</option>
        <option value="snowflake">Connect Snowflake (schema sample)</option>
      </select>
      <button class="primary" onclick="addSource()">Add Source</button>
      <button onclick="resetDemo()">Reset</button>
    </div>
    <div class="toggle">
      <label for="autoIngestToggle" style="font-size: 13px; color: #b2c3d6; cursor: pointer;">Auto-ingest unmapped sources</label>
      <input type="checkbox" id="autoIngestToggle" onchange="toggleAutoIngest()" style="width: 18px; height: 18px; cursor: pointer;">
    </div>
  </header>
  <div class="wrap">
    <div id="graphWrapper">
      <div id="narrationPanel" class="card">
        <h3 class="title">Narration</h3>
        <div id="log"></div>
      </div>
      <div class="card" style="position:relative; flex:1;">
        <h3 class="title">Graph</h3>
        <div id="llmBadge" class="llm-badge">LLM Calls: 0 | Tokens: ~0</div>
        <div id="legend" style="margin: 8px 0; font-size: 13px; color: #bfe1ff;">
          <strong>Legend:</strong>
          <span style="color:#4a90e2;">■ Source Tables (in Cloud)</span>
          <span style="margin-left:12px; color:#2ecc71;">■ Unified Ontology (in Company Block)</span>
          <span style="margin-left:12px; color:#9b59b6;">— Mapping Edges</span>
        </div>
        <div id="cy"></div>
        <div id="statusBadge" style="position:absolute; bottom:12px; right:16px; background:#142133; border:1px solid #29405b; color:#bfe1ff; padding:4px 8px; border-radius:6px; font-size:12px;">
          LLM Calls: 0 | Confidence: -- | Updated: --
        </div>
      </div>
    </div>
    <div class="card grid2">
      <div>
        <h3 class="title">Source Preview</h3>
        <div id="preview_sources"></div>
      </div>
      <div>
        <h3 class="title">Unified Preview</h3>
        <div id="preview_ontology"></div>
      </div>
    </div>
    
    <div class="card">
      <h3 class="title">🧪 Invent Schema (Demo Mode)</h3>
      <p style="font-size: 13px; color: #b2c3d6; margin-bottom: 12px;">Create custom fields and let AI map them to enterprise ontology domains</p>
      <div id="schemaFieldsContainer"></div>
      <div style="margin-top: 12px; display: flex; gap: 8px;">
        <button onclick="addSchemaField()">+ Add Field</button>
        <button class="primary" onclick="inferOntology()">Infer Ontology</button>
        <button onclick="resetSchemaInference()" style="background: #8b0000; border-color: #8b0000;">Reset All</button>
      </div>
      <div id="schemaResults" style="margin-top: 16px;"></div>
    </div>
  </div>

  <script src="https://unpkg.com/jquery@3.6.0/dist/jquery.min.js"></script>
  <script src="https://unpkg.com/qtip2@3.0.3/dist/jquery.qtip.min.js"></script>
  <script src="https://unpkg.com/cytoscape@3.26.0/dist/cytoscape.min.js"></script>
  <script src="https://unpkg.com/cytoscape-qtip@2.8.0/cytoscape-qtip.js"></script>
  <script>
    let state = {events: [], timeline: [], graph: {nodes:[], edges:[], confidence:null, last_updated:null}, preview:{sources:{}, ontology:{}}};
    let cy;

    // Anchors & Sizes
    const CLOUD_X = 120;
    const CLOUD_WIDTH = 320;
    const CLOUD_HEIGHT = 280;
    const OFFSET = 220;
    const INITECH_X = CLOUD_X + CLOUD_WIDTH/2 + OFFSET;

    function badgeClass(conf){
      if(conf===null) return "badge";
      if(conf >= 0.8) return "badge good";
      if(conf >= 0.6) return "badge warn";
      return "badge pause";
    }

    async function fetchState(){
      const r = await fetch('/state');
      state = await r.json();
      document.getElementById('autoIngestToggle').checked = state.auto_ingest_unmapped || false;
      renderLog();
      renderGraph();
      renderPreviews();
    }

    function renderLog(){
      const logEl = document.getElementById('log');
      logEl.textContent = state.events.join("\\n");
      const conf = state.graph.confidence;
      const statusBadge = document.getElementById('statusBadge');
      const confText = conf != null ? `${Math.round(conf*100)}%` : '--';
      const updateText = state.graph.last_updated || '--';
      statusBadge.textContent = `LLM Calls: ${state.llm.calls} | Confidence: ${confText} | Updated: ${updateText}`;
      const llmBadge = document.getElementById('llmBadge');
      llmBadge.textContent = `LLM Calls: ${state.llm.calls} | Tokens: ~${state.llm.tokens}`;
    }

    function getGridPosition(nodeType, index) {
      const yStart = 120;
      const ySpacing = 90;
      return {
        x: nodeType === "source" ? CLOUD_X : INITECH_X,
        y: yStart + index * ySpacing
      };
    }

    function spotlightNode(nodeId) {
      const node = cy.getElementById(nodeId);
      if (!node || node.length === 0) return;
      node.animate({
        style: { 'border-color': '#f1c40f', 'border-width': 4 },
        duration: 400
      }).animate({
        style: { 'border-color': node.data('type') === 'source' ? '#4a90e2' : '#2ecc71', 'border-width': 1 },
        duration: 800
      });
    }

    function revealOntology() {
      const unifiedBlock = cy.getElementById('unified_block');
      if (unifiedBlock.length > 0) {
        unifiedBlock.animate({ style: { opacity: 0.15 }, duration: 600 });
      }
      cy.nodes('[type="ontology"]').forEach(node => {
        node.animate({ style: { opacity: 1 }, duration: 600 });
      });
      cy.edges('[type="mapping"]').forEach(edge => {
        edge.animate({ style: { opacity: 1 }, duration: 600 });
      });
    }

    function renderGraph(){
      const sourceNodes = state.graph.nodes.filter(n => n.type !== 'ontology');
      const ontologyNodes = state.graph.nodes.filter(n => n.type === 'ontology');
      
      // Find unmapped sources (sources without mapping edges)
      const mappedSources = new Set(state.graph.edges.filter(e => e.type === 'mapping').map(e => e.source));
      const unmappedSources = sourceNodes.filter(n => !mappedSources.has(n.id));
      
      // Add Unclassified node if auto_ingest is ON and there are unmapped sources
      let ontologyNodesWithUnclassified = [...ontologyNodes];
      if (state.auto_ingest_unmapped && unmappedSources.length > 0) {
        if (!ontologyNodesWithUnclassified.find(n => n.id === 'dcl_unclassified')) {
          ontologyNodesWithUnclassified.push({ id: 'dcl_unclassified', label: 'Unclassified (Unified)', type: 'ontology_unclassified' });
        }
      }
      
      const nodes = [
        ...sourceNodes.map((n, idx) => ({ 
          data: { id: n.id, label: n.label, type: 'source' },
          position: getGridPosition('source', idx),
          locked: true
        })),
        ...ontologyNodesWithUnclassified.map((n, idx) => ({ 
          data: { id: n.id, label: n.label, type: n.type === 'ontology_unclassified' ? 'ontology_unclassified' : 'ontology' },
          position: getGridPosition('ontology', idx),
          locked: true
        }))
      ];
      
      // Create edges, including auto-ingest edges for unmapped sources
      let allEdges = [...state.graph.edges.filter(e => e.type !== 'source' && e.type !== 'join')];
      if (state.auto_ingest_unmapped && unmappedSources.length > 0) {
        unmappedSources.forEach(source => {
          allEdges.push({
            source: source.id,
            target: 'dcl_unclassified',
            label: 'auto-ingested',
            type: 'mapping',
            confidence: 50
          });
        });
      }
      
      const edges = allEdges.map(e => ({ data: { source: e.source, target: e.target, label: e.label, type: e.type, confidence: e.confidence || 85 } }));
      
      if(!cy){
        cy = cytoscape({
          container: document.getElementById('cy'),
          elements: [],
          style: [
            {
              selector: 'node[type="source"]',
              style: {
                'background-color': '#4a90e2',
                'label': 'data(label)',
                'color': '#ffffff',
                'font-size': 14,
                'text-valign': 'center',
                'text-halign': 'center',
                'shape': 'round-rectangle',
                'padding': '10px',
                'width': 'label',
                'height': 'label',
                'border-width': 1,
                'border-color': '#4a90e2'
              }
            },
            {
              selector: 'node[type="ontology"]',
              style: {
                'background-color': '#2ecc71',
                'label': 'data(label)',
                'color': '#ffffff',
                'font-size': 14,
                'text-valign': 'center',
                'text-halign': 'center',
                'shape': 'round-rectangle',
                'padding': '10px',
                'width': 'label',
                'height': 'label',
                'border-width': 1,
                'border-color': '#2ecc71'
              }
            },
            {
              selector: 'node[type="ontology_unclassified"]',
              style: {
                'background-color': '#7f8c8d',
                'label': 'data(label)',
                'color': '#ffffff',
                'font-size': 14,
                'text-valign': 'center',
                'text-halign': 'center',
                'shape': 'round-rectangle',
                'padding': '10px',
                'width': 'label',
                'height': 'label',
                'border-width': 2,
                'border-color': '#95a5a6',
                'border-style': 'dashed'
              }
            },
            {
              selector: 'edge[type="source"]',
              style: {
                'line-color': '#4a90e2',
                'width': 2,
                'curve-style': 'straight',
                'target-arrow-shape': 'triangle',
                'target-arrow-color': '#4a90e2'
              }
            },
            {
              selector: 'edge[type="mapping"]',
              style: {
                'line-color': '#9b59b6',
                'width': 2,
                'line-style': 'dashed',
                'curve-style': 'straight',
                'target-arrow-shape': 'triangle',
                'target-arrow-color': '#9b59b6'
              }
            },
            {
              selector: 'node[type="container"]',
              style: {
                'background-color': 'data(bgcolor)',
                'opacity': 0.15,
                'shape': 'round-rectangle',
                'width': 260,
                'height': 300,
                'text-valign': 'top',
                'font-size': 14,
                'font-weight': 'bold',
                'color': '#ffffff',
                'padding': '20px',
                'label': 'data(label)',
                'z-index': 0
              }
            },
            {
              selector: 'node[id="source_cloud"]',
              style: {
                'shape': 'ellipse',
                'width': 280,
                'height': 320,
                'background-color': '#4a90e2',
                'opacity': 0.12
              }
            }
          ],
          layout: { name: 'preset' }
        });

        // Disable zooming & fix viewport
        cy.userZoomingEnabled(false);
        cy.userPanningEnabled(false);
        cy.boxSelectionEnabled(false);
        cy.zoom(1);
        cy.pan({ x: 50, y: 0 });
        cy.resize();

        cy.on('tap', 'node', async (evt) => {
          const id = evt.target.id();
          spotlightNode(id);
          const r = await fetch('/preview?node=' + encodeURIComponent(id));
          const data = await r.json();
          renderTable('preview_sources', data.sources);
          renderTable('preview_ontology', data.ontology);
        });
      }
      
      cy.elements().remove();
      
      // Add container nodes first (background boxes)
      if (sourceNodes.length > 0) {
        cy.add({
          group: "nodes",
          data: { id: "source_cloud", label: "Source Cloud", type: "container" },
          position: { x: CLOUD_X, y: 200 },
          style: {
            'shape': 'round-rectangle',
            'width': CLOUD_WIDTH,
            'height': CLOUD_HEIGHT,
            'background-color': '#ecf0f1',
            'background-image': 'url(https://upload.wikimedia.org/wikipedia/commons/3/3c/Cloud_icon.svg)',
            'background-fit': 'cover',
            'background-opacity': 0.15,
            'opacity': 0.35,
            'border-width': 2,
            'border-color': '#95a5a6',
            'text-valign': 'top',
            'text-halign': 'center',
            'font-size': 14,
            'font-weight': 'bold',
            'color': '#7f8c8d',
            'z-index': 0
          },
          locked: true
        });
      }
      
      if (ontologyNodes.length > 0) {
        cy.add({
          group: "nodes",
          data: { id: "unified_block", label: "Initech Corp.", type: "container" },
          position: { x: INITECH_X, y: 200 },
          style: {
            'shape': 'round-rectangle',
            'width': 340,
            'height': 300,
            'background-color': '#2ecc71',
            'background-image': 'url(https://upload.wikimedia.org/wikipedia/commons/3/33/Building_icon.svg)',
            'background-fit': 'cover',
            'background-opacity': 0.15,
            'opacity': 0.35,
            'border-width': 2,
            'border-color': '#27ae60',
            'text-valign': 'top',
            'text-halign': 'center',
            'font-size': 16,
            'font-weight': 'bold',
            'color': '#27ae60',
            'z-index': 0
          },
          locked: true
        });
      }
      
      cy.add(nodes);
      cy.add(edges);
      
      // Add qtip tooltips (skip container nodes)
      cy.nodes('[type!="container"]').forEach(node => {
        node.qtip({
          content: () => `<strong>${node.data('label')}</strong><br>Type: ${node.data('type')}`,
          position: { my: 'top center', at: 'bottom center' },
          style: { classes: 'qtip-light qtip-shadow' }
        });
      });
      
      cy.edges().forEach(edge => {
        edge.qtip({
          content: () => `Confidence: ${edge.data('confidence')}%`,
          position: { my: 'top center', at: 'bottom center' },
          style: { classes: 'qtip-dark qtip-shadow' }
        });
      });
      
      // Always show unified view
      revealOntology();
      
      // Lock viewport on left side
      cy.pan({ x: 50, y: 0 });
      cy.zoom(1);
    }

    function renderTable(elId, tables){
      const el = document.getElementById(elId);
      if(!tables || Object.keys(tables).length===0) { el.innerHTML = "<div class='pill'>Click a node to preview data</div>"; return; }
      let html = "";
      for(const [name, rows] of Object.entries(tables)){
        if(!rows || rows.length==0){ continue; }
        const cols = Object.keys(rows[0]);
        html += `<div class='pill' style='margin:6px 0;'>${name}</div>`;
        html += "<table><thead><tr>" + cols.map(c=>`<th>${c}</th>`).join("") + "</tr></thead><tbody>";
        rows.forEach(r => { html += "<tr>" + cols.map(c=>`<td>${r[c]}</td>`).join("") + "</tr>"; });
        html += "</tbody></table>";
      }
      el.innerHTML = html || "<div class='pill'>No data</div>";
    }

    function renderPreviews(){
      renderTable('preview_sources', state.preview.sources);
      renderTable('preview_ontology', state.preview.ontology);
    }

    async function addSource(){
      const btn = event.target;
      const src = document.getElementById('source').value;
      btn.disabled = true;
      btn.textContent = 'Processing...';
      try {
        await fetch('/connect?source='+encodeURIComponent(src));
        await fetchState();
      } finally {
        btn.disabled = false;
        btn.textContent = 'Add Source';
      }
    }
    async function resetDemo(){
      await fetch('/reset');
      await fetchState();
    }
    
    async function toggleAutoIngest(){
      const toggle = document.getElementById('autoIngestToggle');
      await fetch('/toggle_auto_ingest?enabled=' + toggle.checked);
      await fetchState();
    }

    let schemaFields = [{name: '', type: ''}];
    
    function renderSchemaFields(){
      const container = document.getElementById('schemaFieldsContainer');
      container.innerHTML = schemaFields.map((field, i) => `
        <div style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center;">
          <input 
            type="text" 
            placeholder="Field name (e.g., custRef)" 
            value="${field.name}" 
            onchange="updateSchemaField(${i}, 'name', this.value)"
            style="flex: 1; padding: 8px; background: #121a24; border: 1px solid #2a3644; border-radius: 6px; color: #e6eef5;"
          />
          <select 
            onchange="updateSchemaField(${i}, 'type', this.value)"
            style="padding: 8px; background: #121a24; border: 1px solid #2a3644; border-radius: 6px; color: #e6eef5;"
          >
            <option value="">Select type</option>
            <option value="Text" ${field.type === 'Text' ? 'selected' : ''}>Text</option>
            <option value="Number" ${field.type === 'Number' ? 'selected' : ''}>Number</option>
            <option value="DateTime" ${field.type === 'DateTime' ? 'selected' : ''}>DateTime</option>
            <option value="Currency" ${field.type === 'Currency' ? 'selected' : ''}>Currency</option>
          </select>
          ${schemaFields.length > 1 ? `<button onclick="removeSchemaField(${i})" style="padding: 6px 10px;">✕</button>` : ''}
        </div>
      `).join('');
    }
    
    function addSchemaField(){
      if(schemaFields.length < 5){
        schemaFields.push({name: '', type: ''});
        renderSchemaFields();
      }
    }
    
    function removeSchemaField(index){
      schemaFields.splice(index, 1);
      renderSchemaFields();
    }
    
    function updateSchemaField(index, key, value){
      schemaFields[index][key] = value;
    }
    
    async function resetSchemaInference(){
      schemaFields = [{name: '', type: ''}];
      renderSchemaFields();
      document.getElementById('schemaResults').innerHTML = '';
      await resetDemo();
    }
    
    async function inferOntology(){
      const validFields = schemaFields.filter(f => f.name && f.type);
      if(validFields.length === 0){
        alert('Please add at least one field with both name and type');
        return;
      }
      
      const resultsDiv = document.getElementById('schemaResults');
      resultsDiv.innerHTML = '<p style="color: #9ecbff;">Processing with AI...</p>';
      
      try {
        const response = await fetch('/api/infer', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({fields: validFields})
        });
        
        const data = await response.json();
        
        resultsDiv.innerHTML = `
          <table border="1" style="margin-top: 12px; width: 100%;">
            <thead>
              <tr>
                <th>Field</th>
                <th>Type</th>
                <th>Suggested Mapping</th>
                <th>Transformation</th>
              </tr>
            </thead>
            <tbody>
              ${data.mappings.map(m => `
                <tr>
                  <td>${m.name}</td>
                  <td>${m.type}</td>
                  <td style="color: #2ecc71; font-weight: 600;">${m.suggested_mapping}</td>
                  <td>${m.transformation}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      } catch(err) {
        resultsDiv.innerHTML = `<p style="color: #ff6b6b;">Error: ${err.message}</p>`;
      }
    }

    renderSchemaFields();
    setInterval(fetchState, 5000);
    fetchState();
  </script>
</body>
</html>
    """
    return HTMLResponse(content=html)

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
