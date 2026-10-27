import React, { useState, useEffect, useCallback } from 'react';
import DataFilesPanel from './DataFilesPanel';

const CUSTOMER_INFO_STEP_ID = 'step_1';

const EMPTY_FORM = { name: '', industry: '', region: '', contactEmail: '' };

const FIELDS = [
  { key: 'name', label: 'Company name' },
  { key: 'industry', label: 'Industry' },
  { key: 'region', label: 'Region' },
  { key: 'contactEmail', label: 'Contact email', type: 'email' }
];

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function CustomerInfoTab({ onboardingData, onSaved }) {
  const [customers, setCustomers] = useState([]);
  const [regions, setRegions] = useState([]);
  const [loadError, setLoadError] = useState(null);
  // null = no form open, 'new' = creating, otherwise the customer id being edited
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [dataFilesId, setDataFilesId] = useState(null);

  const loadCustomers = useCallback(() => {
    return Promise.all([fetchJson('/api/customers'), fetchJson('/api/regions')])
      .then(([customerList, regionList]) => {
        setCustomers(customerList);
        setRegions(regionList);
        setLoadError(null);
      })
      .catch(err => {
        console.error('Failed to fetch customers:', err);
        setLoadError(err.message);
      });
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  function stepStatus(customerId) {
    const state = onboardingData.find(s => s.customerId === customerId);
    return state?.steps.find(s => s.id === CUSTOMER_INFO_STEP_ID)?.status || 'pending';
  }

  function openForm(customer) {
    setDataFilesId(null);
    setEditingId(customer ? customer.id : 'new');
    setForm(customer
      ? { name: customer.name, industry: customer.industry, region: customer.region, contactEmail: customer.contactEmail }
      : EMPTY_FORM);
    setErrors({});
    setMessage(null);
  }

  function closeForm() {
    setEditingId(null);
    setErrors({});
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const isNew = editingId === 'new';
      const res = await fetch(isNew ? '/api/customers' : `/api/customers/${editingId}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const body = await res.json();
      if (!res.ok) {
        setErrors(body.errors || { form: body.error || `HTTP ${res.status}` });
        return;
      }
      setMessage(`✓ Customer info saved for ${body.name}`);
      closeForm();
      await Promise.all([loadCustomers(), onSaved()]);
    } catch (err) {
      setErrors({ form: err.message });
    } finally {
      setSaving(false);
    }
  }

  function openDataFiles(customer) {
    closeForm();
    setMessage(null);
    setDataFilesId(customer.id);
  }

  const dataFilesCustomer = customers.find(c => c.id === dataFilesId);

  if (loadError) {
    return (
      <div className="placeholder">
        <p style={{ color: '#dc2626' }}>⚠️ Failed to load customers</p>
        <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>{loadError}</p>
      </div>
    );
  }

  return (
    <div className="customer-info">
      <div className="section-header">
        <div>
          <h2>Customer Info</h2>
          <p style={{ color: '#6b7280' }}>Collect and validate customer information</p>
        </div>
        <button className="btn btn-primary" onClick={() => openForm(null)}>+ New customer</button>
      </div>

      {message && <p className="success-message">{message}</p>}

      {editingId && (
        <form className="customer-form" onSubmit={handleSubmit} noValidate>
          <h3>{editingId === 'new' ? 'New customer' : `Edit ${customers.find(c => c.id === editingId)?.name}`}</h3>
          {FIELDS.map(field => (
            <label key={field.key} className="form-field">
              <span>{field.label}</span>
              {field.key === 'region' ? (
                <select
                  value={form.region}
                  onChange={e => setForm({ ...form, region: e.target.value })}
                >
                  <option value="">Select a region…</option>
                  {regions.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              ) : (
                <input
                  type={field.type || 'text'}
                  value={form[field.key]}
                  onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                />
              )}
              {errors[field.key] && <span className="field-error">{errors[field.key]}</span>}
            </label>
          ))}
          {errors.form && <p className="field-error">{errors.form}</p>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save customer info'}
            </button>
            <button type="button" className="btn" onClick={closeForm}>Cancel</button>
          </div>
        </form>
      )}

      {dataFilesCustomer && (
        <DataFilesPanel
          key={dataFilesCustomer.id}
          customer={dataFilesCustomer}
          onClose={() => setDataFilesId(null)}
        />
      )}

      <table className="customer-table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Industry</th>
            <th>Region</th>
            <th>Contact email</th>
            <th>Customer Info</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {customers.map(customer => {
            const complete = stepStatus(customer.id) === 'completed';
            return (
              <tr key={customer.id}>
                <td>{customer.name}</td>
                <td>{customer.industry}</td>
                <td>{customer.region}</td>
                <td>{customer.contactEmail || <span className="missing">Missing</span>}</td>
                <td>
                  <span className={`badge ${complete ? 'badge-complete' : 'badge-pending'}`}>
                    {complete ? '✓ Complete' : 'Needs review'}
                  </span>
                </td>
                <td className="row-actions">
                  <button className="btn" aria-label={`Edit ${customer.name}`} onClick={() => openForm(customer)}>Edit</button>
                  <button className="btn" aria-label={`Data files for ${customer.name}`} onClick={() => openDataFiles(customer)}>Data files</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default CustomerInfoTab;
