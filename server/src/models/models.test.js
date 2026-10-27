const { describe, it } = require('node:test');
const assert = require('node:assert');
const { 
  createCustomer, 
  createTenant, 
  createDefaultOnboardingSteps, 
  calculateProgress,
  normalizeCustomerInfo,
  validateCustomerInfo
} = require('./index');

describe('Domain Models', () => {
  describe('createCustomer', () => {
    it('should create a customer with provided data', () => {
      const customer = createCustomer({
        id: 'test_123',
        name: 'Test Corp',
        industry: 'Tech',
        region: 'EMEA'
      });

      assert.strictEqual(customer.id, 'test_123');
      assert.strictEqual(customer.name, 'Test Corp');
      assert.strictEqual(customer.industry, 'Tech');
      assert.strictEqual(customer.region, 'EMEA');
    });

    it('should generate default values for missing fields', () => {
      const customer = createCustomer({});

      assert.ok(customer.id.startsWith('cust_'));
      assert.strictEqual(customer.name, '');
      assert.ok(customer.createdAt);
    });
  });

  describe('calculateProgress', () => {
    it('should return 0 for empty steps', () => {
      assert.strictEqual(calculateProgress([]), 0);
      assert.strictEqual(calculateProgress(null), 0);
    });

    it('should calculate correct percentage', () => {
      const steps = [
        { status: 'completed' },
        { status: 'completed' },
        { status: 'pending' },
        { status: 'pending' }
      ];
      assert.strictEqual(calculateProgress(steps), 50);
    });

    it('should return 100 when all steps completed', () => {
      const steps = [
        { status: 'completed' },
        { status: 'completed' }
      ];
      assert.strictEqual(calculateProgress(steps), 100);
    });
  });

  describe('createDefaultOnboardingSteps', () => {
    it('should create 4 default steps', () => {
      const steps = createDefaultOnboardingSteps();
      
      assert.strictEqual(steps.length, 4);
      assert.strictEqual(steps[0].name, 'Customer Info');
      assert.strictEqual(steps[3].name, 'Import');
    });

    it('should set all steps to pending status', () => {
      const steps = createDefaultOnboardingSteps();
      
      steps.forEach(step => {
        assert.strictEqual(step.status, 'pending');
      });
    });
  });
});

describe('Customer Info', () => {
  const validInfo = {
    name: 'ABC Accounting',
    industry: 'Accounting',
    region: 'North America',
    contactEmail: 'ops@abc-accounting.example.com'
  };

  describe('normalizeCustomerInfo', () => {
    it('should trim text, lowercase email and match region case-insensitively', () => {
      const info = normalizeCustomerInfo({
        name: '  ABC Accounting ',
        industry: ' Accounting',
        region: 'emea',
        contactEmail: ' Ops@ABC.example.com '
      });

      assert.deepStrictEqual(info, {
        name: 'ABC Accounting',
        industry: 'Accounting',
        region: 'EMEA',
        contactEmail: 'ops@abc.example.com'
      });
    });

    it('should treat missing or non-string values as empty', () => {
      const info = normalizeCustomerInfo({ name: 42 });

      assert.strictEqual(info.name, '');
      assert.strictEqual(info.contactEmail, '');
    });
  });

  describe('validateCustomerInfo', () => {
    it('should return no errors for complete info', () => {
      assert.deepStrictEqual(validateCustomerInfo(validInfo), {});
    });

    it('should flag every missing field', () => {
      const errors = validateCustomerInfo(normalizeCustomerInfo({}));

      assert.deepStrictEqual(Object.keys(errors).sort(), ['contactEmail', 'industry', 'name', 'region']);
    });

    it('should reject an invalid email and unknown region', () => {
      const errors = validateCustomerInfo({ ...validInfo, contactEmail: 'not-an-email', region: 'Mars' });

      assert.ok(errors.contactEmail);
      assert.ok(errors.region);
      assert.strictEqual(errors.name, undefined);
    });
  });
});
