function NavBar({onSearch}){
  return (
    <div className="h-14 w-full border-b border-slate-800 bg-slate-900/70 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto h-full flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-brand-600 grid place-items-center text-white font-bold">∗</div>
          <a href="#/" className="text-lg font-semibold">AutonomOS</a>
          <div className="hidden sm:flex items-center gap-6 text-sm text-slate-300 ml-6">
            <a href="#/dcl" className="hover:text-white">Data Connectivity Layer</a>
            <a href="#/ontology" className="hover:text-white">Ontology Mapping</a>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center bg-slate-800/70 rounded-xl px-3 py-1.5 border border-slate-700">
            <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor' className='w-4 h-4 text-slate-400'><path fillRule='evenodd' d='M10.5 3.75a6.75 6.75 0 015.364 10.815l3.285 3.286a.75.75 0 11-1.06 1.06l-3.286-3.285A6.75 6.75 0 1110.5 3.75zm0 1.5a5.25 5.25 0 100 10.5 5.25 5.25 0 000-10.5z' clipRule='evenodd'/></svg>
            <input onChange={e=>onSearch?.(e.target.value)} placeholder="Search data sources..." className="bg-transparent outline-none text-sm px-2 placeholder:text-slate-500"/>
          </div>
          <a href="#/pipeline" className="text-sm text-slate-300 hover:text-white">Notifications</a>
          <a href="#/command" className="text-sm bg-brand-600 hover:bg-brand-500 rounded-xl px-3 py-1.5">User</a>
        </div>
      </div>
    </div>
  );
}
