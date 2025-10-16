function MappingDetails() {
  const [state, setState] = React.useState({
    graph: { nodes: [], edges: [] },
    selected_sources: [],
    selected_agents: []
  });
  
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
    const fetchOntologySchema = async () => {
      const res = await fetch('/ontology_schema');
      const data = await res.json();
      setOntologySchema(data);
    };
    fetchOntologySchema();
  }, []);

  const nodes = state?.graph?.nodes || [];
  const edges = state?.graph?.edges || [];
  
  const ontologyNodes = nodes.filter(n => n.type === 'ontology');
  const mappingEdges = edges.filter(e => e.type === 'mapping');
  const consumptionEdges = edges.filter(e => e.type === 'consumption');

  // Build detailed mapping structure for each ontology entity
  const entityMappings = {};
  
  ontologyNodes.forEach(onto => {
    const entityName = onto.id.replace('dcl_', '');
    const entitySchema = ontologySchema[entityName] || { fields: [], pk: '' };
    
    // Get all incoming mapping edges
    const incomingMappings = mappingEdges.filter(e => e?.target === onto?.id) || [];
    
    // Get all outgoing consumption edges (which agents consume this)
    const consumingAgents = consumptionEdges
      .filter(e => e?.source === onto?.id)
      .map(e => {
        const agentNode = nodes.find(n => n.id === e.target);
        return agentNode?.label || e.target;
      });
    
    // Build source mappings with field details
    const sourceMappings = incomingMappings.map(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const sourceParts = edge.source?.split('_') || [];
      const sourceSystem = sourceParts[1] || 'unknown';
      const sourceTable = sourceParts.slice(2).join('_') || 'Unknown';
      
      return {
        sourceSystem,
        sourceTable,
        sourceLabel: sourceNode?.label || edge.source,
        edgeLabel: edge?.label || '',
        fieldMappings: edge?.field_mappings || [],
        confidence: edge?.confidence
      };
    });
    
    // Get mapped field names
    const mappedFields = new Set();
    sourceMappings.forEach(sm => {
      sm.fieldMappings.forEach(fm => {
        mappedFields.add(fm.onto_field);
      });
    });
    
    entityMappings[entityName] = {
      label: onto?.label || entityName,
      allFields: entitySchema.fields || [],
      pk: entitySchema.pk || '',
      sourceMappings,
      mappedFields,
      consumingAgents,
      totalEdges: incomingMappings.length
    };
  });

  const hasData = Object.keys(entityMappings).length > 0;

  return (
    <div className="p-5 w-full">
      <div className="max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Detailed Mapping Report</h2>
          <div className="text-sm text-slate-400">
            Field-level visibility into data flows
          </div>
        </div>

        {!hasData ? (
          <div className="card text-center py-12">
            <div className="text-slate-500 mb-2">No mappings available</div>
            <div className="text-sm text-slate-600">Connect data sources in the Dashboard to see detailed mappings</div>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(entityMappings).map(([entityName, entity]) => (
              <div key={entityName} className="card">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-green-400">{entity.label}</h3>
                    <div className="text-sm text-slate-500 mt-1">
                      {entity.totalEdges} incoming edge{entity.totalEdges !== 1 ? 's' : ''} • {entity.allFields.length} total fields • {entity.mappedFields.size} mapped
                    </div>
                  </div>
                  {entity.consumingAgents.length > 0 && (
                    <div className="text-sm">
                      <div className="text-slate-500 mb-1">Consumed by:</div>
                      <div className="flex gap-2">
                        {entity.consumingAgents.map((agent, i) => (
                          <span key={i} className="px-2 py-1 bg-purple-900/30 border border-purple-700/50 rounded text-xs text-purple-300">
                            {agent}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Entity Fields Overview */}
                <div className="mb-4 p-3 bg-slate-900/50 border border-slate-700/50 rounded-lg">
                  <div className="text-sm font-medium text-slate-400 mb-2">Entity Schema ({entity.allFields.length} fields)</div>
                  <div className="flex flex-wrap gap-2">
                    {entity.allFields.map((field, i) => {
                      const isMapped = entity.mappedFields.has(field);
                      const isPK = field === entity.pk;
                      return (
                        <div key={i} className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${
                          isMapped 
                            ? 'bg-green-900/40 border border-green-700/50 text-green-300' 
                            : 'bg-slate-800/40 border border-slate-700/50 text-slate-500'
                        }`}>
                          {isMapped && (
                            <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                          <span>{field}</span>
                          {isPK && <span className="text-yellow-500">⚿</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Source Mappings */}
                <div className="space-y-3">
                  <div className="text-sm font-medium text-slate-400">Source Mappings</div>
                  {entity.sourceMappings.length > 0 ? (
                    entity.sourceMappings.map((sm, i) => (
                      <div key={i} className="p-3 bg-blue-900/20 border border-blue-800/50 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                            <span className="text-sm font-medium text-blue-400">{sm.sourceSystem.toUpperCase()}</span>
                            <span className="text-slate-600">→</span>
                            <span className="text-sm text-blue-300">{sm.sourceTable}</span>
                          </div>
                          {sm.confidence && (
                            <span className="text-xs text-slate-500">
                              {Math.round(sm.confidence * 100)}% confidence
                            </span>
                          )}
                        </div>
                        
                        {sm.fieldMappings && sm.fieldMappings.length > 0 ? (
                          <div className="space-y-1 mt-2 pl-4">
                            {sm.fieldMappings.map((fm, j) => (
                              <div key={j} className="flex items-center gap-2 text-xs">
                                <svg className="w-3 h-3 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                                <span className="text-blue-300 font-mono">{fm.source}</span>
                                <span className="text-slate-600">→</span>
                                <span className="text-green-300 font-mono">{fm.onto_field}</span>
                                {fm.transform && fm.transform !== 'direct' && (
                                  <span className="text-slate-500 italic">({fm.transform})</span>
                                )}
                                {fm.confidence && (
                                  <span className="text-slate-600 ml-auto">{Math.round(fm.confidence * 100)}%</span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-600 italic pl-4">
                            Table-level mapping (no field details)
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-slate-600 italic">No source mappings</div>
                  )}
                </div>

                {/* Unmapped Fields */}
                {entity.allFields.length > entity.mappedFields.size && (
                  <div className="mt-4 p-3 bg-slate-900/30 border border-slate-700/30 rounded-lg">
                    <div className="text-sm font-medium text-slate-500 mb-2">
                      Unmapped Fields ({entity.allFields.length - entity.mappedFields.size})
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {entity.allFields
                        .filter(f => !entity.mappedFields.has(f))
                        .map((field, i) => (
                          <span key={i} className="px-2 py-1 bg-slate-800/40 border border-slate-700/40 rounded text-xs text-slate-600">
                            {field}
                          </span>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Summary Stats */}
        {hasData && (() => {
          const totalEntities = Object.keys(entityMappings).length;
          const totalEdges = Object.values(entityMappings).reduce((sum, e) => sum + e.totalEdges, 0);
          const totalFields = Object.values(entityMappings).reduce((sum, e) => sum + e.allFields.length, 0);
          const totalMappedFields = Object.values(entityMappings).reduce((sum, e) => sum + e.mappedFields.size, 0);
          
          return (
            <div className="mt-6 grid grid-cols-4 gap-4">
              <div className="bg-green-900/10 border border-green-800/30 rounded-lg px-4 py-3">
                <div className="text-2xl font-bold text-green-400">{totalEntities}</div>
                <div className="text-xs text-slate-500">Ontology Entities</div>
              </div>
              <div className="bg-blue-900/10 border border-blue-800/30 rounded-lg px-4 py-3">
                <div className="text-2xl font-bold text-blue-400">{totalEdges}</div>
                <div className="text-xs text-slate-500">Total Mapping Edges</div>
              </div>
              <div className="bg-purple-900/10 border border-purple-800/30 rounded-lg px-4 py-3">
                <div className="text-2xl font-bold text-purple-400">{totalMappedFields}</div>
                <div className="text-xs text-slate-500">Fields Mapped</div>
              </div>
              <div className="bg-slate-800/30 border border-slate-700/30 rounded-lg px-4 py-3">
                <div className="text-2xl font-bold text-slate-400">{totalFields - totalMappedFields}</div>
                <div className="text-xs text-slate-500">Fields Unmapped</div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
