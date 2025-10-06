function Pipeline(){
  const stages = [
    {name:'Data Ingestion', latency:150, acc:98.8, conf:95},
    {name:'Ontology Enrichment', latency:250, acc:98.5, conf:88},
    {name:'Agent Decision', latency:400, acc:99.2, conf:92},
    {name:'Action Execution', latency:300, acc:99.0, conf:97},
  ];
  const [tick, setTick] = React.useState(0);
  React.useEffect(()=>{
    const id = setInterval(()=>setTick(t=>t+1), 3000);
    return ()=>clearInterval(id);
  },[]);

  return (
    <div className="p-5 w-full">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 card">
          <div className="card-title mb-4">Current Flow Status</div>
          <div className="grid md:grid-cols-4 gap-4">
            {stages.map((s,i)=>(
              <div key={s.name} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
                <div className="font-medium mb-2">{s.name}</div>
                <div className="text-xs text-slate-400">Latency: <span className="text-slate-200">{s.latency + (tick%2===0?5:0)}ms</span></div>
                <div className="text-xs text-slate-400">Accuracy: <span className="text-slate-200">{s.acc}%</span></div>
                <div className="text-xs text-slate-400">Confidence: <span className="text-slate-200">{s.conf}%</span></div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-title mb-3">Recent Agent Actions</div>
          <div className="space-y-3 text-sm">
            <div className="p-3 rounded-xl border border-emerald-700/30 bg-emerald-500/10">Decision Agent X applied policy <b>FraudDetection_v2</b>. <span className="block text-xs text-slate-400">Just now</span></div>
            <div className="p-3 rounded-xl border border-rose-700/30 bg-rose-500/10">Data Ingestion service failed on batch <b>B-4567</b>. <span className="block text-xs text-slate-400">1 min ago</span></div>
            <div className="p-3 rounded-xl border border-sky-700/30 bg-sky-500/10">Ontology Updater added new entities <b>Product_SKU_001</b>. <span className="block text-xs text-slate-400">5 min ago</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
