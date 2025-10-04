let state = {events: [], timeline: [], graph: {nodes:[], edges:[], confidence:null, last_updated:null}, preview:{sources:{}, ontology:{}}, llm:{calls:0, tokens:0}, auto_ingest_unmapped:false};
let cy;

async function refreshState() {
  const res = await fetch("/state");
  state = await res.json();
  console.log("Fetched state:", state);
  renderLog();
  renderGraph();
  renderPreviews();
}

function renderLog(){
  const logEl = document.getElementById('log');
  logEl.textContent = state.events.join("\n");
  const conf = state.graph.confidence;
  const statusBadge = document.getElementById('statusBadge');
  const confText = conf != null ? `${Math.round(conf*100)}%` : '--';
  const updateText = state.graph.last_updated || '--';
  statusBadge.textContent = `LLM Calls: ${state.llm.calls} | Confidence: ${confText} | Updated: ${updateText}`;
  const llmBadge = document.getElementById('llmBadge');
  llmBadge.textContent = `LLM Calls: ${state.llm.calls} | Tokens: ~${state.llm.tokens}`;
}

function renderGraph() {
  if (!state.graph || !state.graph.nodes) {
    console.warn("No graph data in state");
    return;
  }
  console.log("Rendering graph with", state.graph.nodes.length, "nodes");

  if (!cy) {
    cy = cytoscape({
      container: document.getElementById("cy"),
      elements: [],
      style: [
        { selector: "node", style: { "background-color": "#2563eb", "label": "data(label)", "color": "#fff", "text-valign": "center" }},
        { selector: "edge", style: { "line-color": "#999", "target-arrow-shape": "triangle", "target-arrow-color": "#999" }}
      ]
    });
  }
  
  cy.elements().remove();
  cy.add([
    ...state.graph.nodes.map(n => ({
      data: { id: n.id, label: n.label }
    })),
    ...state.graph.edges.map(e => ({
      data: { source: e.source, target: e.target }
    }))
  ]);
  cy.layout({ name: "cose", animate: true, randomize: false, fit: true, padding: 30 }).run();
}

function renderTable(elId, tables){
  const el = document.getElementById(elId);
  if(!tables || Object.keys(tables).length===0) { 
    el.innerHTML = "<div class='pill'>Click a node to preview data</div>"; 
    return; 
  }
  let html = "";
  for(const [name, rows] of Object.entries(tables)){
    if(!rows || rows.length==0){ continue; }
    const cols = Object.keys(rows[0]);
    html += `<div class='pill' style='margin:6px 0;'>${name}</div>`;
    html += "<table><thead><tr>" + cols.map(c=>`<th>${c}</th>`).join("") + "</tr></thead><tbody>";
    rows.forEach(r => { html += "<tr>" + cols.map(c=>`<td>${r[c] !== null ? r[c] : ''}</td>`).join("") + "</tr>"; });
    html += "</tbody></table>";
  }
  el.innerHTML = html || "<div class='pill'>No data</div>";
}

function renderPreviews(){
  renderTable('preview_sources', state.preview.sources);
  renderTable('preview_ontology', state.preview.ontology);
}

function show2D() {
  document.getElementById('cy').style.display='block';
  document.getElementById('graph3d').style.display='none';
  refreshState();
}

function show3D() {
  document.getElementById('cy').style.display='none';
  document.getElementById('graph3d').style.display='block';
  renderGraph3D();
}

refreshState();
