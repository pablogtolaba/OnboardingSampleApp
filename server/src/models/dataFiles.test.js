const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const {
  parseCsv,
  detectEntity,
  summarizeDataFile,
  detectColumnStyle,
  detectDateFormat,
  detectRegion,
  describeDataFiles
} = require('./dataFiles');

const SAMPLE_DATA = path.join(__dirname, '../../../sample-data');

function loadSampleCustomer(folder) {
  const dir = path.join(SAMPLE_DATA, folder);
  return fs.readdirSync(dir)
    .filter(name => name.endsWith('.csv'))
    .map(name => summarizeDataFile(name, fs.readFileSync(path.join(dir, name), 'utf8')));
}

describe('Data Files', () => {
  describe('parseCsv', () => {
    it('should parse headers and rows with CRLF line endings', () => {
      const { headers, rows } = parseCsv('a,b\r\n1,2\r\n3,4\r\n');

      assert.deepStrictEqual(headers, ['a', 'b']);
      assert.deepStrictEqual(rows, [['1', '2'], ['3', '4']]);
    });

    it('should handle quoted fields with commas and escaped quotes', () => {
      const { rows } = parseCsv('name,note\n"Williams, Robert","say ""hi"""\n');

      assert.deepStrictEqual(rows, [['Williams, Robert', 'say "hi"']]);
    });

    it('should skip blank lines and strip a BOM', () => {
      const { headers, rows } = parseCsv('﻿a\n\n1\n\n');

      assert.deepStrictEqual(headers, ['a']);
      assert.deepStrictEqual(rows, [['1']]);
    });
  });

  describe('detectEntity', () => {
    it('should recognize entities from file names', () => {
      assert.strictEqual(detectEntity('clients.csv'), 'clients');
      assert.strictEqual(detectEntity('client_contacts.csv'), 'contacts');
      assert.strictEqual(detectEntity('chart_of_accounts.csv'), 'chartOfAccounts');
      assert.strictEqual(detectEntity('Transactions 2024.csv'), 'transactions');
      assert.strictEqual(detectEntity('notes.csv'), null);
    });
  });

  describe('summarizeDataFile', () => {
    it('should flag rows whose column count differs from the header', () => {
      const file = summarizeDataFile('clients.csv', 'id,contact\n1,"Smith, Jo"\n2,Williams, Robert\n');

      assert.strictEqual(file.rowCount, 2);
      assert.strictEqual(file.issues.length, 1);
      assert.strictEqual(file.issues[0].line, 3);
    });

    it('should flag an empty file', () => {
      assert.strictEqual(summarizeDataFile('clients.csv', '').issues[0].message, 'File is empty');
    });
  });

  describe('detection helpers', () => {
    it('should detect column styles', () => {
      assert.strictEqual(detectColumnStyle(['Client ID', 'Client Name']), 'Title Case');
      assert.strictEqual(detectColumnStyle(['clientCode', 'companyName', 'email']), 'camelCase');
      assert.strictEqual(detectColumnStyle(['customer_id', 'business_name']), 'snake_case');
    });

    it('should resolve day/month order from unambiguous dates', () => {
      assert.deepStrictEqual(detectDateFormat(['01/05/2024', '01/15/2024']), { format: 'MM/DD/YYYY', certain: true });
      assert.deepStrictEqual(detectDateFormat(['15-03-2023']), { format: 'DD-MM-YYYY', certain: true });
      assert.deepStrictEqual(detectDateFormat(['2024-01-15']), { format: 'YYYY-MM-DD', certain: true });
      assert.deepStrictEqual(detectDateFormat(['01/05/2024']), { format: 'MM/DD/YYYY', certain: false });
      assert.strictEqual(detectDateFormat(['hello']), null);
    });

    it('should suggest a region from country-specific values', () => {
      assert.strictEqual(detectRegion(['+44 7700 100001', 'GB123456789']).region, 'EMEA');
      assert.strictEqual(detectRegion(['(555) 123-4567', '12-3456789']).region, 'North America');
      assert.strictEqual(detectRegion(['nothing here']), null);
    });
  });

  describe('sample-data customers', () => {
    const expected = {
      CustomerA_ABCAccounting: { columnStyle: 'Title Case', dateFormat: 'MM/DD/YYYY', region: 'North America' },
      CustomerB_XYZFinancialServices: { columnStyle: 'camelCase', dateFormat: 'YYYY-MM-DD', region: 'North America' },
      CustomerC_PremierBookkeeping: { columnStyle: 'snake_case', dateFormat: 'DD-MM-YYYY', region: 'EMEA' }
    };

    Object.entries(expected).forEach(([folder, profile]) => {
      it(`should inventory and profile ${folder}`, () => {
        const result = describeDataFiles(loadSampleCustomer(folder));

        assert.strictEqual(result.files.length, 4);
        assert.deepStrictEqual(result.missingEntities, []);
        assert.strictEqual(result.profile.columnStyle, profile.columnStyle);
        assert.strictEqual(result.profile.dateFormat.format, profile.dateFormat);
        assert.strictEqual(result.profile.region.region, profile.region);
        assert.ok(result.files.every(f => !('rows' in f)), 'row data should not be returned');
      });
    });

    it('should flag the unquoted contact names in XYZ clients', () => {
      const clients = loadSampleCustomer('CustomerB_XYZFinancialServices').find(f => f.entity === 'clients');

      assert.strictEqual(clients.issues.length, clients.rowCount);
    });
  });
});
