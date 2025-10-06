function OntologyMapping(){
  const incoming = {
    Accounts: ['Account ID','Account Name','Industry','Annual Revenue','Owner ID'],
    Opportunities: ['Opportunity ID','Opportunity Name','Amount','Stage','Close Date','Account ID'],
    Invoices: ['Invoice ID','Invoice Date','Total Amount','Customer Account ID','Payment Status']
  };
  const targets = {
    Entity: ['Customer Entity','Product Entity','Location Entity','Employee Entity'],
    Relation: ['has_address','owns_product','works_for','related_to'],
    Attribute: ['Name','ID','Value','Date','Status','Email','Category']
  };

  return (
    <div className="p-5 w-full">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Ontology Mapping Workspace</h2>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm">Auto‑Match</button>
            <button className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm">Validate Schema</button>
            <button className="px-3 py-1.5 rounded-lg bg-rose-700 border border-rose-600 text-sm">Clear All</button>
            <button className="px-3 py-1.5 rounded-lg bg-brand-600 text-sm">Save Mapping</button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <div className="card">
            <div className="card-title mb-2">Incoming Datasets</div>
            {Object.entries(incoming).map(([k, arr])=> (
              <div key={k} className="mb-3">
                <div className="text-slate-300 font-medium mb-1">{k}</div>
                <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-3">
                  <ul className="grid grid-cols-2 gap-2 text-sm">
                    {arr.map(f=> <li key={f} className="bg-slate-800/60 rounded-lg px-2 py-1">{f}</li>)}
                  </ul>
                </div>
              </div>
            ))}
          </div>

          <div className="card relative">
            <div className="card-title mb-2">Ontology Targets</div>
            {Object.entries(targets).map(([k, arr])=> (
              <div key={k} className="mb-3">
                <div className="text-slate-300 font-medium mb-1">{k}</div>
                <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-3">
                  <ul className="grid grid-cols-2 gap-2 text-sm">
                    {arr.map(f=> <li key={f} className="bg-slate-800/60 rounded-lg px-2 py-1">{f}</li>)}
                  </ul>
                </div>
              </div>
            ))}
            <div className="absolute inset-0 pointer-events-none">
              {/* SVG lines placeholder could be added later */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
