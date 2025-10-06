function App(){
  const [path, setPath] = React.useState(Router.current());
  React.useEffect(()=>{
    const onHash = ()=> setPath(Router.current());
    window.addEventListener('hashchange', onHash);
    return ()=> window.removeEventListener('hashchange', onHash);
  },[]);

  let Page = null;
  switch(path){
    case '/':
    case '/dcl': Page = <DCLDashboard/>; break;
    case '/ontology': Page = <OntologyMapping/>; break;
    case '/agents': Page = <Agents/>; break;
    case '/pipeline': Page = <Pipeline/>; break;
    case '/command': Page = <CommandCenter/>; break;
    default: Page = <div className="p-6">Not found</div>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <NavBar/>
      <div className="flex flex-1">
        <SideNav/>
        <main className="flex-1"><ErrorBoundary>{Page}</ErrorBoundary></main>
      </div>
    </div>
  );
}

Router.mount(<App/>);
