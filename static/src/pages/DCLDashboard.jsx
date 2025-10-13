function DCLDashboard(){
  const [state, setState] = React.useState({
    events: [],
    graph: {nodes: [], edges: []},
    llm: {calls: 0, tokens: 0},
    preview: {sources: {}, ontology: {}},
    rag: {retrievals: [], total_mappings: 0, last_retrieval_count: 0}
  });
  const [selectedSource, setSelectedSource] = React.useState('dynamics');
  const [processState, setProcessState] = React.useState({ active: false, stage: '', progress: 0, complete: false });
  const [viewType, setViewType] = React.useState('cytoscape');
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
      setState(prev => ({...prev, preview: e.detail}));
    };
    window.addEventListener('sankey-node-click', handleSankeyNodeClick);
    return () => window.removeEventListener('sankey-node-click', handleSankeyNodeClick);
  }, []);

  async function fetchState(){
    const res = await fetch('/state');
    const data = await res.json();
    setState(data);
  }

  async function addSource(){
    setProcessState({ active: true, stage: 'Connecting to data source...', progress: 20, complete: false });
    
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      setProcessState({ active: true, stage: 'Analyzing schema structure...', progress: 40, complete: false });
      
      const res = await fetch(`/connect?source=${selectedSource}`);
      setProcessState({ active: true, stage: 'Mapping fields to ontology...', progress: 70, complete: false });
      
      await res.json();
      setProcessState({ active: true, stage: 'Validating mappings...', progress: 90, complete: false });
      
      await fetchState();
      setProcessState({ active: true, stage: 'Completed successfully', progress: 100, complete: true });
    } catch (error) {
      setProcessState({ active: true, stage: 'Failed', progress: 0, complete: true });
    }
  }

  async function resetDemo(){
    await fetch('/reset');
    if(cyRef.current){
      cyRef.current.destroy();
      cyRef.current = null;
    }
    setProcessState({ active: false, stage: '', progress: 0, complete: false });
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
        setState(prev => ({...prev, preview: data}));
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
    {name: 'Dynamics CRM', value: 'dynamics'},
    {name: 'Salesforce', value: 'salesforce'},
    {name: 'SAP ERP', value: 'sap'},
    {name: 'NetSuite', value: 'netsuite'},
    {name: 'Legacy SQL Server', value: 'legacy_sql'},
    {name: 'Snowflake', value: 'snowflake'}
  ];

  const confidence = state.graph.confidence;
  const confText = confidence != null ? `${Math.round(confidence*100)}%` : '--';

  return (
    <div className="p-5 w-full">
      <div className="grid grid-cols-12 gap-5 max-w-[1400px] mx-auto">
        
        {/* Left Sidebar - Connectors */}
        <div className="col-span-12 lg:col-span-3 space-y-4">
          <div className="card">
            <div className="card-title mb-3">Add Data Source</div>
            <select 
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm mb-3"
              value={selectedSource}
              onChange={e => setSelectedSource(e.target.value)}
            >
              {sources.map(s => <option key={s.value} value={s.value}>{s.name}</option>)}
            </select>
            <button onClick={addSource} className="w-full bg-brand-500 hover:bg-brand-600 rounded-lg py-2 text-sm font-medium">
              Connect Source
            </button>
          </div>

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
        </div>

        {/* Center - Graph */}
        <div className="col-span-12 lg:col-span-6 card">
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
        <div className="col-span-12 lg:col-span-3 space-y-4">
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
        </div>

        {/* Notes Section - Below Graph */}
        <div className="col-span-12 lg:col-span-9 lg:col-start-4">
          <div className="card">
            <div className="text-slate-500 font-semibold text-xs mb-2">Notes:</div>
            <div className="grid grid-cols-2 gap-3">
              {/* Source Preview */}
              <div>
                <div className="text-[10px] text-slate-400 font-medium mb-1">Source Preview</div>
                <div className="text-[9px] max-h-[120px] overflow-y-auto">
                  {Object.keys(state.preview.sources).length === 0 ? (
                    <div className="text-slate-600 italic">Click a source node</div>
                  ) : (
                    Object.entries(state.preview.sources).map(([name, rows]) => (
                      <div key={name} className="mb-2">
                        <div className="text-slate-400 font-medium mb-0.5">{name}</div>
                        {rows && rows.length > 0 && (
                          <div className="bg-slate-900/30 rounded p-1 overflow-x-auto">
                            <table className="w-full text-[8px]">
                              <thead>
                                <tr className="border-b border-slate-800">
                                  {Object.keys(rows[0]).map(col => (
                                    <th key={col} className="text-left py-0.5 px-0.5 text-slate-500">{col}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {rows.slice(0, 2).map((row, i) => (
                                  <tr key={i}>
                                    {Object.values(row).map((val, j) => (
                                      <td key={j} className="py-0.5 px-0.5 text-slate-400">{val !== null ? String(val).substring(0, 15) : ''}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Unified Preview */}
              <div>
                <div className="text-[10px] text-slate-400 font-medium mb-1">Unified Preview</div>
                <div className="text-[9px] max-h-[120px] overflow-y-auto">
                  {Object.keys(state.preview.ontology).length === 0 ? (
                    <div className="text-slate-600 italic">Click a unified node</div>
                  ) : (
                    Object.entries(state.preview.ontology).map(([name, rows]) => (
                      <div key={name} className="mb-2">
                        <div className="text-slate-400 font-medium mb-0.5">{name}</div>
                        {rows && rows.length > 0 && (
                          <div className="bg-slate-900/30 rounded p-1 overflow-x-auto">
                            <table className="w-full text-[8px]">
                              <thead>
                                <tr className="border-b border-slate-800">
                                  {Object.keys(rows[0]).map(col => (
                                    <th key={col} className="text-left py-0.5 px-0.5 text-slate-500">{col}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {rows.slice(0, 2).map((row, i) => (
                                  <tr key={i}>
                                    {Object.values(row).map((val, j) => (
                                      <td key={j} className="py-0.5 px-0.5 text-slate-400">{val !== null ? String(val).substring(0, 15) : ''}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))
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
