function renderSankey(state) {
  const container = document.getElementById('sankey-container');
  if (!container) return;

  container.innerHTML = '';

  const nodeTypeMap = {};
  state.graph.nodes.forEach(n => {
    nodeTypeMap[n.id] = n.type;
  });

  const filteredEdges = state.graph.edges.filter(e => {
    const sourceType = nodeTypeMap[e.source];
    const targetType = nodeTypeMap[e.target];
    return !(sourceType === 'source' && targetType === 'source');
  });

  const nodeIndexMap = {};
  const sankeyNodes = state.graph.nodes.map((n, i) => {
    nodeIndexMap[n.id] = i;
    return { name: n.label };
  });

  const sankeyLinks = filteredEdges.map(e => ({
    source: nodeIndexMap[e.source],
    target: nodeIndexMap[e.target],
    value: 1
  }));

  const data = {
    nodes: sankeyNodes,
    links: sankeyLinks
  };

  const svg = d3.select(container)
    .append('svg')
    .attr('width', '100%')
    .attr('height', '600px');

  const { width, height } = svg.node().getBoundingClientRect();

  const sankey = d3.sankey()
    .nodeId(d => d.name)
    .nodeWidth(20)
    .nodePadding(30)
    .extent([[1, 1], [width - 1, height - 6]]);

  const { nodes, links } = sankey({
    nodes: data.nodes.map(d => Object.assign({}, d)),
    links: data.links.map(d => Object.assign({}, d))
  });

  const colorMap = {
    source: '#2563eb',
    ontology: '#16a34a',
    agent: '#9333ea',
    consumer: '#475569'
  };

  const getNodeColor = (nodeName) => {
    const node = state.graph.nodes.find(n => n.label === nodeName);
    return node ? colorMap[node.type] || '#64748b' : '#64748b';
  };

  svg.append('g')
    .attr('fill', 'none')
    .selectAll('path')
    .data(links)
    .join('path')
    .attr('d', d3.sankeyLinkHorizontal())
    .attr('stroke', '#0bcad9')
    .attr('stroke-width', d => Math.max(1, d.width))
    .attr('stroke-opacity', 0.4)
    .on('mouseover', function() {
      d3.select(this).attr('stroke-opacity', 0.7);
    })
    .on('mouseout', function() {
      d3.select(this).attr('stroke-opacity', 0.4);
    });

  const nodeGroups = svg.append('g')
    .selectAll('g')
    .data(nodes)
    .join('g');

  nodeGroups
    .append('rect')
    .attr('x', d => d.x0)
    .attr('y', d => d.y0)
    .attr('height', d => d.y1 - d.y0)
    .attr('width', d => d.x1 - d.x0)
    .attr('fill', d => getNodeColor(d.name))
    .attr('stroke', '#1e293b')
    .attr('stroke-width', 1)
    .style('cursor', 'pointer')
    .on('mouseover', function() {
      d3.select(this).attr('opacity', 0.8);
    })
    .on('mouseout', function() {
      d3.select(this).attr('opacity', 1);
    })
    .on('click', async (event, d) => {
      const node = state.graph.nodes.find(n => n.label === d.name);
      if (node) {
        const r = await fetch('/preview?node=' + encodeURIComponent(node.id));
        const data = await r.json();
        const evt = new CustomEvent('sankey-node-click', { detail: data });
        window.dispatchEvent(evt);
      }
    });

  nodeGroups
    .append('text')
    .attr('x', d => d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6)
    .attr('y', d => (d.y1 + d.y0) / 2)
    .attr('dy', '0.35em')
    .attr('text-anchor', d => d.x0 < width / 2 ? 'start' : 'end')
    .attr('fill', '#e2e8f0')
    .style('font-size', '11px')
    .style('font-weight', '500')
    .text(d => d.name);

  svg.append('text')
    .attr('x', 10)
    .attr('y', 20)
    .attr('fill', '#94a3b8')
    .style('font-size', '10px')
    .text('Data Sources → Ontology → Agents/Consumers');
}
