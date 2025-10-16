function OntologyMapping() {
  const [state, setState] = React.useState({
    graph: { nodes: [], edges: [] },
    selected_sources: [],
    selected_agents: []
  });
  
  const [sourceSchemas, setSourceSchemas] = React.useState({});
  const [ontologySchema, setOntologySchema] = React.useState({});

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
  
  React.useEffect(() => {
    const fetchOntologySchema = async () => {
      const res = await fetch('/ontology_schema');
      const data = await res.json();
      setOntologySchema(data);
    };
    fetchOntologySchema();
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
            <div className="card overflow-hidden">
              <div className="card-title mb-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                Incoming Source Structure
              </div>
              <div className="space-y-4">
                {Object.entries(sourceSchemas).map(([source, tables]) => (
                  <div key={source}>
                    <div className="text-sm font-semibold text-blue-400 mb-2 uppercase">{source}</div>
                    {Object.entries(tables).map(([tableName, tableInfo]) => {
                      const sourceId = `src_${source}_${tableName}`;
                      const schema = tableInfo?.schema || {};
                      const allFields = Object.keys(schema);
                      
                      // Get field mappings for this table
                      const tableMappingEdges = allMappingEdges.filter(e => e?.source === sourceId);
                      const fieldMappingsMap = new Map(); // source field -> {ontoField, ontoEntity, confidence}
                      
                      tableMappingEdges.forEach(edge => {
                        (edge?.field_mappings || []).forEach(fm => {
                          const ontoEntity = edge?.target?.replace('dcl_', '') || 'unknown';
                          fieldMappingsMap.set(fm.source, {
                            ontoField: fm.onto_field,
                            ontoEntity: ontoEntity,
                            confidence: fm.confidence
                          });
                        });
                      });
                      
                      return (
                        <div key={sourceId} className="mb-2">
                          <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg px-3 py-2">
                            <div className="text-sm font-medium text-blue-300 mb-2">{tableName}</div>
                            <div className="space-y-1 max-h-64 overflow-y-auto">
                              {allFields.map((field, i) => {
                                const mapping = fieldMappingsMap.get(field);
                                const isMapped = !!mapping;
                                return (
                                  <div key={i} className={`text-xs ${isMapped ? 'text-green-400 font-medium' : 'text-slate-500'}`}>
                                    <div className="flex items-center gap-1">
                                      {isMapped ? (
                                        <svg className="w-3 h-3 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                      ) : (
                                        <div className="w-3 h-3 flex-shrink-0"></div>
                                      )}
                                      <span className="truncate">{field}</span>
                                      <span className="text-[10px] text-slate-600 ml-auto flex-shrink-0">({schema[field]})</span>
                                    </div>
                                    {isMapped && (
                                      <div className="ml-4 mt-0.5 text-[10px] text-green-300">
                                        → unified to: <span className="font-semibold">{mapping.ontoField}</span> in {mapping.ontoEntity}
                                      </div>
                                    )}
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

            {/* Column 2: Ontology Entities & Fields */}
            <div className="card overflow-hidden">
              <div className="card-title mb-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                Unified Ontology (All Fields)
              </div>
              <div className="space-y-3">
                {Object.entries(consumedOntologyMappings).map(([ontoId, onto]) => {
                  const entityName = ontoId.replace('dcl_', '');
                  const entitySchema = ontologySchema[entityName] || { fields: [] };
                  const allFields = entitySchema.fields || [];
                  const pk = entitySchema.pk || '';
                  
                  // Get mapped field names for this entity
                  const mappedFieldNames = new Set();
                  (onto?.sources || []).forEach(src => {
                    (src.fieldMappings || []).forEach(field => {
                      mappedFieldNames.add(field.onto_field);
                    });
                  });
                  
                  return (
                    <div key={ontoId}>
                      <div className="bg-green-900/20 border border-green-800/50 rounded-lg px-3 py-2">
                        <div className="text-sm font-semibold text-green-400 mb-2">{onto?.label || 'Unknown'}</div>
                        {allFields.length > 0 ? (
                          <div className="space-y-0.5 max-h-64 overflow-y-auto">
                            {allFields.map((fieldName, i) => {
                              const isMapped = mappedFieldNames.has(fieldName);
                              const isPK = fieldName === pk;
                              return (
                                <div key={i} className={`text-xs flex items-center gap-1 ${isMapped ? 'text-green-300 font-medium' : 'text-slate-600'}`}>
                                  {isMapped ? (
                                    <svg className="w-3 h-3 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                  ) : (
                                    <div className="w-3 h-3 flex-shrink-0"></div>
                                  )}
                                  <span className="truncate">{fieldName}</span>
                                  {isPK && <span className="text-[10px] text-yellow-500 ml-auto">PK</span>}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-600 italic">No fields defined</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Column 3: Agent Consumption */}
            <div className="card overflow-hidden">
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
                            <div className="space-y-2">
                              {consumption.entities.map((ent, i) => {
                                const ontoNode = ontologyNodes.find(n => n.id === ent.ontoId);
                                const entityName = ent.ontoId.replace('dcl_', '');
                                const entitySchema = ontologySchema[entityName] || { fields: [] };
                                
                                // Get mapped fields for this entity
                                const mappedFields = new Set();
                                const incomingMappings = mappingEdges.filter(e => e?.target === ent.ontoId);
                                incomingMappings.forEach(edge => {
                                  (edge?.field_mappings || []).forEach(fm => {
                                    mappedFields.add(fm.onto_field);
                                  });
                                });
                                
                                return (
                                  <div key={i} className="text-xs">
                                    <div className="text-green-400 font-medium mb-1 flex items-center gap-1">
                                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                      </svg>
                                      {ontoNode ? ontoNode.label.replace(' (Unified)', '') : entityName}
                                    </div>
                                    <div className="ml-4 space-y-0.5 max-h-32 overflow-y-auto">
                                      {Array.from(mappedFields).map((field, j) => (
                                        <div key={j} className="text-[10px] text-slate-400">
                                          • {field}
                                        </div>
                                      ))}
                                      {mappedFields.size === 0 && (
                                        <div className="text-[10px] text-slate-600 italic">No fields mapped yet</div>
                                      )}
                                    </div>
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
          // Calculate unique source fields used across all ontology mappings
          const uniqueSourceFields = new Set();
          Object.values(consumedOntologyMappings).forEach(onto => {
            (onto?.sources || []).forEach(src => {
              (src?.fieldMappings || []).forEach(field => {
                uniqueSourceFields.add(field.source);
              });
            });
          });
          
          return (
            <div className="mt-6 grid grid-cols-3 gap-4">
              <div className="bg-blue-900/10 border border-blue-800/30 rounded-lg px-4 py-3">
                <div className="text-2xl font-bold text-blue-400">{sourceNodes.length}</div>
                <div className="text-xs text-slate-500">Source Tables</div>
                <div className="text-xs text-slate-600 mt-1">{uniqueSourceFields.size} fields consumed</div>
              </div>
              <div className="bg-green-900/10 border border-green-800/30 rounded-lg px-4 py-3">
                <div className="text-2xl font-bold text-green-400">{Object.keys(consumedOntologyMappings).length}</div>
                <div className="text-xs text-slate-500">Ontology Entities Mapped</div>
                <div className="text-xs text-slate-600 mt-1">Using {uniqueSourceFields.size} source fields</div>
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
