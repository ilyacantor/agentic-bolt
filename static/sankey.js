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

  // First pass: identify which ontology entities are consumed by agents
  const consumedOntologyIds = new Set();
  state.graph.edges.forEach(e => {
    const sourceType = state.graph.nodes.find(n => n.id === e.source)?.type;
    const targetType = state.graph.nodes.find(n => n.id === e.target)?.type;
    
    // If edge is from ontology to agent, mark the ontology entity as consumed
    if (sourceType === 'ontology' && targetType === 'agent') {
      consumedOntologyIds.add(e.source);
    }
  });

  // Second pass: identify which source nodes have edges to consumed ontology entities
  const usefulSourceIds = new Set();
  state.graph.edges.forEach(e => {
    const sourceType = state.graph.nodes.find(n => n.id === e.source)?.type;
    const targetType = state.graph.nodes.find(n => n.id === e.target)?.type;
    
    // If edge is from source to consumed ontology, mark the source as useful
    if (sourceType === 'source' && targetType === 'ontology' && consumedOntologyIds.has(e.target)) {
      usefulSourceIds.add(e.source);
    }
  });

  // Only add source nodes that have useful mappings
  Object.keys(sourceGroups).forEach(sourceSystem => {
    // Filter to only include tables that have useful mappings
    const usefulTables = sourceGroups[sourceSystem].filter(table => usefulSourceIds.has(table.id));
    
    // Only add parent node if there are useful tables
    if (usefulTables.length > 0) {
      const parentNodeName = sourceSystem.replace(/_/g, ' ').toLowerCase();
      const parentNodeId = `parent_${sourceSystem}`;
      nodeIndexMap[parentNodeId] = nodeIndex;
      sankeyNodes.push({ 
        name: parentNodeName, 
        type: 'source_parent',
        id: parentNodeId,
        sourceSystem: sourceSystem
      });
      nodeIndex++;

      usefulTables.forEach(table => {
        nodeIndexMap[table.id] = nodeIndex;
        sankeyNodes.push({ 
          name: table.tableName.toLowerCase(), 
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
    }
  });

  // Only add ontology nodes that are consumed by agents
  ontologyNodes.forEach(n => {
    if (consumedOntologyIds.has(n.id)) {
      nodeIndexMap[n.id] = nodeIndex;
      sankeyNodes.push({ name: n.label, type: n.type, id: n.id });
      nodeIndex++;
    }
  });

  // Add agent nodes and other nodes (agents are already in otherNodes)
  otherNodes.forEach(n => {
    nodeIndexMap[n.id] = nodeIndex;
    sankeyNodes.push({ name: n.label, type: n.type, id: n.id });
    nodeIndex++;
  });

  // Create links from state.graph.edges, filtering out unconsumed paths
  state.graph.edges.forEach(e => {
    const sourceType = state.graph.nodes.find(n => n.id === e.source)?.type;
    const targetType = state.graph.nodes.find(n => n.id === e.target)?.type;
    
    // Skip source-to-source edges
    if (sourceType === 'source' && targetType === 'source') {
      return;
    }
    
    // Skip source→ontology edges if the ontology entity isn't consumed by any agent
    if (sourceType === 'source' && targetType === 'ontology' && !consumedOntologyIds.has(e.target)) {
      return;
    }
    
    // Skip ontology→agent edges if the ontology entity isn't consumed
    if (sourceType === 'ontology' && targetType === 'agent' && !consumedOntologyIds.has(e.source)) {
      return;
    }
    
    // Create the link if both nodes exist in the Sankey
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
        sourceSystem: linkSourceSystem,
        targetType: targetType  // Track target type for coloring
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
  
  // Ensure valid dimensions to prevent RangeError
  const validWidth = width > 0 ? width : 800;  // Fallback to 800px if width is invalid
  const validHeight = height > 0 ? height : 600;  // Fallback to 600px if height is invalid

  const sankey = d3.sankey()
    .nodeWidth(20)
    .nodePadding(2)
    .extent([[1, 40], [validWidth - 1, validHeight - 6]]);

  const graph = sankey({
    nodes: data.nodes.map(d => Object.assign({}, d)),
    links: data.links.map(d => Object.assign({}, d))
  });

  const { nodes, links } = graph;

  // Manually center agent nodes vertically
  const agentNodesInSankey = nodes.filter(n => {
    const nodeData = sankeyNodes.find(sn => sn.name === n.name);
    return nodeData && nodeData.type === 'agent';
  });
  
  if (agentNodesInSankey.length > 0) {
    // Calculate total height of all agent nodes including padding
    const totalAgentHeight = agentNodesInSankey.reduce((sum, n) => sum + (n.y1 - n.y0), 0);
    const totalPadding = (agentNodesInSankey.length - 1) * 2; // 2px padding between agents
    const centerY = (validHeight - totalAgentHeight - totalPadding) / 2;
    
    // Reposition agents to be centered
    let currentY = centerY;
    agentNodesInSankey.forEach(node => {
      const nodeHeight = node.y1 - node.y0;
      node.y0 = currentY;
      node.y1 = currentY + nodeHeight;
      currentY += nodeHeight + 2; // 2px padding
    });
    
    // Update the sankey link generator to use the new positions
    sankey.update(graph);
  }

  const sourceColorMap = {
    dynamics: { parent: '#3b82f6', child: '#60a5fa' },
    salesforce: { parent: '#8b5cf6', child: '#a78bfa' },
    sap: { parent: '#10b981', child: '#34d399' },
    netsuite: { parent: '#f59e0b', child: '#fbbf24' },
    legacy_sql: { parent: '#ef4444', child: '#f87171' },
    snowflake: { parent: '#06b6d4', child: '#22d3ee' },
    supabase: { parent: '#14b8a6', child: '#2dd4bf' },
    mongodb: { parent: '#10b981', child: '#34d399' }
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
      
      // Check if this link goes to an agent (ontology -> agent edges)
      const targetNode = sankeyNodes.find(n => n.name === d.target.name);
      if (targetNode && targetNode.type === 'agent') {
        return '#9333ea';  // Purple for ontology->agent connections (consumed data)
      }
      
      // Source->ontology edges keep source colors
      if (originalLink && originalLink.sourceSystem) {
        return sourceColorMap[originalLink.sourceSystem]?.child || '#0bcad9';
      }
      
      return '#64748b';  // Grey for any other edge type
    })
    .attr('stroke-width', d => Math.max(1, d.width))
    .attr('stroke-opacity', 0.5)
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

  // Helper to get source system type and colors
  const getSourceTypeInfo = (nodeData) => {
    const typeMap = {
      dynamics: { type: 'crm', icon: '📱', bgColor: '#1e3a8a', borderColor: '#3b82f6' },
      salesforce: { type: 'crm', icon: '📱', bgColor: '#1e3a8a', borderColor: '#3b82f6' },
      sap: { type: 'erp', icon: '🏢', bgColor: '#14532d', borderColor: '#10b981' },
      netsuite: { type: 'erp', icon: '🏢', bgColor: '#14532d', borderColor: '#10b981' },
      legacy_sql: { type: 'database', icon: '💾', bgColor: '#7f1d1d', borderColor: '#ef4444' },
      snowflake: { type: 'warehouse', icon: '🏛️', bgColor: '#164e63', borderColor: '#06b6d4' },
      supabase: { type: 'database', icon: '💾', bgColor: '#7f1d1d', borderColor: '#ef4444' },
      mongodb: { type: 'database', icon: '💾', bgColor: '#7f1d1d', borderColor: '#ef4444' }
    };
    
    if (nodeData.sourceSystem && typeMap[nodeData.sourceSystem]) {
      return typeMap[nodeData.sourceSystem];
    }
    return null;
  };

  // Render labels with form-fitting boxes for all node types
  nodeGroups.each(function(d) {
    const nodeData = sankeyNodes.find(n => n.name === d.name);
    const isLeft = d.x0 < validWidth / 2;
    const typeInfo = getSourceTypeInfo(nodeData);
    const group = d3.select(this);
    const textX = isLeft ? d.x1 + 6 : d.x0 - 6;
    const textY = (d.y1 + d.y0) / 2;
    const padding = 4;
    
    // Source parent nodes (data sources) with icons and type-specific colors
    if (nodeData && nodeData.type === 'source_parent' && typeInfo) {
      const textWidth = d.name.length * 6.5 + 18;
      const rectWidth = textWidth + padding * 2;
      const rectHeight = 18;
      
      group.append('rect')
        .attr('x', isLeft ? textX - padding : textX - rectWidth + padding)
        .attr('y', textY - rectHeight / 2)
        .attr('width', rectWidth)
        .attr('height', rectHeight)
        .attr('rx', 4)
        .attr('fill', typeInfo.bgColor)
        .attr('stroke', typeInfo.borderColor)
        .attr('stroke-width', 0.5)
        .attr('opacity', 0.7);
      
      group.append('text')
        .attr('x', isLeft ? textX + 2 : textX - rectWidth + padding + 2)
        .attr('y', textY)
        .attr('dy', '0.35em')
        .attr('text-anchor', 'start')
        .attr('fill', '#e2e8f0')
        .style('font-size', '10px')
        .text(typeInfo.icon);
      
      group.append('text')
        .attr('x', isLeft ? textX + 18 : textX - rectWidth + padding + 18)
        .attr('y', textY)
        .attr('dy', '0.35em')
        .attr('text-anchor', 'start')
        .attr('fill', '#e2e8f0')
        .style('font-size', '9px')
        .style('font-weight', '600')
        .text(d.name);
    }
    // Source table/field nodes - smaller with tighter boxes
    else if (nodeData && nodeData.type === 'source' && typeInfo) {
      const textWidth = d.name.length * 5;
      const rectWidth = textWidth + padding * 2;
      const rectHeight = 14;
      
      group.append('rect')
        .attr('x', isLeft ? textX - padding : textX - rectWidth + padding)
        .attr('y', textY - rectHeight / 2)
        .attr('width', rectWidth)
        .attr('height', rectHeight)
        .attr('rx', 3)
        .attr('fill', typeInfo.bgColor)
        .attr('stroke', typeInfo.borderColor)
        .attr('stroke-width', 0.5)
        .attr('opacity', 0.7);
      
      group.append('text')
        .attr('x', isLeft ? textX + padding : textX - padding)
        .attr('y', textY)
        .attr('dy', '0.35em')
        .attr('text-anchor', isLeft ? 'start' : 'end')
        .attr('fill', '#e2e8f0')
        .style('font-size', '8px')
        .style('font-weight', '600')
        .text(d.name);
    } 
    // Agent nodes with purple styling
    else if (nodeData && nodeData.type === 'agent') {
      const textWidth = d.name.length * 7;
      const rectWidth = textWidth + padding * 2;
      const rectHeight = 20;
      
      group.append('rect')
        .attr('x', isLeft ? textX - padding : textX - rectWidth + padding)
        .attr('y', textY - rectHeight / 2)
        .attr('width', rectWidth)
        .attr('height', rectHeight)
        .attr('rx', 5)
        .attr('fill', '#581c87')
        .attr('stroke', '#9333ea')
        .attr('stroke-width', 1)
        .attr('opacity', 0.8);
      
      group.append('text')
        .attr('x', isLeft ? textX + padding : textX - padding)
        .attr('y', textY)
        .attr('dy', '0.35em')
        .attr('text-anchor', isLeft ? 'start' : 'end')
        .attr('fill', '#e9d5ff')
        .style('font-size', '10px')
        .style('font-weight', '700')
        .text(d.name);
    }
    // Ontology nodes - smaller with tighter green boxes
    else {
      const textWidth = d.name.length * 5.5;
      const rectWidth = textWidth + padding * 2;
      const rectHeight = 14;
      
      group.append('rect')
        .attr('x', isLeft ? textX - padding : textX - rectWidth + padding)
        .attr('y', textY - rectHeight / 2)
        .attr('width', rectWidth)
        .attr('height', rectHeight)
        .attr('rx', 3)
        .attr('fill', '#14532d')
        .attr('stroke', '#16a34a')
        .attr('stroke-width', 0.5)
        .attr('opacity', 0.7);
      
      group.append('text')
        .attr('x', isLeft ? textX + padding : textX - padding)
        .attr('y', textY)
        .attr('dy', '0.35em')
        .attr('text-anchor', isLeft ? 'start' : 'end')
        .attr('fill', '#e2e8f0')
        .style('font-size', '8px')
        .style('font-weight', '500')
        .text(d.name);
    }
  });

  // Title without redundant agent labels (agents are already labeled on the nodes)
  svg.append('text')
    .attr('x', 10)
    .attr('y', 20)
    .attr('fill', '#94a3b8')
    .style('font-size', '10px')
    .text('Data Sources → Tables → Unified Ontology → Agents');
}
