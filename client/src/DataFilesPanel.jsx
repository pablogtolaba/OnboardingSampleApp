import React, { useState, useEffect } from 'react';

const MAX_ISSUES_SHOWN = 3;

function DataFilesPanel({ customer, onClose }) {
  const [inventory, setInventory] = useState(null);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetch(`/api/customers/${customer.id}/data-files`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setInventory(await res.json());
      })
      .catch(err => setError(err.message));
  }, [customer.id]);

  async function handleFiles(event) {
    const selected = [...event.target.files];
    event.target.value = '';
    if (selected.length === 0) return;

    setUploading(true);
    setError(null);
    try {
      const files = await Promise.all(selected.map(async f => ({ name: f.name, content: await f.text() })));
      const res = await fetch(`/api/customers/${customer.id}/data-files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setInventory(body);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="data-files-panel">
      <div className="section-header">
        <h3>Data files for {customer.name}</h3>
        <button className="btn" onClick={onClose}>Close</button>
      </div>

      <label className="btn btn-primary file-upload">
        {uploading ? 'Uploading…' : 'Attach CSV files'}
        <input type="file" accept=".csv,text/csv" multiple onChange={handleFiles} disabled={uploading} />
      </label>

      {error && <p className="field-error">{error}</p>}

      {inventory && inventory.files.length === 0 && (
        <p className="muted">No files attached yet. Expecting clients, contacts, chart of accounts and transactions.</p>
      )}

      {inventory && inventory.files.length > 0 && (
        <>
          <ProfileSummary profile={inventory.profile} customer={customer} />

          {inventory.missingEntities.length > 0 && (
            <p className="warning">⚠️ Still missing: {inventory.missingEntities.join(', ')}</p>
          )}

          <table className="customer-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Detected as</th>
                <th>Rows</th>
                <th>Columns</th>
                <th>Issues</th>
              </tr>
            </thead>
            <tbody>
              {inventory.files.map(file => (
                <tr key={file.fileName}>
                  <td>{file.fileName}</td>
                  <td>{file.entity ? file.entityLabel : <span className="missing">Unrecognized</span>}</td>
                  <td>{file.rowCount}</td>
                  <td className="column-list" title={file.headers.join(', ')}>
                    {file.headers.length} — {file.headers.join(', ')}
                  </td>
                  <td><IssueList issues={file.issues} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

function ProfileSummary({ profile, customer }) {
  const { columnStyle, dateFormat, region } = profile;
  const regionMismatch = region && customer.region && region.region !== customer.region;

  return (
    <div className="profile-summary">
      <strong>Detected data profile</strong>
      <ul>
        <li>Column style: {columnStyle || 'Unknown'}</li>
        <li>
          Date format: {dateFormat ? dateFormat.format : 'No dates found'}
          {dateFormat && !dateFormat.certain && <span className="muted"> (assumed: no day above 12 found)</span>}
        </li>
        <li>
          Region: {region ? `${region.region} — ${region.signals.join(', ')}` : 'No country signals found'}
          {regionMismatch && (
            <span className="warning"> ⚠️ Customer region is set to {customer.region}</span>
          )}
        </li>
      </ul>
    </div>
  );
}

function IssueList({ issues }) {
  if (issues.length === 0) return <span className="badge badge-complete">✓ OK</span>;

  return (
    <div>
      <span className="badge badge-pending">{issues.length} issue{issues.length > 1 ? 's' : ''}</span>
      <ul className="issue-list">
        {issues.slice(0, MAX_ISSUES_SHOWN).map((issue, i) => (
          <li key={i}>{issue.line ? `Line ${issue.line}: ` : ''}{issue.message}</li>
        ))}
        {issues.length > MAX_ISSUES_SHOWN && <li>…and {issues.length - MAX_ISSUES_SHOWN} more</li>}
      </ul>
    </div>
  );
}

export default DataFilesPanel;
