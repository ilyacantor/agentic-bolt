function DCLDashboard(){
  const [state, setState] = React.useState({
    events: [],
    graph: {nodes: [], edges: []},
    llm: {calls: 0, tokens: 0},
    preview: {sources: {}, ontology: {}, connectionInfo: null},
    rag: {retrievals: [], total_mappings: 0, last_retrieval_count: 0}
  });
  const [selectedSources, setSelectedSources] = React.useState([]);
  const [selectedAgents, setSelectedAgents] = React.useState(['finops_pilot']);
  const [processState, setProcessState] = React.useState({ active: false, stage: '', progress: 0, complete: false });
  const [viewType, setViewType] = React.useState('cytoscape');
  const [leftPanelCollapsed, setLeftPanelCollapsed] = React.useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = React.useState(false);
  const cyRef = React.useRef(null);

  React.useEffect(()=>{
    fetchState();
    const interval = setInterval(fetchState, 2000);
    return () => clearInterval(interval);
  },[]);

  React.useEffect(()=>{
    if(state.graph.nodes.length > 0){
      if(viewType === 'cytoscape'){
        renderGraph();
      } else {
        renderSankey(state);
      }
    }
  },[state.graph, viewType]);

  React.useEffect(() => {
    const handleSankeyNodeClick = (e) => {
      if (e.detail.connectionInfo) {
        setState(prev => ({...prev, preview: e.detail}));
      } else {
        setState(prev => ({...prev, preview: {...e.detail, connectionInfo: prev.preview.connectionInfo}}));
      }
    };
    window.addEventListener('sankey-node-click', handleSankeyNodeClick);
    return () => window.removeEventListener('sankey-node-click', handleSankeyNodeClick);
  }, []);

  async function fetchState(){
    const res = await fetch('/state');
    const data = await res.json();
    setState(prev => {
      const hasConnectionInfo = prev.preview.connectionInfo !== null && prev.preview.connectionInfo !== undefined;
      return {
        ...data,
        preview: hasConnectionInfo ? prev.preview : data.preview
      };
    });
  }

  async function connectSources(){
    if (selectedSources.length === 0) {
      alert('Please select at least one data source');
      return;
    }
    if (selectedAgents.length === 0) {
      alert('Please select at least one agent');
      return;
    }
    
    setProcessState({ active: true, stage: 'Connecting to data sources...', progress: 20, complete: false });
    
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      setProcessState({ active: true, stage: 'Analyzing schema structure...', progress: 40, complete: false });
      
      const sourcesParam = selectedSources.join(',');
      const agentsParam = selectedAgents.join(',');
      const res = await fetch(`/connect?sources=${sourcesParam}&agents=${agentsParam}`);
      setProcessState({ active: true, stage: 'Mapping fields to ontology...', progress: 70, complete: false });
      
      await res.json();
      setProcessState({ active: true, stage: 'Validating mappings...', progress: 90, complete: false });
      
      await fetchState();
      setProcessState({ active: true, stage: 'Completed successfully', progress: 100, complete: true });
    } catch (error) {
      setProcessState({ active: true, stage: 'Failed', progress: 0, complete: true });
    }
  }

  function toggleSource(value) {
    setSelectedSources(prev => 
      prev.includes(value) ? prev.filter(s => s !== value) : [...prev, value]
    );
  }

  function toggleAgent(value) {
    setSelectedAgents(prev => 
      prev.includes(value) ? prev.filter(a => a !== value) : [...prev, value]
    );
  }

  async function resetDemo(){
    await fetch('/reset');
    if(cyRef.current){
      cyRef.current.destroy();
      cyRef.current = null;
    }
    setProcessState({ active: false, stage: '', progress: 0, complete: false });
    setState(prev => ({
      ...prev,
      preview: {sources: {}, ontology: {}, connectionInfo: null}
    }));
    fetchState();
  }

  function renderGraph(){
    const container = document.getElementById('cy-container');
    if(!container) return;

    const nodeTypeMap = {};
    state.graph.nodes.forEach(n => {
      nodeTypeMap[n.id] = n.type;
    });

    const filteredEdges = state.graph.edges.filter(e => {
      const sourceType = nodeTypeMap[e.source];
      const targetType = nodeTypeMap[e.target];
      return !(sourceType === 'source' && targetType === 'source');
    });

    const elements = [
      ...state.graph.nodes.map(n => ({
        data: { id: n.id, label: n.label, type: n.type }
      })),
      ...filteredEdges.map(e => ({
        data: { source: e.source, target: e.target, label: e.label || "", type: e.type || "" }
      }))
    ];

    const positions = computePositionsByType(state.graph.nodes);

    if (!cyRef.current) {
      cyRef.current = cytoscape({
        container: container,
        elements,
        style: [
          { selector: "node[type='source']", style: { "background-color": "#2563eb", "shape": "round-rectangle", "color": "#fff", "label": "data(label)", "font-size": "11px", "text-valign": "center", "text-halign": "center", "width": 80, "height": 40 }},
          { selector: "node[type='agent']",   style: { "background-color": "#9333ea", "shape": "ellipse", "color": "#fff", "label": "data(label)", "font-size": "11px", "text-valign": "center", "text-halign": "center", "width": 80, "height": 40 }},
          { selector: "node[type='ontology']",style: { "background-color": "#16a34a", "shape": "round-rectangle", "color": "#fff", "label": "data(label)", "font-size": "11px", "text-valign": "center", "text-halign": "center", "width": 80, "height": 40 }},
          { selector: "node[type='consumer']",style: { "background-color": "#475569", "shape": "rectangle", "color": "#fff", "label": "data(label)", "font-size": "11px", "text-valign": "center", "text-halign": "center", "width": 80, "height": 40 }},
          { selector: "edge", style: { "curve-style": "bezier", "line-color": "#64748b", "target-arrow-shape": "triangle", "target-arrow-color": "#64748b", "width": 2, "label": "data(label)", "font-size": "9px", "color": "#94a3b8" }}
        ],
        layout: { name: "preset", positions, fit: true, padding: 20 }
      });

      cyRef.current.nodes().lock();

      cyRef.current.on('tap', 'node', async (evt) => {
        const id = evt.target.id();
        const r = await fetch('/preview?node=' + encodeURIComponent(id));
        const data = await r.json();
        setState(prev => ({...prev, preview: {...data, connectionInfo: prev.preview.connectionInfo}}));
      });

    } else {
      cyRef.current.elements().remove();
      cyRef.current.add(elements);
      cyRef.current.layout({ name: "preset", positions, fit: true }).run();
      cyRef.current.nodes().lock();
    }
  }

  function computePositionsByType(nodes) {
    const colIndex = { source: 0, agent: 1, ontology: 2, consumer: 3 };
    const colX = [100, 280, 460, 640];
    const rowGap = 90, yStart = 80;
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

  const sources = [
    {name: 'Dynamics CRM', value: 'dynamics', type: 'crm'},
    {name: 'Salesforce', value: 'salesforce', type: 'crm'},
    {name: 'SAP ERP', value: 'sap', type: 'erp'},
    {name: 'NetSuite', value: 'netsuite', type: 'erp'},
    {name: 'Legacy SQL Server', value: 'legacy_sql', type: 'database'},
    {name: 'Snowflake', value: 'snowflake', type: 'warehouse'}
  ];

  const agents = [
    {name: 'RevOps Pilot', value: 'revops_pilot', description: 'Revenue operations & sales pipeline', color: '#3b82f6'},
    {name: 'FinOps Pilot', value: 'finops_pilot', description: 'AWS cost optimization & cloud resources', color: '#9333ea'}
  ];

  const confidence = state.graph.confidence;
  const confText = confidence != null ? `${Math.round(confidence*100)}%` : '--';

  return (
    <div className="p-5 w-full">
      <div className="grid grid-cols-12 gap-5 max-w-[1400px] mx-auto">
        
        {/* Left Sidebar - Connectors */}
        <div className={`col-span-12 ${leftPanelCollapsed ? 'lg:col-span-1' : 'lg:col-span-3'} space-y-4 transition-all duration-300`}>
          {/* Collapse/Expand Button */}
          <button
            onClick={() => setLeftPanelCollapsed(!leftPanelCollapsed)}
            className="w-full bg-slate-800 hover:bg-slate-700 rounded-lg p-2 flex items-center justify-center gap-2 text-slate-300 hover:text-white transition-colors"
            title={leftPanelCollapsed ? "Expand panel" : "Collapse panel"}
          >
            <svg 
              className={`w-4 h-4 transition-transform duration-300 ${leftPanelCollapsed ? 'rotate-180' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
            {!leftPanelCollapsed && <span className="text-sm font-medium">Collapse</span>}
          </button>
          
          {!leftPanelCollapsed && (
            <>
              <div className="card">
                <div className="card-title mb-3">Data Sources</div>
            <div className="space-y-2 mb-3">
              {sources.map(s => (
                <label key={s.value} className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={selectedSources.includes(s.value)}
                    onChange={() => toggleSource(s.value)}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
                  />
                  <span className="text-sm text-slate-300 group-hover:text-slate-100">{s.name}</span>
                  <span className="ml-auto text-[10px] text-slate-500 uppercase">{s.type}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-title mb-3">Target Agents</div>
            <div className="space-y-2 mb-3">
              {agents.map(a => (
                <label key={a.value} className="flex items-start gap-2 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={selectedAgents.includes(a.value)}
                    onChange={() => toggleAgent(a.value)}
                    className="w-4 h-4 mt-0.5 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
                  />
                  <div className="flex-1">
                    <div className="text-sm text-slate-300 group-hover:text-slate-100 font-medium">{a.name}</div>
                    <div className="text-[10px] text-slate-500">{a.description}</div>
                  </div>
                  <div 
                    className="w-3 h-3 rounded-full mt-1" 
                    style={{backgroundColor: a.color}}
                  ></div>
                </label>
              ))}
            </div>
          </div>

          <button 
            onClick={connectSources} 
            className="w-full bg-brand-500 hover:bg-brand-600 rounded-lg py-2 text-sm font-medium disabled:opacity-50"
            disabled={selectedSources.length === 0 || selectedAgents.length === 0}
          >
            Connect & Map
          </button>

          {/* RAG Learning Engine - Updated Visual Identity */}
          <div className="rounded-lg p-4 bg-gradient-to-br from-teal-950 to-cyan-950 border border-teal-700/30">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full bg-teal-500 flex items-center justify-center text-white text-xs font-bold">🧠</div>
              <span className="text-white font-bold text-sm">RAG Learning Engine</span>
              <span className="ml-auto text-xs bg-teal-600 text-white px-2 py-0.5 rounded-full font-bold">
                {state.rag?.total_mappings || 0} stored
              </span>
            </div>
            <div className="text-xs space-y-2 max-h-[280px] overflow-y-auto">
              {!state.rag?.retrievals || state.rag.retrievals.length === 0 ? (
                <div className="text-teal-300/70 italic text-[11px]">
                  No context retrieved yet. Connect a source to see RAG retrieve historical mappings.
                </div>
              ) : (
                <>
                  <div className="text-white font-semibold mb-2 text-[11px]">
                    Retrieved {state.rag.last_retrieval_count} similar mappings:
                  </div>
                  {state.rag.retrievals.map((ret, i) => (
                    <div key={i} className="mb-2">
                      <div className="flex justify-between items-start mb-1">
                        <div className="text-white font-semibold text-[11px]">{ret.source_field}</div>
                        <div className="text-[10px] text-white font-bold">
                          {(ret.similarity * 100).toFixed(0)}%
                        </div>
                      </div>
                      <div className="text-teal-300 text-[10px] mb-1">→ {ret.ontology_entity}</div>
                      <div className="w-full bg-slate-900/50 rounded-sm h-1.5 overflow-hidden mb-1">
                        <div 
                          className="bg-teal-400 h-full transition-all duration-300"
                          style={{width: `${ret.similarity * 100}%`}}
                        ></div>
                      </div>
                      <div className="text-[9px] text-slate-400">
                        from {ret.source_system}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-title mb-3">Metrics</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">LLM Calls:</span>
                <span className="text-slate-200 font-medium">{state.llm.calls}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Tokens:</span>
                <span className="text-slate-200 font-medium">~{state.llm.tokens}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Confidence:</span>
                <span className="text-slate-200 font-medium">{confText}</span>
              </div>
            </div>
          </div>

          <button onClick={resetDemo} className="w-full bg-red-900 hover:bg-red-800 rounded-lg py-2 text-sm">
            Reset Demo
          </button>
            </>
          )}
        </div>

        {/* Center - Graph */}
        <div className={`col-span-12 ${
          leftPanelCollapsed && rightPanelCollapsed ? 'lg:col-span-10' : 
          leftPanelCollapsed ? 'lg:col-span-8' : 
          rightPanelCollapsed ? 'lg:col-span-8' : 
          'lg:col-span-6'
        } card transition-all duration-300`}>
          <div className="flex items-center justify-between mb-3">
            <div className="card-title">Data Flow Graph</div>
            <div className="flex items-center gap-2">
              <div className="flex bg-slate-800 rounded-lg p-1">
                <button
                  onClick={() => setViewType('cytoscape')}
                  className={`px-3 py-1 text-xs rounded transition-all ${
                    viewType === 'cytoscape' 
                      ? 'bg-cyan-600 text-white' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Graph
                </button>
                <button
                  onClick={() => setViewType('sankey')}
                  className={`px-3 py-1 text-xs rounded transition-all ${
                    viewType === 'sankey' 
                      ? 'bg-cyan-600 text-white' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Sankey
                </button>
              </div>
              <div className="text-xs text-slate-400">
                {state.graph.nodes.length} nodes, {state.graph.edges.length} edges
              </div>
            </div>
          </div>
          <div 
            id="cy-container" 
            className="rounded-xl bg-slate-900/50 border border-slate-800 h-[600px]"
            style={{ display: viewType === 'cytoscape' ? 'block' : 'none' }}
          ></div>
          <div 
            id="sankey-container" 
            className="rounded-xl bg-slate-900/50 border border-slate-800 h-[600px]"
            style={{ display: viewType === 'sankey' ? 'block' : 'none' }}
          ></div>
        </div>

        {/* Right Sidebar */}
        <div className={`col-span-12 ${rightPanelCollapsed ? 'lg:col-span-1' : 'lg:col-span-3'} space-y-4 transition-all duration-300`}>
          {/* Collapse/Expand Button */}
          <button
            onClick={() => setRightPanelCollapsed(!rightPanelCollapsed)}
            className="w-full bg-slate-800 hover:bg-slate-700 rounded-lg p-2 flex items-center justify-center gap-2 text-slate-300 hover:text-white transition-colors"
            title={rightPanelCollapsed ? "Expand panel" : "Collapse panel"}
          >
            <svg 
              className={`w-4 h-4 transition-transform duration-300 ${rightPanelCollapsed ? '' : 'rotate-180'}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
            {!rightPanelCollapsed && <span className="text-sm font-medium">Collapse</span>}
          </button>
          
          {!rightPanelCollapsed && (
            <>
              {/* Processing Indicator - Always Visible */}
              <div className="rounded-lg p-4 bg-slate-900/90 border border-slate-800">
            {processState.active ? (
              <>
                <div className="flex items-center gap-2 mb-2">
                  {processState.complete ? (
                    <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center text-white text-xs">✓</div>
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-cyan-500 animate-pulse"></div>
                  )}
                  <span className={`${processState.complete ? 'text-green-400' : 'text-cyan-400'} font-semibold text-sm`}>
                    {processState.complete ? 'Complete' : 'Processing...'}
                  </span>
                  <span className={`ml-auto text-sm font-bold ${processState.complete ? 'text-green-400' : 'text-cyan-400'}`}>
                    {processState.progress}%
                  </span>
                </div>
                <div className="w-full bg-slate-800 rounded-sm h-2 overflow-hidden mb-2">
                  <div 
                    className={`h-full transition-all duration-500 ${processState.complete ? 'bg-green-500' : 'bg-cyan-500'}`}
                    style={{width: `${processState.progress}%`}}
                  ></div>
                </div>
                <div className="text-xs text-slate-300">
                  {processState.stage}
                </div>
              </>
            ) : (
              <div className="text-slate-500 text-xs text-center py-2">
                No active processing
              </div>
            )}
          </div>

          {/* Narration with Bounding Box */}
          <div className="card border-2 border-slate-700">
            <div className="card-title mb-3">Narration</div>
            <div className="text-xs space-y-2 max-h-[450px] overflow-y-auto border border-slate-800 rounded-lg p-3 bg-slate-900/50">
              {state.events.length === 0 ? (
                <div className="text-slate-500 italic">No events yet. Add a source to begin.</div>
              ) : (
                state.events.map((event, i) => (
                  <div key={i} className="text-slate-300 leading-relaxed">{event}</div>
                ))
              )}
            </div>
          </div>
            </>
          )}
        </div>

        {/* Notes Section - Below Graph */}
        <div className="col-span-12 lg:col-span-9 lg:col-start-4">
          <div className="card">
            <div className="text-slate-500 font-semibold text-sm mb-3">Data Previews:</div>
            <div className="grid grid-cols-2 gap-4">
              {/* Source Preview */}
              <div>
                <div className="text-xs text-slate-400 font-semibold mb-2">Source Preview</div>
                <div className="text-xs max-h-[350px] overflow-y-auto">
                  {Object.keys(state.preview.sources).length === 0 ? (
                    <div className="text-slate-600 italic">Click a connection or source node</div>
                  ) : (
                    <>
                      {state.preview.connectionInfo && (
                        <div className="mb-3 p-2 bg-teal-900/30 border border-teal-700/50 rounded">
                          <div className="text-sm font-semibold text-teal-300 mb-1">Data Flow Connection</div>
                          <div className="text-xs text-slate-300 flex items-center gap-1">
                            <svg className="w-5 h-5 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                            </svg>
                            <span className="font-medium text-blue-400">{state.preview.connectionInfo.from}</span>
                            <span className="mx-1 text-slate-500">→</span>
                            <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                            <span className="font-medium text-green-400">{state.preview.connectionInfo.to}</span>
                          </div>
                        </div>
                      )}
                      {Object.entries(state.preview.sources).map(([name, rows]) => {
                        const cols = rows && rows.length > 0 ? Object.keys(rows[0]) : [];
                        const useTransposed = cols.length > 10;
                        return (
                          <div key={name} className="mb-2">
                            <div className="text-slate-400 font-medium mb-0.5">{name}</div>
                            {rows && rows.length > 0 && (
                              <div className="bg-slate-900/30 rounded p-1 overflow-x-auto">
                                {useTransposed ? (
                                  <table className="w-full text-xs transposed-table">
                                    <thead>
                                      <tr className="border-b border-slate-800">
                                        <th className="text-left py-1 px-1 text-slate-500">Field</th>
                                        {rows.slice(0, 2).map((_, i) => (
                                          <th key={i} className="text-left py-1 px-1 text-slate-500">Record {i + 1}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {cols.map(col => (
                                        <tr key={col}>
                                          <td className="py-1 px-1 text-slate-300 font-semibold field-name">{col}</td>
                                          {rows.slice(0, 2).map((row, i) => {
                                            const val = row[col];
                                            return (
                                              <td key={i} className="py-1 px-1 text-slate-400">
                                                {val != null && val !== '' && val !== undefined ? String(val).substring(0, 30) : '—'}
                                              </td>
                                            );
                                          })}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                ) : (
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b border-slate-800">
                                        {cols.map(col => (
                                          <th key={col} className="text-left py-1 px-1 text-slate-500">{col}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {rows.slice(0, 2).map((row, i) => (
                                        <tr key={i}>
                                          {Object.values(row).map((val, j) => (
                                            <td key={j} className="py-1 px-1 text-slate-400">
                                              {val != null && val !== '' && val !== undefined ? String(val).substring(0, 20) : '—'}
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              </div>

              {/* Unified Preview */}
              <div>
                <div className="text-xs text-slate-400 font-semibold mb-2">Unified Preview</div>
                <div className="text-xs max-h-[350px] overflow-y-auto">
                  {Object.keys(state.preview.ontology).length === 0 ? (
                    <div className="text-slate-600 italic">Click a connection or unified node</div>
                  ) : (
                    <>
                      {state.preview.connectionInfo && (
                        <div className="mb-3 p-2 bg-teal-900/30 border border-teal-700/50 rounded">
                          <div className="text-sm font-semibold text-teal-300 mb-1">Data Flow Connection</div>
                          <div className="text-xs text-slate-300 flex items-center gap-1">
                            <svg className="w-5 h-5 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                            </svg>
                            <span className="font-medium text-blue-400">{state.preview.connectionInfo.from}</span>
                            <span className="mx-1 text-slate-500">→</span>
                            <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                            <span className="font-medium text-green-400">{state.preview.connectionInfo.to}</span>
                          </div>
                        </div>
                      )}
                      {Object.entries(state.preview.ontology).map(([name, rows]) => {
                        const cols = rows && rows.length > 0 ? Object.keys(rows[0]) : [];
                        const useTransposed = cols.length > 10;
                        return (
                          <div key={name} className="mb-2">
                            <div className="text-slate-400 font-medium mb-0.5">{name}</div>
                            {rows && rows.length > 0 && (
                              <div className="bg-slate-900/30 rounded p-1 overflow-x-auto">
                                {useTransposed ? (
                                  <table className="w-full text-xs transposed-table">
                                    <thead>
                                      <tr className="border-b border-slate-800">
                                        <th className="text-left py-1 px-1 text-slate-500">Field</th>
                                        {rows.slice(0, 2).map((_, i) => (
                                          <th key={i} className="text-left py-1 px-1 text-slate-500">Record {i + 1}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {cols.map(col => (
                                        <tr key={col}>
                                          <td className="py-1 px-1 text-slate-300 font-semibold field-name">{col}</td>
                                          {rows.slice(0, 2).map((row, i) => {
                                            const val = row[col];
                                            return (
                                              <td key={i} className="py-1 px-1 text-slate-400">
                                                {val != null && val !== '' && val !== undefined ? String(val).substring(0, 30) : '—'}
                                              </td>
                                            );
                                          })}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                ) : (
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b border-slate-800">
                                        {cols.map(col => (
                                          <th key={col} className="text-left py-1 px-1 text-slate-500">{col}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {rows.slice(0, 2).map((row, i) => (
                                        <tr key={i}>
                                          {Object.values(row).map((val, j) => (
                                            <td key={j} className="py-1 px-1 text-slate-400">
                                              {val != null && val !== '' && val !== undefined ? String(val).substring(0, 20) : '—'}
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
