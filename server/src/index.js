const express = require('express');
const cors = require('cors');
const store = require('./data/store');
const {
  createCustomer,
  createDefaultOnboardingSteps,
  normalizeCustomerInfo,
  validateCustomerInfo,
  REGIONS
} = require('./models');
const { summarizeDataFile, describeDataFiles } = require('./models/dataFiles');

const CUSTOMER_INFO_STEP_ID = 'step_1';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // uploaded CSVs arrive as JSON

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get all customers
app.get('/api/customers', (req, res) => {
  res.json(store.getCustomers());
});

// Regions a customer can be assigned to
app.get('/api/regions', (req, res) => {
  res.json(REGIONS);
});

// Create a customer and add them to the onboarding queue
app.post('/api/customers', (req, res) => {
  const info = normalizeCustomerInfo(req.body);
  const errors = validateCustomerInfo(info);
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: 'Invalid customer info', errors });
  }

  const customer = store.addCustomer(createCustomer(info));
  store.addOnboardingState({
    customerId: customer.id,
    steps: createDefaultOnboardingSteps(),
    progressPercent: 0
  });
  store.setOnboardingStepStatus(customer.id, CUSTOMER_INFO_STEP_ID, 'completed');
  res.status(201).json(customer);
});

// Get customer by ID
app.get('/api/customers/:id', (req, res) => {
  const customer = store.getCustomerById(req.params.id);
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }
  res.json(customer);
});

// Update customer info; valid info completes the Customer Info step
app.put('/api/customers/:id', (req, res) => {
  if (!store.getCustomerById(req.params.id)) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  const info = normalizeCustomerInfo(req.body);
  const errors = validateCustomerInfo(info);
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: 'Invalid customer info', errors });
  }

  const customer = store.updateCustomer(req.params.id, info);
  store.setOnboardingStepStatus(customer.id, CUSTOMER_INFO_STEP_ID, 'completed');
  res.json(customer);
});

// Get the customer's attached data files, missing files and detected profile
app.get('/api/customers/:id/data-files', (req, res) => {
  if (!store.getCustomerById(req.params.id)) {
    return res.status(404).json({ error: 'Customer not found' });
  }
  res.json(describeDataFiles(store.getDataFiles(req.params.id)));
});

// Attach CSV data files: body is { files: [{ name, content }] }
app.post('/api/customers/:id/data-files', (req, res) => {
  if (!store.getCustomerById(req.params.id)) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  const files = req.body?.files;
  const isValid = Array.isArray(files) && files.length > 0 &&
    files.every(f => typeof f?.name === 'string' && typeof f?.content === 'string');
  if (!isValid) {
    return res.status(400).json({ error: 'Expected files: [{ name, content }]' });
  }

  const saved = store.saveDataFiles(
    req.params.id,
    files.map(f => summarizeDataFile(f.name, f.content))
  );
  res.status(201).json(describeDataFiles(saved));
});

// Get onboarding state for a customer
app.get('/api/customers/:id/onboarding', (req, res) => {
  const state = store.getOnboardingState(req.params.id);
  if (!state) {
    return res.status(404).json({ error: 'Onboarding state not found' });
  }
  res.json(state);
});

// Get all onboarding states (dashboard view)
app.get('/api/onboarding', (req, res) => {
  const states = store.getAllOnboardingStates();
  const customers = store.getCustomers();
  
  // Join customer info with onboarding state
  const dashboard = states.map(state => {
    const customer = customers.find(c => c.id === state.customerId);
    return {
      ...state,
      customerName: customer?.name || 'Unknown',
      customerIndustry: customer?.industry || '',
      customerRegion: customer?.region || ''
    };
  });
  
  res.json(dashboard);
});

// Get tenant by customer ID
app.get('/api/tenants/:customerId', (req, res) => {
  const tenant = store.getTenantByCustomerId(req.params.customerId);
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }
  res.json(tenant);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Onboarding API server running at http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
});
