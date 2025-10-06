class ErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state = { hasError:false, error:null }; }
  static getDerivedStateFromError(error){ return { hasError:true, error }; }
  componentDidCatch(error, info){ console.error('UI ErrorBoundary:', error, info); }
  render(){
    if(this.state.hasError){
      return (
        <div className="p-4 m-4 rounded-xl border border-rose-700/40 bg-rose-900/20">
          <div className="font-semibold mb-1">Something went wrong.</div>
          <div className="text-sm text-rose-200/80">{String(this.state.error)}</div>
        </div>
      );
    }
    return this.props.children;
  }
}
