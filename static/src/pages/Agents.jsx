function Agents(){
  const [list, setList] = React.useState([]);
  React.useEffect(()=>{
    fetch('./src/data/agents.json').then(r=>r.json()).then(setList);
  },[]);

  // Simulate progress updates
  React.useEffect(()=>{
    const id = setInterval(()=>{
      setList(prev => prev.map(a => (a.state==='Running' ? {...a, progress: (a.progress+Math.floor(Math.random()*5))%100 } : a)));
    }, 2500);
    return ()=>clearInterval(id);
  },[]);

  return (
    <div className="p-5 w-full">
      <div className="max-w-7xl mx-auto space-y-6">
        <h2 className="text-xl font-semibold">Active Agents</h2>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {list.map(a => (
            <div key={a.name} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <div className="card-title">{a.name}</div>
                  <div className="subtle">Tasks Completed: <span className="text-slate-200">{a.tasksCompleted}</span></div>
                  <div className="subtle">Last Activity: {a.lastActivity}</div>
                </div>
                <StatusPill status={a.state}/>
              </div>
              <div className="mt-4">
                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div className={"h-full " + (a.state==='Error'?'bg-rose-600':'bg-emerald-600')} style={{width:`${a.progress}%`}}></div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-5">
          <div className="card">
            <div className="card-title mb-2">Triggers</div>
            <table className="w-full text-sm">
              <thead className="text-slate-400"><tr><th className="text-left p-2">Trigger</th><th className="text-left p-2">Condition</th><th className="text-left p-2">Agent</th><th className="text-left p-2">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-800">
                <tr><td className="p-2">New High-Value Lead</td><td className="p-2">Lead Score &gt; 90</td><td className="p-2">Sales Pipeline Optimizer</td><td className="p-2"><StatusPill status="Active"/></td></tr>
                <tr><td className="p-2">Critical Support Ticket</td><td className="p-2">Priority = Critical</td><td className="p-2">Customer Support Bot</td><td className="p-2"><StatusPill status="Active"/></td></tr>
              </tbody>
            </table>
          </div>
          <div className="card">
            <div className="card-title mb-2">Recent Actions</div>
            <table className="w-full text-sm">
              <thead className="text-slate-400"><tr><th className="text-left p-2">Action</th><th className="text-left p-2">Agent</th><th className="text-left p-2">Status</th><th className="text-left p-2">Time</th></tr></thead>
              <tbody className="divide-y divide-slate-800">
                <tr><td className="p-2">Send Welcome Email</td><td className="p-2">Sales Pipeline Optimizer</td><td className="p-2"><StatusPill status="Success"/></td><td className="p-2">14:32</td></tr>
                <tr><td className="p-2">Create Jira Ticket</td><td className="p-2">Customer Support Bot</td><td className="p-2"><StatusPill status="Failed"/></td><td className="p-2">10:17</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
