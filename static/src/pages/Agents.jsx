function Agents(){
  const [list, setList] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    fetch('/static/src/data/agents.json')
      .then(res => res.json())
      .then(data => {
        setList(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="p-5 w-full">
      <div className="max-w-7xl mx-auto space-y-6">
        <h2 className="text-xl font-semibold">Active Agents</h2>

        {loading && <div className="text-slate-400 text-sm">Loading agents...</div>}
        {error && (
          <div className="text-rose-300 text-sm col-span-full">
            Failed to load agents
          </div>
        )}

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {(list || []).map(a => (
            <div key={a.name} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <div className="card-title">{a.name}</div>
                  <div className="subtle">
                    Tasks Completed:{' '}
                    <span className="text-slate-200">{a.tasksCompleted}</span>
                  </div>
                  <div className="subtle">Last Activity: {a.lastActivity}</div>
                </div>
                <StatusPill status={a.state}/>
              </div>

              <div className="mt-3">
                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      a.state === 'Running'
                        ? 'bg-emerald-500'
                        : a.state === 'Paused'
                        ? 'bg-amber-500'
                        : 'bg-slate-600'
                    }`}
                    style={{ width: `${a.progress || 0}%` }}
                  />
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Progress: {a.progress || 0}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
