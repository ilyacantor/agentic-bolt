function DCLDashboard(){
  const [list, setList] = React.useState([]);
  React.useEffect(()=>{
    fetch('./src/data/connectors.json').then(r=>r.json()).then(setList);
  },[]);

  return (
    <div className="p-5 w-full">
      <div className="grid grid-cols-12 gap-5 max-w-7xl mx-auto">
        <div className="col-span-12 lg:col-span-3 card">
          <div className="card-title mb-3">Data Connectors</div>
          <div className="space-y-3">
            {list.map(c => (
              <div key={c.name} className="flex items-center justify-between bg-slate-900/50 rounded-xl px-3 py-2 border border-slate-800">
                <div className="text-sm">{c.name}</div>
                <StatusPill status={c.status}/>
              </div>
            ))}
          </div>
          <div className="separator"></div>
          <button className="w-full bg-slate-800 hover:bg-slate-700 rounded-xl py-2 text-sm">+ Add New Connector</button>
        </div>

        <div className="col-span-12 lg:col-span-6 card">
          <div className="flex items-center justify-between mb-2">
            <div className="card-title">Data Flow Node Map</div>
            <button className="text-xs px-2 py-1 bg-slate-800 rounded-lg border border-slate-700">Open Fullscreen</button>
          </div>
          <div className="rounded-xl bg-slate-900/50 border border-slate-800 h-[540px] grid place-items-center">
            <div className="text-slate-400 text-sm">[ Graph placeholder — plug D3/Cytoscape here ]</div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-3 space-y-5">
          <div className="card">
            <div className="card-title mb-3">Active Sync Status</div>
            <div className="text-sm subtle">Last Sync: <span className="text-slate-200">2024-07-26 10:30 AM</span></div>
            <div className="text-sm subtle">Next Sync: <span className="text-slate-200">2024-07-27 12:00 PM</span></div>
            <div className="text-sm subtle">Records Processed: <span className="text-slate-200">1,245,678</span></div>
            <div className="mt-3"><StatusPill status="Healthy"/></div>
          </div>
          <div className="card">
            <div className="card-title mb-2">Join Rules Overview</div>
            <ul className="text-sm space-y-2">
              <li className="bg-slate-900/50 border border-slate-800 rounded-lg p-2"><b>Salesforce.Accounts</b> → <b>Ontology.Customers</b> (key: SF.Id = Ontology.CustId) <span className="ml-2"><StatusPill status="Active"/></span></li>
              <li className="bg-slate-900/50 border border-slate-800 rounded-lg p-2"><b>SAP.Products</b> → <b>Ontology.Products</b> (key: SAP.Material = Ontology.ProductCode)</li>
              <li className="bg-slate-900/50 border border-slate-800 rounded-lg p-2"><b>Snowflake.Transactions</b> → <b>Ontology.SalesEvents</b> (key: SF.OrderID = Ontology.OrderID)</li>
            </ul>
          </div>
          <div className="card">
            <div className="card-title mb-2">Recent Error Logs</div>
            <div className="text-xs space-y-2">
              <div className="flex items-center justify-between"><span>2024-07-26 10:25</span><StatusPill status="Critical"/></div>
              <div className="text-slate-300">Failed to connect to Salesforce API. Authentication error.</div>
              <div className="separator"></div>
              <div className="flex items-center justify-between"><span>2024-07-25 09:15</span><StatusPill status="Warning"/></div>
              <div className="text-slate-300">Data type mismatch in Snowflake upload for table 'Financials'.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
