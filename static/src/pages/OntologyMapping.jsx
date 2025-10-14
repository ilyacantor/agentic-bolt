function OntologyMapping() {
  const [state, setState] = React.useState({
    graph: { nodes: [], edges: [] },
    selected_sources: [],
    selected_agents: []
  });
  
  const [sourceSchemas, setSourceSchemas] = React.useState({});

  React.useEffect(() => {
    const fetchState = async () => {
      const res = await fetch('/state');
      const data = await res.json();
      setState(data);
    };
    fetchState();
    const interval = setInterval(fetchState, 2000);
    return () => clearInterval(interval);
  }, []);
  
  React.useEffect(() => {
    const fetchSchemas = async () => {
      const res = await fetch('/source_schemas');
      const data = await res.json();
      setSourceSchemas(data);
    };
    fetchSchemas();
    const interval = setInterval(fetchSchemas, 2000);
    return () => clearInterval(interval);
  }, []);

  // Parse data structure from graph state with safety checks
  const nodes = state?.graph?.nodes || [];
  const edges = state?.graph?.edges || [];
  
  const sourceNodes = nodes.filter(n => n.type === 'source');
  const ontologyNodes = nodes.filter(n => n.type === 'ontology');
  const agentNodes = nodes.filter(n => n.type === 'agent');
  const mappingEdges = edges.filter(e => e.type === 'mapping');
  const consumptionEdges = edges.filter(e => e.type === 'consumption');

  // Build source structure: group by source system
  const sourceStructure = {};
  sourceNodes.forEach(node => {
    if (!node?.id) return;
    const parts = node.id.split('_'); // src_snowflake_AWS_RESOURCES
    const sourceSystem = parts[1] || 'unknown';
    const tableName = parts.slice(2).join('_') || 'Unknown';
    if (!sourceStructure[sourceSystem]) {
      sourceStructure[sourceSystem] = [];
    }
    sourceStructure[sourceSystem].push({ 
      id: node.id, 
      table: tableName, 
      label: node?.label || tableName 
    });
  });

  // Build ontology mappings: which sources map to which ontology entities
  const ontologyMappings = {};
  ontologyNodes.forEach(onto => {
    const incomingEdges = mappingEdges.filter(e => e?.target === onto?.id) || [];
    const outgoingEdges = consumptionEdges.filter(e => e?.source === onto?.id) || [];
    ontologyMappings[onto.id] = {
      label: onto?.label || 'Unknown',
      sources: incomingEdges.map(e => ({
        sourceId: e?.source || '',
        label: e?.label || 'Unknown mapping',
        fieldMappings: e?.field_mappings || []  // Include field-level mappings
      })) || [],
      consumedBy: outgoingEdges.map(e => e?.target) || []
    };
  });

  // Build agent consumption: which agents consume which ontology entities based on actual edges
  const agentConsumption = {};
  agentNodes.forEach(agent => {
    const consumedEntities = consumptionEdges
      .filter(e => e?.target === agent?.id)
      .map(e => ({
        ontoId: e?.source || '',
        label: e?.label || 'Unknown entity'
      })) || [];
    agentConsumption[agent.id] = {
      label: agent?.label || 'Unknown agent',
      entities: consumedEntities
    };
  });

  // Get set of ontology entities consumed by agents (to filter out unused fields)
  const consumedOntologyIds = new Set(consumptionEdges.map(e => e?.source).filter(Boolean));
  
  // For highlighting: use ALL mapping edges (source→ontology) regardless of agent consumption
  const allMappingEdges = mappingEdges;
  
  // For filtering displayed ontology nodes: only show consumed entities
  const consumedMappingEdges = mappingEdges.filter(e => consumedOntologyIds.has(e?.target));
  
  // Filter ontology mappings to only show consumed entities
  const consumedOntologyMappings = {};
  Object.entries(ontologyMappings).forEach(([ontoId, onto]) => {
    if (consumedOntologyIds.has(ontoId)) {
      consumedOntologyMappings[ontoId] = onto;
    }
  });

  const hasData = sourceNodes.length > 0 || ontologyNodes.length > 0 || agentNodes.length > 0;

  return (
    <div className="p-5 w-full">
      <div className="max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Ontology Mapping View</h2>
          <div className="text-sm text-slate-400">
            {state?.selected_sources && state.selected_sources.length > 0 && (
              <span>Sources: {state.selected_sources.join(', ')} • </span>
            )}
            {state?.selected_agents && state.selected_agents.length > 0 && (
              <span>Agents: {state.selected_agents.map(a => a.replace('_', ' ')).join(', ')}</span>
            )}
          </div>
        </div>

        {!hasData ? (
          <div className="card text-center py-12">
            <div className="text-slate-500 mb-2">No data sources connected yet</div>
            <div className="text-sm text-slate-600">Go to the Dashboard tab and connect a data source to see the mapping flow</div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {/* Column 1: Source Structure - ALL Fields with Highlighting */}
            <div className="card">
              <div className="card-title mb-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                Incoming Source Structure
              </div>
              <div className="flex gap-3 mb-3 text-xs">
                <div className="flex items-center gap-1">
                  <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-green-400">Consumed by ontology</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3"></div>
                  <span className="text-slate-500">Available but unused</span>
                </div>
              </div>
              <div className="space-y-4">
                {Object.entries(sourceSchemas).map(([source, tables]) => (
                  <div key={source}>
                    <div className="text-sm font-semibold text-blue-400 mb-2 uppercase">{source}</div>
                    {Object.entries(tables).map(([tableName, tableInfo]) => {
                      const sourceId = `src_${source}_${tableName}`;
                      const schema = tableInfo?.schema || {};
                      const allFields = Object.keys(schema);
                      
                      // Get consumed field labels for this table - use ALL mappings not just agent-consumed ones
                      const consumedFieldLabels = new Set(
                        allMappingEdges
                          .filter(e => e?.source === sourceId)
                          .map(e => e?.label?.split(' → ')[0]?.trim())
                          .filter(Boolean)
                      );
                      
                      return (
                        <div key={sourceId} className="mb-2">
                          <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg px-3 py-2">
                            <div className="text-sm font-medium text-blue-300 mb-2">{tableName}</div>
                            <div className="space-y-1 max-h-48 overflow-y-auto">
                              {allFields.map((field, i) => {
                                const isConsumed = consumedFieldLabels.has(field);
                                return (
                                  <div key={i} className={`text-xs flex items-center gap-1 ${isConsumed ? 'text-green-400 font-medium' : 'text-slate-500'}`}>
                                    {isConsumed ? (
                                      <svg className="w-3 h-3 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                      </svg>
                                    ) : (
                                      <div className="w-3 h-3 flex-shrink-0"></div>
                                    )}
                                    <span className="truncate">{field}</span>
                                    <span className="text-[10px] text-slate-600 ml-auto flex-shrink-0">({schema[field]})</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Column 2: Ontology Targets & Mappings */}
            <div className="card">
              <div className="card-title mb-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                Unified Ontology (Mapped Fields)
              </div>
              <div className="space-y-3">
                {Object.entries(consumedOntologyMappings).map(([ontoId, onto]) => (
                  <div key={ontoId}>
                    <div className="bg-green-900/20 border border-green-800/50 rounded-lg px-3 py-2">
                      <div className="text-sm font-semibold text-green-400 mb-2">{onto?.label || 'Unknown'}</div>
                      {onto?.sources && onto.sources.length > 0 ? (
                        <div className="space-y-2">
                          {onto.sources.map((src, i) => (
                            <div key={i} className="space-y-1">
                              <div className="text-[11px] text-blue-400 font-medium">{src.label.split(' → ')[0]}</div>
                              {src.fieldMappings && src.fieldMappings.length > 0 ? (
                                <div className="space-y-0.5 pl-2">
                                  {src.fieldMappings.map((field, j) => (
                                    <div key={j} className="text-xs text-slate-400 flex items-center gap-1">
                                      <svg className="w-3 h-3 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                                      </svg>
                                      <span className="text-blue-300">{field.source}</span>
                                      <span className="text-slate-600">→</span>
                                      <span className="text-green-300">{field.onto_field}</span>
                                      {field.confidence && (
                                        <span className="text-[10px] text-slate-600 ml-auto">({Math.round(field.confidence * 100)}%)</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-xs text-slate-600 italic pl-2">Table-level mapping only</div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-600 italic">No mappings yet</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Column 3: Agent Consumption */}
            <div className="card">
              <div className="card-title mb-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                Consumed by Agents
              </div>
              <div className="space-y-3">
                {agentNodes.length > 0 ? (
                  agentNodes.map(agent => {
                    const consumption = agentConsumption[agent?.id] || { label: agent?.label || 'Unknown', entities: [] };
                    return (
                      <div key={agent?.id || Math.random()}>
                        <div className="bg-purple-900/20 border border-purple-800/50 rounded-lg px-3 py-2">
                          <div className="text-sm font-semibold text-purple-400 mb-2">{consumption?.label || 'Unknown Agent'}</div>
                          {consumption?.entities && consumption.entities.length > 0 ? (
                            <div className="space-y-1">
                              {consumption.entities.map((ent, i) => {
                                const ontoNode = ontologyNodes.find(n => n.id === ent.ontoId);
                                return (
                                  <div key={i} className="text-xs text-slate-400 flex items-center gap-1">
                                    <svg className="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                    <span>{ontoNode ? ontoNode.label.replace(' (Unified)', '') : ent.ontoId.replace('dcl_', '')}</span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-xs text-slate-600 italic">No matching data available</div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-sm text-slate-600 italic">No agents selected</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Summary Stats */}
        {hasData && (() => {
          // Calculate total source fields used across all ontology mappings
          const totalSourceFields = Object.values(consumedOntologyMappings).reduce((total, onto) => {
            return total + (onto?.sources || []).reduce((sum, src) => {
              return sum + (src?.fieldMappings?.length || 0);
            }, 0);
          }, 0);
          
          return (
            <div className="mt-6 grid grid-cols-3 gap-4">
              <div className="bg-blue-900/10 border border-blue-800/30 rounded-lg px-4 py-3">
                <div className="text-2xl font-bold text-blue-400">{sourceNodes.length}</div>
                <div className="text-xs text-slate-500">Source Tables</div>
                <div className="text-xs text-slate-600 mt-1">{consumedMappingEdges.length} fields consumed</div>
              </div>
              <div className="bg-green-900/10 border border-green-800/30 rounded-lg px-4 py-3">
                <div className="text-2xl font-bold text-green-400">{Object.keys(consumedOntologyMappings).length}</div>
                <div className="text-xs text-slate-500">Ontology Entities Mapped</div>
                <div className="text-xs text-slate-600 mt-1">Using {totalSourceFields} source fields</div>
              </div>
              <div className="bg-purple-900/10 border border-purple-800/30 rounded-lg px-4 py-3">
                <div className="text-2xl font-bold text-purple-400">{agentNodes.length}</div>
                <div className="text-xs text-slate-500">Active Agents</div>
                <div className="text-xs text-slate-600 mt-1">Consuming {consumptionEdges.length} entity types</div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
