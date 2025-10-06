function useJSON(url){
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(()=>{
    let cancelled = false;
    setLoading(true); setError(null);
    window.__jsonCache = window.__jsonCache || {};
    if (window.__jsonCache[url]) { setData(window.__jsonCache[url]); setLoading(false); return; }
    fetch(url, { cache: 'no-store' })
      .then(r => { if(!r.ok) throw new Error(`HTTP ${r.status} on ${url}`); return r.json(); })
      .then(j => { if(cancelled) return; window.__jsonCache[url]=j; setData(j); })
      .catch(e => !cancelled && setError(e))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [url]);
  return { data, error, loading };
}
