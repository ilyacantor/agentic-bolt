async function fetchState(){
  await refreshState();
  document.getElementById('autoIngestToggle').checked = state.auto_ingest_unmapped || false;
}

async function addSource(){
  const btn = event.target;
  const src = document.getElementById('source').value;
  btn.disabled = true;
  btn.textContent = 'Processing...';
  try {
    await fetch('/connect?source='+encodeURIComponent(src));
    await fetchState();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add Source';
  }
}

async function resetDemo(){
  await fetch('/reset');
  await fetchState();
}

async function toggleAutoIngest(){
  const toggle = document.getElementById('autoIngestToggle');
  await fetch('/toggle_auto_ingest?enabled=' + toggle.checked);
  await fetchState();
}
