function renderSankey(state) {
  const container = document.getElementById('sankey-container');
  if (!container) return;

  container.innerHTML = '';

  const sankeyNodes = [];
  const sankeyLinks = [];
  const nodeIndexMap = {};
  let nodeIndex = 0;

  const sourceGroups = {};
  const ontologyNodes = [];
  const otherNodes = [];

  state.graph.nodes.forEach(n => {
    if (n.type === 'source') {
      const match = n.id.match(/^src_([^_]+)_(.+)$/);
      if (match) {
        const sourceSystem = match[1];
        const tableName = match[2];
        if (!sourceGroups[sourceSystem]) {
          sourceGroups[sourceSystem] = [];
        }
        sourceGroups[sourceSystem].push({
          id: n.id,
          label: n.label,
          tableName: tableName,
          type: n.type
        });
      }
    } else if (n.type === 'ontology') {
      ontologyNodes.push(n);
    } else {
      otherNodes.push(n);
    }
  });

  Object.keys(sourceGroups).forEach(sourceSystem => {
    const parentNodeName = sourceSystem.charAt(0).toUpperCase() + sourceSystem.slice(1).replace(/_/g, ' ');
    const parentNodeId = `parent_${sourceSystem}`;
    nodeIndexMap[parentNodeId] = nodeIndex;
    sankeyNodes.push({ 
      name: parentNodeName, 
      type: 'source_parent',
      id: parentNodeId,
      sourceSystem: sourceSystem
    });
    nodeIndex++;

    sourceGroups[sourceSystem].forEach(table => {
      nodeIndexMap[table.id] = nodeIndex;
      sankeyNodes.push({ 
        name: table.tableName, 
        type: 'source',
        id: table.id,
        sourceSystem: sourceSystem
      });
      sankeyLinks.push({
        source: nodeIndexMap[parentNodeId],
        target: nodeIndexMap[table.id],
        value: 1,
        sourceSystem: sourceSystem
      });
      nodeIndex++;
    });
  });

  ontologyNodes.forEach(n => {
    nodeIndexMap[n.id] = nodeIndex;
    sankeyNodes.push({ name: n.label, type: n.type, id: n.id });
    nodeIndex++;
  });

  otherNodes.forEach(n => {
    nodeIndexMap[n.id] = nodeIndex;
    sankeyNodes.push({ name: n.label, type: n.type, id: n.id });
    nodeIndex++;
  });

  state.graph.edges.forEach(e => {
    const sourceType = state.graph.nodes.find(n => n.id === e.source)?.type;
    const targetType = state.graph.nodes.find(n => n.id === e.target)?.type;
    
    if (sourceType === 'source' && targetType === 'source') {
      return;
    }
    
    if (nodeIndexMap[e.source] !== undefined && nodeIndexMap[e.target] !== undefined) {
      const sourceNode = state.graph.nodes.find(n => n.id === e.source);
      let linkSourceSystem = null;
      
      if (sourceNode?.type === 'source') {
        const match = sourceNode.id.match(/^src_([^_]+)_(.+)$/);
        if (match) {
          linkSourceSystem = match[1];
        }
      }
      
      sankeyLinks.push({
        source: nodeIndexMap[e.source],
        target: nodeIndexMap[e.target],
        value: 1,
        sourceSystem: linkSourceSystem
      });
    }
  });

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
    .nodeWidth(20)
    .nodePadding(30)
    .extent([[1, 1], [width - 1, height - 6]]);

  const { nodes, links } = sankey({
    nodes: data.nodes.map(d => Object.assign({}, d)),
    links: data.links.map(d => Object.assign({}, d))
  });

  const sourceColorMap = {
    dynamics: { parent: '#3b82f6', child: '#60a5fa' },
    salesforce: { parent: '#8b5cf6', child: '#a78bfa' },
    sap: { parent: '#10b981', child: '#34d399' },
    netsuite: { parent: '#f59e0b', child: '#fbbf24' },
    legacy_sql: { parent: '#ef4444', child: '#f87171' },
    snowflake: { parent: '#06b6d4', child: '#22d3ee' }
  };

  const typeColorMap = {
    ontology: '#16a34a',
    agent: '#9333ea',
    consumer: '#475569'
  };

  const getNodeColor = (nodeData) => {
    if (nodeData.type === 'source_parent' && nodeData.sourceSystem) {
      return sourceColorMap[nodeData.sourceSystem]?.parent || '#1e40af';
    } else if (nodeData.type === 'source' && nodeData.sourceSystem) {
      return sourceColorMap[nodeData.sourceSystem]?.child || '#2563eb';
    }
    return typeColorMap[nodeData.type] || '#64748b';
  };

  const getLinkColor = (linkData) => {
    const originalLink = sankeyLinks.find((l, i) => {
      return links[i] === linkData;
    });
    
    if (originalLink && originalLink.sourceSystem) {
      return sourceColorMap[originalLink.sourceSystem]?.child || '#0bcad9';
    }
    return '#0bcad9';
  };

  svg.append('g')
    .attr('fill', 'none')
    .selectAll('path')
    .data(links)
    .join('path')
    .attr('d', d3.sankeyLinkHorizontal())
    .attr('stroke', (d, i) => {
      const originalLink = sankeyLinks[i];
      if (originalLink && originalLink.sourceSystem) {
        return sourceColorMap[originalLink.sourceSystem]?.child || '#0bcad9';
      }
      return '#64748b';
    })
    .attr('stroke-width', d => Math.max(1, d.width))
    .attr('stroke-opacity', 0.4)
    .style('cursor', 'pointer')
    .on('mouseover', function() {
      d3.select(this).attr('stroke-opacity', 0.7);
    })
    .on('mouseout', function() {
      d3.select(this).attr('stroke-opacity', 0.4);
    })
    .on('click', async (event, d) => {
      const sourceNodeData = sankeyNodes.find(n => n.name === d.source.name);
      const targetNodeData = sankeyNodes.find(n => n.name === d.target.name);
      if (targetNodeData && targetNodeData.id && targetNodeData.type === 'ontology') {
        const combinedData = {
          sources: {},
          ontology: {},
          connectionInfo: {
            from: sourceNodeData?.name || 'Unknown',
            to: targetNodeData?.name || 'Unknown'
          }
        };
        
        if (sourceNodeData && sourceNodeData.id && sourceNodeData.type === 'source') {
          const sourceRes = await fetch('/preview?node=' + encodeURIComponent(sourceNodeData.id));
          const sourceData = await sourceRes.json();
          combinedData.sources = sourceData.sources || {};
        }
        
        const targetRes = await fetch('/preview?node=' + encodeURIComponent(targetNodeData.id));
        const targetData = await targetRes.json();
        combinedData.ontology = targetData.ontology || {};
        
        const evt = new CustomEvent('sankey-node-click', { detail: combinedData });
        window.dispatchEvent(evt);
      }
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
    .attr('fill', d => {
      const nodeData = sankeyNodes.find(n => n.name === d.name);
      return getNodeColor(nodeData);
    })
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
      const nodeData = sankeyNodes.find(n => n.name === d.name);
      if (nodeData && nodeData.id && !nodeData.id.startsWith('parent_')) {
        const r = await fetch('/preview?node=' + encodeURIComponent(nodeData.id));
        const data = await r.json();
        const evt = new CustomEvent('sankey-node-click', { detail: data });
        window.dispatchEvent(evt);
      }
    });

  // Add icons for source parent nodes
  const sourceIcons = {
    dynamics: 'M12 2L2 7v10l10 5 10-5V7L12 2zm0 18.5l-8-4V8.5l8 4v8zm8-4l-8 4v-8l8-4v8z',
    salesforce: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
    sap: 'M3 3h18v18H3V3zm16 16V5H5v14h14zM7 7h10v2H7V7zm0 4h10v2H7v-2zm0 4h7v2H7v-2z',
    netsuite: 'M12 2L2 7v10l10 5 10-5V7L12 2zm0 18.5l-8-4V8.5l8 4v8zm8-4l-8 4v-8l8-4v8z',
    legacy_sql: 'M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z',
    snowflake: 'M12 2l2 3.5-2 3.5-2-3.5L12 2zm0 20l-2-3.5 2-3.5 2 3.5-2 3.5zm10-10l-3.5-2 3.5-2 3.5 2-3.5 2zm-20 0l3.5 2-3.5 2-3.5-2 3.5-2z'
  };

  nodeGroups.each(function(d) {
    const nodeData = sankeyNodes.find(n => n.name === d.name);
    if (nodeData && nodeData.type === 'source_parent' && nodeData.sourceSystem) {
      const iconPath = sourceIcons[nodeData.sourceSystem];
      if (iconPath) {
        const iconSize = 20;
        const iconX = d.x0 - iconSize - 8;
        const iconY = (d.y1 + d.y0) / 2 - iconSize / 2;
        
        d3.select(this)
          .append('svg')
          .attr('x', iconX)
          .attr('y', iconY)
          .attr('width', iconSize)
          .attr('height', iconSize)
          .attr('viewBox', '0 0 24 24')
          .append('path')
          .attr('d', iconPath)
          .attr('fill', sourceColorMap[nodeData.sourceSystem]?.parent || '#3b82f6')
          .attr('opacity', 0.8);
      }
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
    .text('Data Sources → Tables → Ontology → Agents/Consumers');
}
