function NavBar({onSearch}){
  const [devMode, setDevMode] = React.useState(true);

  const toggleDevMode = async () => {
    const res = await fetch('/toggle_dev_mode');
    const data = await res.json();
    setDevMode(data.dev_mode);
  };

  React.useEffect(() => {
    fetch('/state')
      .then(r => r.json())
      .then(d => setDevMode(d.dev_mode));
  }, []);

  return (
    <div className="h-14 w-full border-b border-slate-800 bg-slate-900/70 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto h-full flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <img src="/static/favicon.png" alt="autonomOS" className="w-7 h-7"/>
          <a href="#/" className="text-lg font-semibold">autonom<span className="text-cyan-500">OS</span></a>
          <div className="hidden sm:flex items-center gap-6 text-sm text-slate-300 ml-6">
            <a href="#/dcl" className="hover:text-white">Data Connectivity Layer</a>
            <a href="#/ontology" className="hover:text-white">Ontology Mapping</a>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center bg-slate-800/70 rounded-xl px-3 py-1.5 border border-slate-700">
            <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor' className='w-4 h-4 text-slate-400'><path fillRule='evenodd' d='M10.5 3.75a6.75 6.75 0 105.364 10.815l3.285 3.286a.75.75 0 11-1.06 1.06l-3.286-3.285A6.75 6.75 0 1110.5 3.75zm0 1.5a5.25 5.25 0 100 10.5 5.25 5.25 0 000-10.5z' clipRule='evenodd'/></svg>
            <input onChange={e=>onSearch?.(e.target.value)} placeholder="Search data sources..." className="bg-transparent outline-none text-sm px-2 placeholder:text-slate-500"/>
          </div>
          
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-xl border border-slate-700">
            <span className="text-xs text-slate-400">Prod Mode</span>
            <button 
              onClick={toggleDevMode}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${devMode ? 'bg-green-600' : 'bg-slate-600'}`}
            >
              <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${devMode ? 'translate-x-5' : 'translate-x-1'}`}/>
            </button>
            <span className="text-xs font-medium" style={{color: devMode ? '#10b981' : '#94a3b8'}}>
              {devMode ? 'ON' : 'OFF'}
            </span>
          </div>

          <a href="#/pipeline" className="text-sm text-slate-300 hover:text-white">Notifications</a>
          <a href="#/command" className="text-sm bg-brand-600 hover:bg-brand-500 rounded-xl px-3 py-1.5">User</a>
        </div>
      </div>
    </div>
  );
}
