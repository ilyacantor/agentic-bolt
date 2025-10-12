function DCLDashboard(){
  const [state, setState] = React.useState({
    events: [],
    graph: {nodes: [], edges: []},
    llm: {calls: 0, tokens: 0},
    preview: {sources: {}, ontology: {}},
    rag: {retrievals: [], total_mappings: 0, last_retrieval_count: 0}
  });
  const [selectedSource, setSelectedSource] = React.useState('dynamics');
  const cyRef = React.useRef(null);

  React.useEffect(()=>{
    fetchState();
    const interval = setInterval(fetchState, 2000);
    return () => clearInterval(interval);
  },[]);

  React.useEffect(()=>{
    if(state.graph.nodes.length > 0){
      renderGraph();
    }
  },[state.graph]);

  async function fetchState(){
    const res = await fetch('/state');
    const data = await res.json();
    setState(data);
  }

  async function addSource(){
    const res = await fetch(`/connect?source=${selectedSource}`);
    await res.json();
    fetchState();
  }

  async function resetDemo(){
    await fetch('/reset');
    if(cyRef.current){
      cyRef.current.destroy();
      cyRef.current = null;
    }
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

          {/* RAG Context Panel - PROMINENT POSITION */}
          <div className="card border-2 border-purple-500/30 bg-gradient-to-br from-purple-900/10 to-pink-900/10">
            <div className="card-title mb-2 flex items-center gap-2">
              <span className="text-purple-300">🧠 RAG Learning Engine</span>
              <span className="text-xs bg-purple-500/30 text-purple-200 px-2 py-1 rounded-full font-bold">
                {state.rag?.total_mappings || 0} stored
              </span>
            </div>
            <div className="text-xs space-y-2 max-h-[280px] overflow-y-auto">
              {!state.rag?.retrievals || state.rag.retrievals.length === 0 ? (
                <div className="text-purple-300/60 italic bg-purple-500/5 p-3 rounded-lg border border-purple-500/20">
                  💡 No context retrieved yet. Connect a second source to see RAG retrieve historical mappings!
                </div>
              ) : (
                <>
                  <div className="text-purple-200 font-bold mb-2 bg-purple-500/20 px-2 py-1 rounded">
                    🎯 Retrieved {state.rag.last_retrieval_count} similar mappings:
                  </div>
                  {state.rag.retrievals.map((ret, i) => (
                    <div key={i} className="bg-slate-900/70 rounded-lg p-2.5 border border-purple-500/30 hover:border-purple-400/50 transition-all">
                      <div className="flex justify-between items-start mb-1">
                        <div className="text-slate-200 font-bold text-sm">{ret.source_field}</div>
                        <div className="text-xs bg-purple-500/40 text-purple-100 px-2 py-0.5 rounded-full font-bold">
                          {(ret.similarity * 100).toFixed(0)}%
                        </div>
                      </div>
                      <div className="text-purple-300 text-[11px] mb-1.5">→ {ret.ontology_entity}</div>
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden mb-1">
                        <div 
                          className="bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 h-full transition-all duration-500 shadow-lg shadow-purple-500/50"
                          style={{width: `${ret.similarity * 100}%`}}
                        ></div>
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1">
                        <span className="text-purple-400">📊</span> from {ret.source_system}
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

          <div className="card">
            <div className="card-title mb-3">Narration</div>
            <div className="text-xs space-y-2 max-h-[180px] overflow-y-auto">
              {state.events.length === 0 ? (
                <div className="text-slate-500 italic">No events yet. Add a source to begin.</div>
              ) : (
                state.events.map((event, i) => (
                  <div key={i} className="text-slate-300 leading-relaxed">{event}</div>
                ))
              )}
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
            <div className="text-xs text-slate-400">
              {state.graph.nodes.length} nodes, {state.graph.edges.length} edges
            </div>
          </div>
          <div id="cy-container" className="rounded-xl bg-slate-900/50 border border-slate-800 h-[600px]"></div>
        </div>

        {/* Right Sidebar - Previews */}
        <div className="col-span-12 lg:col-span-3 space-y-4">
          <div className="card">
            <div className="card-title mb-3">Source Preview</div>
            <div className="text-xs max-h-[280px] overflow-y-auto">
              {Object.keys(state.preview.sources).length === 0 ? (
                <div className="text-slate-500 italic">Click a node to preview data</div>
              ) : (
                Object.entries(state.preview.sources).map(([name, rows]) => (
                  <div key={name} className="mb-3">
                    <div className="text-slate-300 font-medium mb-1">{name}</div>
                    {rows && rows.length > 0 && (
                      <div className="bg-slate-900/50 rounded p-2 overflow-x-auto">
                        <table className="w-full text-[10px]">
                          <thead>
                            <tr className="border-b border-slate-700">
                              {Object.keys(rows[0]).map(col => (
                                <th key={col} className="text-left py-1 px-1 text-slate-400">{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.slice(0, 3).map((row, i) => (
                              <tr key={i} className="border-b border-slate-800">
                                {Object.values(row).map((val, j) => (
                                  <td key={j} className="py-1 px-1 text-slate-300">{val !== null ? String(val).substring(0, 20) : ''}</td>
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

          <div className="card">
            <div className="card-title mb-3">Unified Preview</div>
            <div className="text-xs max-h-[280px] overflow-y-auto">
              {Object.keys(state.preview.ontology).length === 0 ? (
                <div className="text-slate-500 italic">Click a unified node to preview</div>
              ) : (
                Object.entries(state.preview.ontology).map(([name, rows]) => (
                  <div key={name} className="mb-3">
                    <div className="text-slate-300 font-medium mb-1">{name}</div>
                    {rows && rows.length > 0 && (
                      <div className="bg-slate-900/50 rounded p-2 overflow-x-auto">
                        <table className="w-full text-[10px]">
                          <thead>
                            <tr className="border-b border-slate-700">
                              {Object.keys(rows[0]).map(col => (
                                <th key={col} className="text-left py-1 px-1 text-slate-400">{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.slice(0, 3).map((row, i) => (
                              <tr key={i} className="border-b border-slate-800">
                                {Object.values(row).map((val, j) => (
                                  <td key={j} className="py-1 px-1 text-slate-300">{val !== null ? String(val).substring(0, 20) : ''}</td>
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
  );
}
