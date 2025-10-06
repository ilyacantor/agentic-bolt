function MetricTile({label,value,delta}){
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
      <div className="text-slate-400 text-xs">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      <div className="text-emerald-400 text-xs mt-1">+{delta} (30d)</div>
    </div>
  );
}
function CommandCenter(){
  const {data:m, error, loading} = useJSON('./src/data/metrics.json'); const meta = m || {roi:0,automation:0,uptime:0,efficiency:0};
  return (
    <div className="p-5 w-full">
      <div className="max-w-7xl mx-auto space-y-6">
        <h2 className="text-xl font-semibold">Enterprise Command Center</h2>
        <div className="grid md:grid-cols-4 gap-4">{loading && <Skeleton className="h-20 w-full col-span-full" />} {error && <div className="text-rose-300 text-sm col-span-full">Failed to load metrics</div>}
          <MetricTile label="ROI Improvement" value={`${meta.roi}%`} delta="2.1%"/>
          <MetricTile label="Process Automation" value={`${meta.automation}%`} delta="1.2%"/>
          <MetricTile label="System Uptime" value={`${meta.uptime}%`} delta="Stable"/>
          <MetricTile label="Operational Efficiency" value={`${meta.efficiency}%`} delta="0.8%"/>
        </div>

        <div className="grid lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 card h-80 grid place-items-center">
            <div className="text-slate-400 text-sm">[ Interactive globe / map placeholder ]</div>
          </div>
          <div className="card">
            <div className="card-title mb-2">Critical Anomaly Alerts</div>
            <ul className="text-sm space-y-2">
              <li className="p-2 rounded-xl bg-rose-500/10 border border-rose-600/20">Unusual outbound traffic detected in APAC region. <span className="block text-xs text-slate-400">1 min ago</span></li>
              <li className="p-2 rounded-xl bg-amber-500/10 border border-amber-600/20">Service degradation in Payment Gateway API — Americas. <span className="block text-xs text-slate-400">3 min ago</span></li>
            </ul>
          </div>
        </div>

        <div className="card">
          <div className="card-title mb-3">Real‑time Activity Feed</div>
          <table className="w-full text-sm">
            <thead className="text-slate-400"><tr><th className="text-left p-2">Event</th><th className="text-left p-2">Description</th><th className="text-left p-2">Source</th></tr></thead>
            <tbody className="divide-y divide-slate-800">
              <tr><td className="p-2">Data Ingest</td><td className="p-2">Customer pipeline completed</td><td className="p-2">CRM</td></tr>
              <tr><td className="p-2">Agent Action</td><td className="p-2">Executive dashboard accessed by John Doe</td><td className="p-2">Analyst Portal</td></tr>
              <tr><td className="p-2">System Alert</td><td className="p-2">Critical DB latency in EU region</td><td className="p-2">Monitoring</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
