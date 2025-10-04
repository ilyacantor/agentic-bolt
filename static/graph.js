let state = {events: [], timeline: [], graph: {nodes:[], edges:[], confidence:null, last_updated:null}, preview:{sources:{}, ontology:{}}, llm:{calls:0, tokens:0}, auto_ingest_unmapped:false};
let cy;

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

function getConfidenceColor(confidence) {
  if (!confidence) return '#94a3b8';
  if (confidence > 80) return '#16a34a';
  if (confidence > 60) return '#eab308';
  return '#ef4444';
}

function renderGraph(){
  const sourceNodes = state.graph.nodes.filter(n => n.type === 'source');
  const ontologyNodes = state.graph.nodes.filter(n => n.type === 'ontology' || n.type === 'ontology_unclassified');
  const agentNodes = state.graph.nodes.filter(n => n.type === 'agent');
  const consumerNodes = state.graph.nodes.filter(n => n.type === 'consumer');
  
  const nodes = [
    ...sourceNodes.map(n => ({ 
      data: { id: n.id, label: n.label, type: 'source' }
    })),
    ...ontologyNodes.map(n => ({ 
      data: { id: n.id, label: n.label, type: n.type || 'ontology' }
    })),
    ...agentNodes.map(n => ({ 
      data: { id: n.id, label: n.label, type: 'agent' }
    })),
    ...consumerNodes.map(n => ({ 
      data: { id: n.id, label: n.label, type: 'consumer' }
    }))
  ];
  
  const edges = state.graph.edges.map(e => ({ 
    data: { 
      source: e.source, 
      target: e.target, 
      label: e.label, 
      type: e.type || 'default',
      confidence: e.confidence || 85,
      color: getConfidenceColor(e.confidence)
    } 
  }));
  
  if(!cy){
    cy = cytoscape({
      container: document.getElementById('cy'),
      elements: [],
      style: [
        {
          selector: 'node[type="source"]',
          style: {
            'background-color': '#2563eb',
            'label': 'data(label)',
            'color': '#ffffff',
            'font-size': 13,
            'text-valign': 'center',
            'text-halign': 'center',
            'shape': 'round-rectangle',
            'padding': '12px',
            'width': 'label',
            'height': 'label',
            'border-width': 2,
            'border-color': '#1e40af',
            'text-wrap': 'wrap',
            'text-max-width': '120px'
          }
        },
        {
          selector: 'node[type="ontology"]',
          style: {
            'background-color': '#16a34a',
            'label': 'data(label)',
            'color': '#ffffff',
            'font-size': 13,
            'text-valign': 'center',
            'text-halign': 'center',
            'shape': 'round-rectangle',
            'padding': '12px',
            'width': 'label',
            'height': 'label',
            'border-width': 2,
            'border-color': '#15803d'
          }
        },
        {
          selector: 'node[type="ontology_unclassified"]',
          style: {
            'background-color': '#6b7280',
            'label': 'data(label)',
            'color': '#ffffff',
            'font-size': 13,
            'text-valign': 'center',
            'text-halign': 'center',
            'shape': 'round-rectangle',
            'padding': '12px',
            'width': 'label',
            'height': 'label',
            'border-width': 2,
            'border-color': '#4b5563',
            'border-style': 'dashed'
          }
        },
        {
          selector: 'node[type="agent"]',
          style: {
            'background-color': '#9333ea',
            'label': 'data(label)',
            'color': '#ffffff',
            'font-size': 13,
            'text-valign': 'center',
            'text-halign': 'center',
            'shape': 'ellipse',
            'padding': '12px',
            'width': 'label',
            'height': 'label',
            'border-width': 3,
            'border-color': '#7e22ce'
          }
        },
        {
          selector: 'node[type="consumer"]',
          style: {
            'background-color': '#475569',
            'label': 'data(label)',
            'color': '#ffffff',
            'font-size': 13,
            'text-valign': 'center',
            'text-halign': 'center',
            'shape': 'rectangle',
            'padding': '12px',
            'width': 'label',
            'height': 'label',
            'border-width': 2,
            'border-color': '#334155'
          }
        },
        {
          selector: 'node:selected',
          style: {
            'border-color': '#facc15',
            'border-width': 4
          }
        },
        {
          selector: 'edge[type="mapping"]',
          style: {
            'line-color': 'data(color)',
            'width': 2,
            'line-style': 'dashed',
            'curve-style': 'bezier',
            'target-arrow-shape': 'triangle',
            'target-arrow-color': 'data(color)',
            'label': 'data(label)',
            'font-size': 10,
            'text-rotation': 'autorotate',
            'text-margin-y': -8
          }
        },
        {
          selector: 'edge[type!="mapping"]',
          style: {
            'line-color': 'data(color)',
            'width': 2,
            'curve-style': 'bezier',
            'target-arrow-shape': 'triangle',
            'target-arrow-color': 'data(color)'
          }
        }
      ],
      layout: { 
        name: 'cose-bilkent',
        quality: 'proof',
        animate: true,
        animationDuration: 1000,
        randomize: false,
        nodeDimensionsIncludeLabels: true,
        idealEdgeLength: 150,
        edgeElasticity: 0.45,
        nestingFactor: 0.1,
        gravity: 0.25,
        numIter: 2500,
        tile: true,
        tilingPaddingVertical: 10,
        tilingPaddingHorizontal: 10
      }
    });

    cy.on('tap', 'node', async (evt) => {
      const id = evt.target.id();
      evt.target.select();
      const r = await fetch('/preview?node=' + encodeURIComponent(id));
      const data = await r.json();
      renderTable('preview_sources', data.sources);
      renderTable('preview_ontology', data.ontology);
    });

    cy.on('mouseover', 'node', (evt) => {
      evt.target.style('border-color', '#facc15');
      evt.target.style('border-width', 4);
    });

    cy.on('mouseout', 'node', (evt) => {
      if (!evt.target.selected()) {
        const type = evt.target.data('type');
        const colors = {
          'source': '#1e40af',
          'ontology': '#15803d',
          'ontology_unclassified': '#4b5563',
          'agent': '#7e22ce',
          'consumer': '#334155'
        };
        evt.target.style('border-color', colors[type] || '#94a3b8');
        evt.target.style('border-width', 2);
      }
    });
  }
  
  cy.elements().remove();
  cy.add(nodes);
  cy.add(edges);
  cy.layout({ 
    name: 'cose-bilkent',
    quality: 'proof',
    animate: true,
    animationDuration: 1000,
    randomize: false,
    nodeDimensionsIncludeLabels: true,
    idealEdgeLength: 150,
    edgeElasticity: 0.45,
    nestingFactor: 0.1,
    gravity: 0.25,
    numIter: 2500,
    tile: true
  }).run();
  
  cy.nodes('[type="agent"]').forEach(node => {
    setInterval(() => {
      node.animate({
        style: { 'border-width': 5, 'border-color': '#c084fc' },
        duration: 1000
      }).animate({
        style: { 'border-width': 3, 'border-color': '#7e22ce' },
        duration: 1000
      });
    }, 2000);
  });
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
  if (cy) {
    cy.resize();
    renderGraph();
  }
}

function show3D() {
  document.getElementById('cy').style.display='none';
  document.getElementById('graph3d').style.display='block';
  renderGraph3D();
}
