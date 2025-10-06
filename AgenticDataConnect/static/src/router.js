const Router = {
  routes: {},
  mount(component) { ReactDOM.createRoot(document.getElementById('root')).render(component); },
  go(path) { window.location.hash = path; },
  current() { return window.location.hash.replace('#','') || '/'; }
};
