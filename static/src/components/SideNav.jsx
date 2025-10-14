function SideNav(){
  const [collapsed, setCollapsed] = React.useState(false);
  
  const items = [
    { href:'#/dcl', label:'Data Connectivity Layer', icon:'📊'},
    { href:'#/ontology', label:'Ontology Mapping', icon:'🗺️' },
    { href:'#/agents', label:'Agents', icon:'🤖' },
    { href:'#/pipeline', label:'Pipeline', icon:'⚡' },
    { href:'#/command', label:'Command Center', icon:'💻' },
  ];
  
  return (
    <aside className={`hidden md:block ${collapsed ? 'w-16' : 'w-64'} shrink-0 border-r border-slate-800 bg-slate-900/40 min-h-[calc(100vh-3.5rem)] transition-all duration-300`}>
      <nav className="p-2 space-y-1">
        {/* Collapse Toggle Button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full hover:bg-slate-800/60 rounded-lg p-1.5 flex items-center justify-center text-slate-400 hover:text-white transition-colors mb-2"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg 
            className={`w-3.5 h-3.5 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
        
        {items.map(it=> (
          <a 
            key={it.href} 
            href={it.href} 
            className={`flex items-center ${collapsed ? 'justify-center px-2' : 'gap-2 px-3'} py-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all`}
            title={collapsed ? it.label : ''}
          >
            <span className="text-base">{it.icon}</span>
            {!collapsed && <span className="text-sm">{it.label}</span>}
          </a>
        ))}
      </nav>
    </aside>
  );
}
