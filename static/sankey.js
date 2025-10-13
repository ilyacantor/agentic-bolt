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

  // Add agent nodes from graph state
  const agentNodes = state.graph.nodes.filter(n => n.type === 'agent');
  agentNodes.forEach(n => {
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

  // Connect ontology nodes to their consumer agents based on agent consumption metadata
  // Only create links when an agent actually consumes that specific entity
  const agentConsumption = state.agent_consumption || {};
  
  agentNodes.forEach(agentNode => {
    // Extract agent_id from node id (format: agent_revops_pilot -> revops_pilot)
    const agentId = agentNode.id.replace('agent_', '');
    const consumedEntities = agentConsumption[agentId] || [];
    
    ontologyNodes.forEach(ontNode => {
      // Extract entity name from ontology node id (format: dcl_customer -> customer)
      const entityName = ontNode.id.replace('dcl_', '');
      
      // Only create link if this agent consumes this entity
      if (consumedEntities.includes(entityName) && 
          nodeIndexMap[ontNode.id] !== undefined && 
          nodeIndexMap[agentNode.id] !== undefined) {
        sankeyLinks.push({
          source: nodeIndexMap[ontNode.id],
          target: nodeIndexMap[agentNode.id],
          value: 1,
          targetType: 'agent'
        });
      }
    });
  });

  const data = {
    nodes: sankeyNodes,
    links: sankeyLinks
  };

  // Create main SVG with zoom and pan capabilities
  const svg = d3.select(container)
    .append('svg')
    .attr('width', '100%')
    .attr('height', '600px');

  const { width, height } = svg.node().getBoundingClientRect();

  // Create main group for zoom/pan
  const mainGroup = svg.append('g')
    .attr('class', 'main-sankey-group');

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

  // Render links
  mainGroup.append('g')
    .attr('fill', 'none')
    .selectAll('path')
    .data(links)
    .join('path')
    .attr('d', d3.sankeyLinkHorizontal())
    .attr('stroke', (d, i) => {
      const originalLink = sankeyLinks[i];
      if (originalLink && originalLink.targetType === 'agent') {
        return '#9333ea';  // Purple for agent connections
      }
      if (originalLink && originalLink.sourceSystem) {
        return sourceColorMap[originalLink.sourceSystem]?.child || '#0bcad9';
      }
      return '#64748b';
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

  // Render nodes
  const nodeGroups = mainGroup.append('g')
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

  // Dynamic title based on agents
  const agentNames = agentNodes.map(a => a.label).join(', ') || 'Agents';
  mainGroup.append('text')
    .attr('x', 10)
    .attr('y', 20)
    .attr('fill', '#94a3b8')
    .style('font-size', '10px')
    .text(`Data Sources → Tables → Unified Ontology → ${agentNames}`);

  // Add zoom and pan behavior
  const zoom = d3.zoom()
    .scaleExtent([0.5, 3])
    .on('zoom', (event) => {
      mainGroup.attr('transform', event.transform);
      updateMiniMapViewport(event.transform);
    });

  svg.call(zoom);

  // Create mini-map
  const minimapWidth = 180;
  const minimapHeight = 120;
  const minimapMargin = 15;

  const minimap = svg.append('g')
    .attr('class', 'minimap')
    .attr('transform', `translate(${width - minimapWidth - minimapMargin}, ${minimapMargin})`);

  // Mini-map background
  minimap.append('rect')
    .attr('width', minimapWidth)
    .attr('height', minimapHeight)
    .attr('fill', '#0f172a')
    .attr('stroke', '#334155')
    .attr('stroke-width', 1.5)
    .attr('rx', 4);

  // Calculate mini-map scale
  const minimapScaleX = minimapWidth / width;
  const minimapScaleY = minimapHeight / height;
  const minimapScale = Math.min(minimapScaleX, minimapScaleY) * 0.9;

  const minimapGroup = minimap.append('g')
    .attr('transform', `translate(${minimapWidth / 2}, ${minimapHeight / 2}) scale(${minimapScale}) translate(${-width / 2}, ${-height / 2})`);

  // Render mini-map links
  minimapGroup.append('g')
    .attr('fill', 'none')
    .selectAll('path')
    .data(links)
    .join('path')
    .attr('d', d3.sankeyLinkHorizontal())
    .attr('stroke', (d, i) => {
      const originalLink = sankeyLinks[i];
      if (originalLink && originalLink.targetType === 'agent') {
        return '#9333ea';
      }
      if (originalLink && originalLink.sourceSystem) {
        return sourceColorMap[originalLink.sourceSystem]?.child || '#0bcad9';
      }
      return '#64748b';
    })
    .attr('stroke-width', 2)
    .attr('stroke-opacity', 0.6);

  // Render mini-map nodes
  minimapGroup.append('g')
    .selectAll('rect')
    .data(nodes)
    .join('rect')
    .attr('x', d => d.x0)
    .attr('y', d => d.y0)
    .attr('height', d => d.y1 - d.y0)
    .attr('width', d => d.x1 - d.x0)
    .attr('fill', d => {
      const nodeData = sankeyNodes.find(n => n.name === d.name);
      return getNodeColor(nodeData);
    })
    .attr('stroke', 'none');

  // Viewport indicator
  const viewportRect = minimap.append('rect')
    .attr('class', 'viewport-indicator')
    .attr('fill', 'none')
    .attr('stroke', '#06b6d4')
    .attr('stroke-width', 2)
    .attr('rx', 2)
    .style('pointer-events', 'all')
    .style('cursor', 'move');

  // Function to update viewport indicator
  function updateMiniMapViewport(transform) {
    const scale = transform.k;
    const translateX = transform.x;
    const translateY = transform.y;

    const viewportWidth = (width / scale) * minimapScale;
    const viewportHeight = (height / scale) * minimapScale;
    const viewportX = minimapWidth / 2 - (width / 2 + translateX / scale) * minimapScale;
    const viewportY = minimapHeight / 2 - (height / 2 + translateY / scale) * minimapScale;

    viewportRect
      .attr('x', viewportX)
      .attr('y', viewportY)
      .attr('width', viewportWidth)
      .attr('height', viewportHeight);
  }

  // Initialize viewport
  updateMiniMapViewport(d3.zoomIdentity);

  // Mini-map click-to-navigate
  minimap.on('click', function(event) {
    const [mx, my] = d3.pointer(event);
    
    const targetX = (mx - minimapWidth / 2) / minimapScale + width / 2;
    const targetY = (my - minimapHeight / 2) / minimapScale + height / 2;
    
    const currentTransform = d3.zoomTransform(svg.node());
    const scale = currentTransform.k;
    
    const newTransform = d3.zoomIdentity
      .translate((width / 2 - targetX * scale) / scale, (height / 2 - targetY * scale) / scale)
      .scale(scale);
    
    svg.transition()
      .duration(300)
      .call(zoom.transform, newTransform);
  });

  // Viewport drag behavior
  const viewportDrag = d3.drag()
    .on('drag', function(event) {
      const currentTransform = d3.zoomTransform(svg.node());
      const scale = currentTransform.k;
      
      const dx = -event.dx / minimapScale;
      const dy = -event.dy / minimapScale;
      
      const newTransform = d3.zoomIdentity
        .translate((currentTransform.x + dx) / scale, (currentTransform.y + dy) / scale)
        .scale(scale);
      
      svg.call(zoom.transform, newTransform);
    });

  viewportRect.call(viewportDrag);
}
