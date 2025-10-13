function SideNav(){
  const items = [
    { href:'#/dcl', label:'Data Connectivity Layer', icon:'database'},
    { href:'#/ontology', label:'Ontology Mapping', icon:'map' },
    { href:'#/agents', label:'Agents', icon:'bot' },
    { href:'#/pipeline', label:'Pipeline', icon:'flow' },
    { href:'#/command', label:'Command Center', icon:'spark' },
  ];
  return (
    <aside className="hidden md:block w-64 shrink-0 border-r border-slate-800 bg-slate-900/40 min-h-[calc(100vh-3.5rem)]">
      <nav className="p-3 space-y-1">
        {items.map(it=> (
          <a key={it.href} href={it.href} className="flex items-center gap-2 px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/60">
            <span className="w-5 h-5 rounded bg-slate-800 grid place-items-center text-xs">●</span>
            <span className="text-sm">{it.label}</span>
          </a>
        ))}
      </nav>
    </aside>
  );
}
