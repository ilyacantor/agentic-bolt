let graph3d;

function renderGraph3D() {
  const sourceNodes = state.graph.nodes.filter(n => n.type === 'source');
  const ontologyNodes = state.graph.nodes.filter(n => n.type === 'ontology' || n.type === 'ontology_unclassified');
  const agentNodes = state.graph.nodes.filter(n => n.type === 'agent');
  const consumerNodes = state.graph.nodes.filter(n => n.type === 'consumer');
  
  const nodes = [
    ...sourceNodes.map(n => ({ 
      id: n.id, 
      name: n.label, 
      type: 'source',
      color: '#2563eb'
    })),
    ...ontologyNodes.map(n => ({ 
      id: n.id, 
      name: n.label, 
      type: n.type === 'ontology_unclassified' ? 'ontology_unclassified' : 'ontology',
      color: n.type === 'ontology_unclassified' ? '#6b7280' : '#16a34a'
    })),
    ...agentNodes.map(n => ({ 
      id: n.id, 
      name: n.label, 
      type: 'agent',
      color: '#9333ea',
      pulse: true
    })),
    ...consumerNodes.map(n => ({ 
      id: n.id, 
      name: n.label, 
      type: 'consumer',
      color: '#475569'
    }))
  ];
  
  const links = state.graph.edges.map(e => ({
    source: e.source,
    target: e.target,
    label: e.label,
    type: e.type || 'default',
    confidence: e.confidence || 85,
    color: getConfidenceColor(e.confidence)
  }));
  
  const elem = document.getElementById('graph3d');
  
  if (!graph3d) {
    graph3d = ForceGraph3D()(elem)
      .backgroundColor('#ffffff')
      .nodeLabel('name')
      .nodeColor(node => node.color)
      .nodeOpacity(0.9)
      .nodeResolution(16)
      .nodeVal(node => 8)
      .linkLabel(link => `${link.label || ''} (${link.confidence}%)`)
      .linkColor(link => link.color)
      .linkWidth(2)
      .linkOpacity(0.6)
      .linkCurvature(0.25)
      .linkDirectionalArrowLength(6)
      .linkDirectionalArrowRelPos(1)
      .linkDirectionalParticles(link => link.type === 'mapping' ? 4 : 2)
      .linkDirectionalParticleSpeed(0.006)
      .linkDirectionalParticleWidth(3)
      .linkDirectionalParticleColor(() => '#facc15')
      .onNodeClick(async (node) => {
        const r = await fetch('/preview?node=' + encodeURIComponent(node.id));
        const data = await r.json();
        renderTable('preview_sources', data.sources);
        renderTable('preview_ontology', data.ontology);
      })
      .onNodeHover(node => {
        elem.style.cursor = node ? 'pointer' : null;
      })
      .enableNodeDrag(false)
      .enableNavigationControls(true)
      .showNavInfo(false);
  }
  
  graph3d.graphData({ nodes, links });
  
  const agentNodeObjects = nodes.filter(n => n.pulse);
  if (agentNodeObjects.length > 0) {
    let time = 0;
    setInterval(() => {
      time += 0.05;
      agentNodeObjects.forEach(node => {
        const obj = graph3d.nodeThreeObject(node);
        if (obj) {
          const scale = 1 + 0.3 * Math.sin(time * 2);
          obj.scale.set(scale, scale, scale);
        }
      });
    }, 50);
  }
}
