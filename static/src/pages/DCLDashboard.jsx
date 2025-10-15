// Typing animation component for narration
function TypingText({ text, speed = 30 }) {
  const [displayedText, setDisplayedText] = React.useState('');
  const [currentIndex, setCurrentIndex] = React.useState(0);

  React.useEffect(() => {
    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText(prev => prev + text[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }, speed);
      return () => clearTimeout(timeout);
    }
  }, [currentIndex, text, speed]);

  React.useEffect(() => {
    setDisplayedText('');
    setCurrentIndex(0);
  }, [text]);

  return <span>{displayedText}</span>;
}

function DCLDashboard(){
  const [state, setState] = React.useState({
    events: [],
    graph: {nodes: [], edges: []},
    llm: {calls: 0, tokens: 0},
    preview: {sources: {}, ontology: {}, connectionInfo: null},
    rag: {retrievals: [], total_mappings: 0, last_retrieval_count: 0},
    selected_sources: [],
    selected_agents: []
  });
  const [selectedSources, setSelectedSources] = React.useState([]);
  const [selectedAgents, setSelectedAgents] = React.useState([]);
  const [processState, setProcessState] = React.useState({ active: false, stage: '', progress: 0, complete: false });
  const [showHookModal, setShowHookModal] = React.useState(false);
  const [typingEvents, setTypingEvents] = React.useState([]);
  
  const modalButtonRef = React.useRef(null);
  const processTimeoutRef = React.useRef(null);

  // Handle modal accessibility: Escape key and focus trap
  React.useEffect(() => {
    if (showHookModal) {
      // Store previously focused element
      const previouslyFocused = document.activeElement;
      
      const handleKeyDown = (e) => {
        // Handle Escape key
        if (e.key === 'Escape') {
          setShowHookModal(false);
          return;
        }
        
        // Handle Tab key - trap focus within modal
        if (e.key === 'Tab') {
          const modal = document.querySelector('[role="dialog"]');
          if (!modal) return;
          
          const focusableElements = modal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          const firstElement = focusableElements[0];
          const lastElement = focusableElements[focusableElements.length - 1];
          
          if (e.shiftKey) {
            // Shift+Tab
            if (document.activeElement === firstElement) {
              e.preventDefault();
              lastElement.focus();
            }
          } else {
            // Tab
            if (document.activeElement === lastElement) {
              e.preventDefault();
              firstElement.focus();
            }
          }
        }
      };
      
      document.addEventListener('keydown', handleKeyDown);
      
      // Auto-focus the button when modal opens
      if (modalButtonRef.current) {
        modalButtonRef.current.focus();
      }
      
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        // Restore focus to previously focused element
        if (previouslyFocused) {
          previouslyFocused.focus();
        }
      };
    }
  }, [showHookModal]);

  React.useEffect(()=>{
    async function initState() {
      const res = await fetch('/state');
      const data = await res.json();
      setState(data);
      // Sync local selections with backend on initial load only
      setSelectedSources(data.selected_sources || []);
      setSelectedAgents(data.selected_agents || []);
    }
    initState();
    const interval = setInterval(fetchState, 2000);
    return () => clearInterval(interval);
  },[]);

  React.useEffect(()=>{
    if(state.graph.nodes.length > 0){
      renderSankey(state);
    }
  },[state.graph]);

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

  // Track new events and animate them with typing effect
  React.useEffect(() => {
    // Check if events changed (length or content)
    const eventsChanged = state.events.length !== typingEvents.length || 
      state.events.some((event, idx) => typingEvents[idx]?.text !== event);
    
    if (eventsChanged) {
      if (state.events.length === 0) {
        // Events were cleared
        setTypingEvents([]);
      } else {
        // New events or content changed - update and mark latest for typing
        setTypingEvents(state.events.map((event, idx) => ({
          text: event,
          isTyping: idx === state.events.length - 1, // Only the latest event types
          key: `${idx}-${event.substring(0, 20)}-${Date.now()}` // Unique key with timestamp
        })));
      }
    }
  }, [state.events, typingEvents]);

  // Cleanup timeout on unmount to prevent React warnings
  React.useEffect(() => {
    return () => {
      if (processTimeoutRef.current) {
        clearTimeout(processTimeoutRef.current);
      }
    };
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
    
    // Track Connect & Map action
    if (typeof gtag !== 'undefined') {
      gtag('event', 'connect_and_map', {
        event_category: 'User Action',
        event_label: `${selectedSources.length} sources, ${selectedAgents.length} agents`
      });
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
      
      // Reset to idle after brief display of success
      processTimeoutRef.current = setTimeout(() => {
        setProcessState({ active: false, stage: '', progress: 0, complete: false });
      }, 1500);
    } catch (error) {
      setProcessState({ active: true, stage: 'Failed', progress: 0, complete: true });
      // Reset to idle after brief display of error
      processTimeoutRef.current = setTimeout(() => {
        setProcessState({ active: false, stage: '', progress: 0, complete: false });
      }, 2000);
    }
  }

  function toggleSource(value) {
    setSelectedSources(prev => {
      const newSelection = prev.includes(value) ? prev.filter(s => s !== value) : [...prev, value];
      // Track source selection
      if (!prev.includes(value) && typeof gtag !== 'undefined') {
        gtag('event', 'select_source', {
          event_category: 'Data Source',
          event_label: value
        });
      }
      return newSelection;
    });
  }

  function toggleAgent(value) {
    setSelectedAgents(prev => {
      const newSelection = prev.includes(value) ? prev.filter(a => a !== value) : [...prev, value];
      // Track agent selection
      if (!prev.includes(value) && typeof gtag !== 'undefined') {
        gtag('event', 'select_agent', {
          event_category: 'Agent',
          event_label: value
        });
      }
      return newSelection;
    });
  }

  function checkAllSources() {
    setSelectedSources(sources.map(s => s.value));
  }

  function uncheckAllSources() {
    setSelectedSources([]);
  }

  async function resetDemo(){
    await fetch('/reset');
    setProcessState({ active: false, stage: '', progress: 0, complete: false });
    setSelectedSources([]);
    setSelectedAgents([]);
    setState(prev => ({
      ...prev,
      preview: {sources: {}, ontology: {}, connectionInfo: null}
    }));
    fetchState();
  }


  const sources = [
    {name: 'Dynamics CRM', value: 'dynamics', type: 'crm'},
    {name: 'Salesforce', value: 'salesforce', type: 'crm'},
    {name: 'SAP ERP', value: 'sap', type: 'erp'},
    {name: 'NetSuite', value: 'netsuite', type: 'erp'},
    {name: 'Legacy SQL', value: 'legacy_sql', type: 'database'},
    {name: 'Snowflake', value: 'snowflake', type: 'warehouse'},
    {name: 'Supabase', value: 'supabase', type: 'database'},
    {name: 'MongoDB', value: 'mongodb', type: 'database'}
  ];

  const agents = [
    {name: 'RevOps Pilot', value: 'revops_pilot', description: 'Revenue operations & sales pipeline', color: '#3b82f6'},
    {name: 'FinOps Pilot', value: 'finops_pilot', description: 'AWS cost optimization & cloud resources', color: '#9333ea'}
  ];

  const confidence = state.graph.confidence;
  const confText = confidence != null ? `${Math.round(confidence*100)}%` : '--';

  return (
    <div className="p-3 sm:p-5 w-full">
      {/* 5-Second Hook Modal */}
      {showHookModal && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hook-modal-title"
          aria-describedby="hook-modal-description"
        >
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-8 max-w-lg w-full shadow-2xl">
            <h2 id="hook-modal-title" className="text-2xl sm:text-3xl font-bold text-white mb-4 text-center">
              Stop Building Pipelines.<br />Let Agents Deliver the Outcome.
            </h2>
            <p id="hook-modal-description" className="text-slate-300 text-base sm:text-lg mb-6 text-center leading-relaxed">
              This is how you bridge the "Insight-to-Action Gap". Click <strong className="text-emerald-400">Connect & Map</strong> to see our autonomous system build the data connections you need, instantly.
            </p>
            <div className="flex justify-center">
              <button
                ref={modalButtonRef}
                onClick={() => setShowHookModal(false)}
                className="pulse-button bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold px-8 py-3 rounded-lg transition-all duration-300 shadow-lg shadow-emerald-500/30"
                aria-label="Close welcome modal and start using the application"
              >
                Got It - Show Me
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="grid grid-cols-12 gap-3 sm:gap-5 max-w-[1400px] mx-auto" aria-hidden={showHookModal}>
        
        {/* Left Sidebar - Connectors */}
        <div className="col-span-12 lg:col-span-3 space-y-4">
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <div className="card-title">Data Sources</div>
                  <div className="flex gap-1">
                    <button
                      onClick={checkAllSources}
                      className="text-[10px] px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
                      title="Select all sources"
                    >
                      All
                    </button>
                    <button
                      onClick={uncheckAllSources}
                      className="text-[10px] px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
                      title="Deselect all sources"
                    >
                      None
                    </button>
                  </div>
                </div>
            <div className="space-y-2 mb-3">
              {sources.map(s => {
                const getIcon = (type) => {
                  const iconClass = "w-5 h-5";
                  switch(type) {
                    case 'database':
                      return (
                        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                        </svg>
                      );
                    case 'warehouse':
                      return (
                        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                        </svg>
                      );
                    case 'crm':
                      return (
                        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      );
                    case 'erp':
                      return (
                        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      );
                    default:
                      return (
                        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      );
                  }
                };
                
                const typeColors = {
                  crm: 'bg-blue-900/30 border-blue-700/50 text-blue-300',
                  erp: 'bg-green-900/30 border-green-700/50 text-green-300',
                  database: 'bg-red-900/30 border-red-700/50 text-red-300',
                  warehouse: 'bg-cyan-900/30 border-cyan-700/50 text-cyan-300'
                };
                
                return (
                  <label key={s.value} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer group transition-colors ${typeColors[s.type] || 'bg-slate-900/30 border-slate-700/50'}`}>
                    <input 
                      type="checkbox" 
                      checked={selectedSources.includes(s.value)}
                      onChange={() => toggleSource(s.value)}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
                    />
                    {getIcon(s.type)}
                    <span className="text-sm text-slate-200 group-hover:text-white flex-1">{s.name}</span>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">{s.type}</span>
                  </label>
                );
              })}
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
            className="w-full bg-brand-500 hover:bg-brand-600 rounded-lg py-2 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            disabled={selectedSources.length === 0 || selectedAgents.length === 0 || processState.active}
          >
            {processState.active ? (
              <>
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Agent Working...
              </>
            ) : (
              'Connect & Map'
            )}
          </button>

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
          <div 
            id="sankey-container" 
            className="rounded-xl bg-slate-900/50 border border-slate-800 h-[400px] sm:h-[500px] lg:h-[600px] overflow-x-auto"
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

          {/* Narration with Bounding Box */}
          <div className="card border-2 border-slate-700">
            <div className="card-title mb-3">Narration</div>
            <div className="text-xs space-y-2 max-h-[450px] overflow-y-auto border border-slate-800 rounded-lg p-3 bg-slate-900/50">
              {typingEvents.length === 0 ? (
                <div className="text-slate-500 italic">No events yet. Add a source to begin.</div>
              ) : (
                typingEvents.map((event, i) => (
                  <div key={event.key} className="text-slate-300 leading-relaxed">
                    {event.isTyping ? <TypingText text={event.text} speed={20} /> : event.text}
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
