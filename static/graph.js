let state = {events: [], timeline: [], graph: {nodes:[], edges:[], confidence:null, last_updated:null}, preview:{sources:{}, ontology:{}}, llm:{calls:0, tokens:0}, auto_ingest_unmapped:false};

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

  const elements = [
    ...state.graph.nodes.map(n => ({
      data: { id: n.id, label: n.label, type: n.type }
    })),
    ...state.graph.edges.map(e => ({
      data: { source: e.source, target: e.target, label: e.label || "", type: e.type || "" }
    }))
  ];

  // deterministic positions by type
  const positions = computePositionsByType(state.graph.nodes);

  if (!window.__cy) {
    window.__cy = cytoscape({
      container: document.getElementById("cy"),
      elements,
      style: [
        { selector: "node[type='source']", style: { "background-color": "#2563eb", "shape": "round-rectangle", "color": "#fff", "label": "data(label)" }},
        { selector: "node[type='agent']",   style: { "background-color": "#9333ea", "shape": "ellipse", "color": "#fff", "label": "data(label)" }},
        { selector: "node[type='ontology']",style: { "background-color": "#16a34a", "shape": "round-rectangle", "color": "#fff", "label": "data(label)" }},
        { selector: "node[type='consumer']",style: { "background-color": "#475569", "shape": "rectangle", "color": "#fff", "label": "data(label)" }},
        { selector: "edge", style: { "curve-style": "bezier", "line-color": "#9ca3af", "target-arrow-shape": "triangle", "target-arrow-color": "#9ca3af", "width": 2, "label": "data(label)" }}
      ],
      layout: { name: "preset", positions, fit: true, padding: 20 }
    });

    // lock nodes so nothing moves
    window.__cy.nodes().lock();

    // Add click handler for preview
    window.__cy.on('tap', 'node', async (evt) => {
      const id = evt.target.id();
      const r = await fetch('/preview?node=' + encodeURIComponent(id));
      const data = await r.json();
      renderTable('preview_sources', data.sources);
      renderTable('preview_ontology', data.ontology);
    });

  } else {
    const cy = window.__cy;
    cy.elements().remove();
    cy.add(elements);
    cy.layout({ name: "preset", positions, fit: true }).run();
    cy.nodes().lock();
  }
}

function computePositionsByType(nodes) {
  const colIndex = { source: 0, agent: 1, ontology: 2, consumer: 3 };
  const colX = [140, 420, 700, 980];
  const rowGap = 110, yStart = 120;
  const counters = [0, 0, 0, 0], pos = {};
  nodes.forEach(n => {
    const t = n.type || "source";
    const col = colIndex[t] !== undefined ? colIndex[t] : 1;
    const x = colX[col];
    const y = yStart + counters[col] * rowGap;
    counters[col] += 1;
    pos[n.id] = { x, y };
  });
  return pos;
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
