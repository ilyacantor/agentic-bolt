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
    case '/uncertain': Page = <UncertainUnifications/>; break;
    case '/agents': Page = <Agents/>; break;
    case '/pipeline': Page = <Pipeline/>; break;
    case '/command': Page = <CommandCenter/>; break;
    case '/faq': Page = <FAQ/>; break;
    default: Page = <DCLDashboard/>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <NavBar/>
      <main className="flex-1">{Page}</main>
    </div>
  );
}

Router.mount(<App/>);
