function UncertainUnifications() {
  const [state, setState] = React.useState({
    graph: { nodes: [], edges: [] },
    selected_sources: [],
    selected_agents: []
  });
  
  const [ontologySchema, setOntologySchema] = React.useState({});
  const [confidenceFilter, setConfidenceFilter] = React.useState(75);
  const CONFIDENCE_THRESHOLD = confidenceFilter / 100;

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

  // Filter for uncertain mappings (low confidence)
  const uncertainMappings = [];
  
  ontologyNodes.forEach(onto => {
    const entityName = onto.id.replace('dcl_', '');
    const entitySchema = ontologySchema[entityName] || { fields: [], pk: '' };
    
    const incomingMappings = mappingEdges.filter(e => e?.target === onto?.id) || [];
    
    incomingMappings.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const sourceParts = edge.source?.split('_') || [];
      const sourceSystem = sourceParts[1] || 'unknown';
      const sourceTable = sourceParts.slice(2).join('_') || 'Unknown';
      
      // Check for uncertain field mappings
      (edge?.field_mappings || []).forEach(fm => {
        const confidence = fm.confidence || 1.0;
        if (confidence < CONFIDENCE_THRESHOLD) {
          uncertainMappings.push({
            entityName,
            entityLabel: onto?.label || entityName,
            sourceSystem,
            sourceTable,
            sourceField: fm.source,
            unifiedField: fm.onto_field,
            confidence,
            transform: fm.transform || 'direct',
            edgeId: edge.source + '_' + onto.id
          });
        }
      });
    });
  });

  // Sort by confidence (lowest first)
  uncertainMappings.sort((a, b) => a.confidence - b.confidence);

  const hasData = uncertainMappings.length > 0;

  return (
    <div className="p-5 w-full">
      <div className="max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Edge Cases</h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-400">Confidence Threshold:</label>
              <select 
                value={confidenceFilter}
                onChange={(e) => setConfidenceFilter(Number(e.target.value))}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value={90}>Below 90%</option>
                <option value={80}>Below 80%</option>
                <option value={75}>Below 75%</option>
                <option value={70}>Below 70%</option>
                <option value={65}>Below 65%</option>
                <option value={60}>Below 60%</option>
                <option value={50}>Below 50%</option>
                <option value={40}>Below 40%</option>
                <option value={30}>Below 30%</option>
              </select>
            </div>
            <div className="text-sm text-slate-500">
              {uncertainMappings.length} edge case{uncertainMappings.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {!hasData ? (
          <div className="card text-center py-12">
            <div className="text-green-500 mb-2 text-4xl">✓</div>
            <div className="text-slate-500 mb-2">No edge cases found!</div>
            <div className="text-sm text-slate-600">All field mappings meet or exceed the {confidenceFilter}% confidence threshold.</div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Confidence Legend */}
            <div className="card bg-slate-900/50 border-yellow-700/30">
              <div className="flex items-center gap-4">
                <div className="text-sm font-medium text-yellow-400">Confidence Levels:</div>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-red-500/30 border border-red-500"></div>
                    <span>&lt;50% (Very Low)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-orange-500/30 border border-orange-500"></div>
                    <span>50-65% (Low)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-yellow-500/30 border border-yellow-500"></div>
                    <span>65-75% (Moderate)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Uncertain Mappings Table */}
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Confidence</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Source System</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Source Table</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Source Field</th>
                      <th className="text-center py-3 px-4 text-sm font-medium text-slate-400">→</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Unified Entity</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Unified Field</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Transform</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uncertainMappings.map((mapping, i) => {
                      const confidence = Math.round(mapping.confidence * 100);
                      const confidenceColor = 
                        confidence < 50 ? 'bg-red-500/30 border-red-500 text-red-300' :
                        confidence < 65 ? 'bg-orange-500/30 border-orange-500 text-orange-300' :
                        'bg-yellow-500/30 border-yellow-500 text-yellow-300';
                      
                      return (
                        <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-4">
                            <div className={`inline-flex items-center gap-2 px-2 py-1 rounded border ${confidenceColor}`}>
                              <div className="w-2 h-2 rounded-full bg-current"></div>
                              <span className="text-sm font-medium">{confidence}%</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm text-blue-400 font-medium uppercase">{mapping.sourceSystem}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm text-blue-300">{mapping.sourceTable}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm text-slate-300 font-mono">{mapping.sourceField}</span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <svg className="w-4 h-4 text-slate-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm text-green-400 font-medium">{mapping.entityLabel}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm text-green-300 font-mono">{mapping.unifiedField}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-xs text-slate-500 italic">{mapping.transform}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-red-900/10 border border-red-800/30 rounded-lg px-4 py-3">
                <div className="text-2xl font-bold text-red-400">
                  {uncertainMappings.filter(m => m.confidence < 0.50).length}
                </div>
                <div className="text-xs text-slate-500">Very Low Confidence (&lt;50%)</div>
              </div>
              <div className="bg-orange-900/10 border border-orange-800/30 rounded-lg px-4 py-3">
                <div className="text-2xl font-bold text-orange-400">
                  {uncertainMappings.filter(m => m.confidence >= 0.50 && m.confidence < 0.65).length}
                </div>
                <div className="text-xs text-slate-500">Low Confidence (50-65%)</div>
              </div>
              <div className="bg-yellow-900/10 border border-yellow-800/30 rounded-lg px-4 py-3">
                <div className="text-2xl font-bold text-yellow-400">
                  {uncertainMappings.filter(m => m.confidence >= 0.65 && m.confidence < CONFIDENCE_THRESHOLD).length}
                </div>
                <div className="text-xs text-slate-500">Moderate Confidence (65-75%)</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
