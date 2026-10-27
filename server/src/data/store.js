/**
 * In-Memory Data Store
 * Simple storage for the training exercise - no database needed
 */

const { createCustomer, createTenant, createDefaultOnboardingSteps, calculateProgress } = require('../models');

// In-memory storage
const store = {
  customers: [],
  tenants: [],
  onboardingStates: [],
  dataFiles: {} // customerId -> DataFile[]
};

// Seed with example data
function seedData() {
  // Example customer - Acme Corporation
  const exampleCustomer = createCustomer({
    id: 'cust_001',
    name: 'Acme Corporation',
    industry: 'Manufacturing',
    region: 'North America',
    contactEmail: 'onboarding@acme.example.com',
    createdAt: '2025-01-15T10:00:00Z'
  });

  // Example tenant for Acme
  const exampleTenant = createTenant({
    id: 'tenant_001',
    customerId: 'cust_001',
    status: 'pending',
    plan: 'professional',
    createdAt: '2025-01-15T10:00:00Z'
  });

  // Example onboarding state - just started, nothing completed
  const exampleOnboardingState = {
    customerId: 'cust_001',
    steps: createDefaultOnboardingSteps(),
    progressPercent: 0
  };

  store.customers.push(exampleCustomer);
  store.tenants.push(exampleTenant);
  store.onboardingStates.push(exampleOnboardingState);

  // Customers from sample-data/ waiting in the queue. Their files don't
  // include a contact email for the firm itself, so CS still has to collect it.
  const sampleCustomers = [
    { id: 'cust_002', name: 'ABC Accounting', region: 'North America', createdAt: '2025-02-03T09:00:00Z' },
    { id: 'cust_003', name: 'XYZ Financial Services', region: 'North America', createdAt: '2025-02-10T09:00:00Z' },
    { id: 'cust_004', name: 'Premier Bookkeeping', region: 'EMEA', createdAt: '2025-02-17T09:00:00Z' }
  ];
  sampleCustomers.forEach(data => {
    store.customers.push(createCustomer({ ...data, industry: 'Accounting' }));
    store.onboardingStates.push({
      customerId: data.id,
      steps: createDefaultOnboardingSteps(),
      progressPercent: 0
    });
  });
}

// Initialize with seed data
seedData();

// Store access functions
function getCustomers() {
  return [...store.customers];
}

function getCustomerById(id) {
  return store.customers.find(c => c.id === id);
}

function addCustomer(customer) {
  store.customers.push(customer);
  return customer;
}

function updateCustomer(id, updates) {
  const index = store.customers.findIndex(c => c.id === id);
  if (index !== -1) {
    store.customers[index] = { ...store.customers[index], ...updates, id };
    return store.customers[index];
  }
  return null;
}

function getTenants() {
  return [...store.tenants];
}

function getTenantByCustomerId(customerId) {
  return store.tenants.find(t => t.customerId === customerId);
}

function addTenant(tenant) {
  store.tenants.push(tenant);
  return tenant;
}

function getOnboardingState(customerId) {
  return store.onboardingStates.find(s => s.customerId === customerId);
}

function getAllOnboardingStates() {
  return [...store.onboardingStates];
}

function addOnboardingState(state) {
  store.onboardingStates.push(state);
  return state;
}

function updateOnboardingState(customerId, updates) {
  const index = store.onboardingStates.findIndex(s => s.customerId === customerId);
  if (index !== -1) {
    store.onboardingStates[index] = { ...store.onboardingStates[index], ...updates };
    return store.onboardingStates[index];
  }
  return null;
}

function setOnboardingStepStatus(customerId, stepId, status) {
  const state = getOnboardingState(customerId);
  if (!state) return null;
  const steps = state.steps.map(s => (s.id === stepId ? { ...s, status } : s));
  return updateOnboardingState(customerId, { steps, progressPercent: calculateProgress(steps) });
}

function getDataFiles(customerId) {
  return [...(store.dataFiles[customerId] || [])];
}

// Adds files for a customer; a re-uploaded file replaces the one with the same name
function saveDataFiles(customerId, files) {
  const names = new Set(files.map(f => f.fileName));
  store.dataFiles[customerId] = [
    ...getDataFiles(customerId).filter(f => !names.has(f.fileName)),
    ...files
  ];
  return getDataFiles(customerId);
}

module.exports = {
  getCustomers,
  getCustomerById,
  addCustomer,
  updateCustomer,
  getTenants,
  getTenantByCustomerId,
  addTenant,
  getOnboardingState,
  getAllOnboardingStates,
  addOnboardingState,
  updateOnboardingState,
  setOnboardingStepStatus,
  getDataFiles,
  saveDataFiles
};
