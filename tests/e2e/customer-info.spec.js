// @ts-check
const { test, expect } = require('@playwright/test');

// Tests share the in-memory server, so each one works on a different customer.

async function openCustomerInfo(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Customer Info' }).click();
}

function customerRow(page, name) {
  return page.locator('.customer-table tbody tr', { hasText: name });
}

test.describe('Customer Info', () => {
  test('should list sample-data customers and flag missing contact email', async ({ page }) => {
    await openCustomerInfo(page);

    const row = customerRow(page, 'Premier Bookkeeping');
    await expect(row).toContainText('EMEA');
    await expect(row).toContainText('Missing');
    await expect(row).toContainText('Needs review');
  });

  test('should reject an invalid contact email', async ({ page }) => {
    await openCustomerInfo(page);

    await page.getByRole('button', { name: 'Edit XYZ Financial Services' }).click();
    await page.getByLabel('Contact email').fill('not-an-email');
    await page.getByRole('button', { name: 'Save customer info' }).click();

    await expect(page.locator('.field-error')).toContainText('A valid contact email is required');
    await expect(customerRow(page, 'XYZ Financial Services')).toContainText('Needs review');
  });

  test('should complete Customer Info step when info is saved', async ({ page }) => {
    await openCustomerInfo(page);

    await page.getByRole('button', { name: 'Edit ABC Accounting' }).click();
    await page.getByLabel('Contact email').fill('Onboarding@ABC-Accounting.example.com');
    await page.getByRole('button', { name: 'Save customer info' }).click();

    await expect(page.locator('.success-message')).toContainText('ABC Accounting');
    const row = customerRow(page, 'ABC Accounting');
    await expect(row).toContainText('onboarding@abc-accounting.example.com');
    await expect(row).toContainText('✓ Complete');

    await page.getByRole('button', { name: 'Dashboard' }).click();
    const card = page.locator('.customer-card', { hasText: 'ABC Accounting' });
    await expect(card.locator('.progress-bar')).toContainText('25%');
  });

  test('should add a new customer to the onboarding queue', async ({ page }) => {
    const name = `Ledger Pros ${Date.now()}`;
    await openCustomerInfo(page);

    await page.getByRole('button', { name: '+ New customer' }).click();
    await page.getByLabel('Company name').fill(name);
    await page.getByLabel('Industry').fill('Accounting');
    await page.getByLabel('Region').selectOption('APAC');
    await page.getByLabel('Contact email').fill('hello@ledgerpros.example.com');
    await page.getByRole('button', { name: 'Save customer info' }).click();

    await expect(customerRow(page, name)).toContainText('✓ Complete');

    await page.getByRole('button', { name: 'Dashboard' }).click();
    await expect(page.locator('.customer-card h3', { hasText: name })).toBeVisible();
  });
});
