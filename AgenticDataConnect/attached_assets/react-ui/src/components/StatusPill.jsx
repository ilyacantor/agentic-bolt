function StatusPill({status}){
  const map = {
    Active: 'badge badge-green',
    Pending: 'badge badge-amber',
    Inactive: 'badge badge-red',
    Error: 'badge badge-red',
    Healthy: 'badge badge-green',
    Success: 'badge badge-green',
    Failed: 'badge badge-red',
    Warning: 'badge badge-amber'
  };
  return <span className={(map[status] || 'badge')}>{status}</span>;
}
