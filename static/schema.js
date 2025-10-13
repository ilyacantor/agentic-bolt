let schemaFields = [{name: '', type: ''}];

function renderSchemaFields(){
  const container = document.getElementById('schemaFieldsContainer');
  container.innerHTML = schemaFields.map((field, i) => `
    <div style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center;">
      <input 
        type="text" 
        placeholder="Field name (e.g., custRef)" 
        value="${field.name}" 
        onchange="updateSchemaField(${i}, 'name', this.value)"
        style="flex: 1; padding: 8px; background: #ffffff; border: 1px solid #d1d5db; border-radius: 6px; color: #111827;"
      />
      <select 
        onchange="updateSchemaField(${i}, 'type', this.value)"
        style="padding: 8px; background: #ffffff; border: 1px solid #d1d5db; border-radius: 6px; color: #111827;"
      >
        <option value="">Select type</option>
        <option value="Text" ${field.type === 'Text' ? 'selected' : ''}>Text</option>
        <option value="Number" ${field.type === 'Number' ? 'selected' : ''}>Number</option>
        <option value="DateTime" ${field.type === 'DateTime' ? 'selected' : ''}>DateTime</option>
        <option value="Currency" ${field.type === 'Currency' ? 'selected' : ''}>Currency</option>
      </select>
      ${schemaFields.length > 1 ? `<button onclick="removeSchemaField(${i})" style="padding: 6px 10px;">✕</button>` : ''}
    </div>
  `).join('');
}

function addSchemaField(){
  if(schemaFields.length < 5){
    schemaFields.push({name: '', type: ''});
    renderSchemaFields();
  }
}

function removeSchemaField(index){
  schemaFields.splice(index, 1);
  renderSchemaFields();
}

function updateSchemaField(index, key, value){
  schemaFields[index][key] = value;
}

async function resetSchemaInference(){
  schemaFields = [{name: '', type: ''}];
  renderSchemaFields();
  document.getElementById('schemaResults').innerHTML = '';
  await resetDemo();
}

async function inferOntology(){
  const validFields = schemaFields.filter(f => f.name && f.type);
  if(validFields.length === 0){
    alert('Please add at least one field with both name and type');
    return;
  }
  
  const resultsDiv = document.getElementById('schemaResults');
  resultsDiv.innerHTML = '<p style="color: #2563eb;">Processing with AI...</p>';
  
  try {
    const response = await fetch('/api/infer', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({fields: validFields})
    });
    
    const data = await response.json();
    
    resultsDiv.innerHTML = `
      <table border="1" style="margin-top: 12px; width: 100%;">
        <thead>
          <tr>
            <th>Field</th>
            <th>Type</th>
            <th>Suggested Mapping</th>
            <th>Transformation</th>
          </tr>
        </thead>
        <tbody>
          ${data.mappings.map(m => `
            <tr>
              <td>${m.name}</td>
              <td>${m.type}</td>
              <td>${m.suggested_mapping}</td>
              <td>${m.transformation}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (error) {
    resultsDiv.innerHTML = `<p style="color: #ef4444;">Error: ${error.message}</p>`;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  renderSchemaFields();
  fetchState();
  setInterval(fetchState, 2000);
});
