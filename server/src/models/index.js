/**
 * Domain Models for Customer Onboarding
 */

/**
 * @typedef {Object} Customer
 * @property {string} id - Unique customer identifier
 * @property {string} name - Customer/company name
 * @property {string} industry - Industry vertical
 * @property {string} region - Geographic region
 * @property {string} contactEmail - Primary contact email
 * @property {string} createdAt - ISO timestamp
 */

/**
 * @typedef {Object} Tenant
 * @property {string} id - Unique tenant identifier
 * @property {string} customerId - Associated customer ID
 * @property {string} status - 'pending' | 'provisioning' | 'active' | 'failed'
 * @property {string} plan - 'starter' | 'professional' | 'enterprise'
 * @property {string} createdAt - ISO timestamp
 */

/**
 * @typedef {Object} OnboardingStep
 * @property {string} id - Step identifier
 * @property {string} name - Human-readable step name
 * @property {string} status - 'pending' | 'in_progress' | 'completed' | 'failed'
 * @property {number} order - Step sequence number
 */

/**
 * @typedef {Object} OnboardingState
 * @property {string} customerId - Associated customer ID
 * @property {OnboardingStep[]} steps - Array of onboarding steps
 * @property {number} progressPercent - Overall progress (0-100)
 */

/**
 * Creates a new Customer object
 * @param {Partial<Customer>} data 
 * @returns {Customer}
 */
function createCustomer(data) {
  return {
    id: data.id || `cust_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: data.name || '',
    industry: data.industry || '',
    region: data.region || '',
    contactEmail: data.contactEmail || '',
    createdAt: data.createdAt || new Date().toISOString()
  };
}

/**
 * Creates a new Tenant object
 * @param {Partial<Tenant>} data 
 * @returns {Tenant}
 */
function createTenant(data) {
  return {
    id: data.id || `tenant_${Date.now()}`,
    customerId: data.customerId || '',
    status: data.status || 'pending',
    plan: data.plan || 'starter',
    createdAt: data.createdAt || new Date().toISOString()
  };
}

const REGIONS = ['North America', 'EMEA', 'APAC', 'LATAM'];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Normalizes raw customer input: trims text, lowercases email,
 * and matches region case-insensitively against the known regions
 * @param {Object} data
 * @returns {Pick<Customer, 'name' | 'industry' | 'region' | 'contactEmail'>}
 */
function normalizeCustomerInfo(data = {}) {
  const region = asTrimmedString(data.region);
  return {
    name: asTrimmedString(data.name),
    industry: asTrimmedString(data.industry),
    region: REGIONS.find(r => r.toLowerCase() === region.toLowerCase()) || region,
    contactEmail: asTrimmedString(data.contactEmail).toLowerCase()
  };
}

/**
 * Validates normalized customer info
 * @param {Partial<Customer>} info
 * @returns {Object<string, string>} Field name -> error message (empty when valid)
 */
function validateCustomerInfo(info) {
  const errors = {};
  if (!info.name) errors.name = 'Name is required';
  if (!info.industry) errors.industry = 'Industry is required';
  if (!REGIONS.includes(info.region)) errors.region = `Region must be one of: ${REGIONS.join(', ')}`;
  if (!EMAIL_PATTERN.test(info.contactEmail || '')) errors.contactEmail = 'A valid contact email is required';
  return errors;
}

/**
 * Creates default onboarding steps
 * @returns {OnboardingStep[]}
 */
function createDefaultOnboardingSteps() {
  return [
    { id: 'step_1', name: 'Customer Info', status: 'pending', order: 1 },
    { id: 'step_2', name: 'Data Mapping', status: 'pending', order: 2 },
    { id: 'step_3', name: 'Tenant Setup', status: 'pending', order: 3 },
    { id: 'step_4', name: 'Import', status: 'pending', order: 4 }
  ];
}

/**
 * Calculates progress percentage from steps
 * @param {OnboardingStep[]} steps 
 * @returns {number}
 */
function calculateProgress(steps) {
  if (!steps || steps.length === 0) return 0;
  const completed = steps.filter(s => s.status === 'completed').length;
  return Math.round((completed / steps.length) * 100);
}

module.exports = {
  createCustomer,
  createTenant,
  createDefaultOnboardingSteps,
  calculateProgress,
  normalizeCustomerInfo,
  validateCustomerInfo,
  REGIONS
};
