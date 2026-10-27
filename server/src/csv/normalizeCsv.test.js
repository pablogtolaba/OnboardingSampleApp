const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeCsv } = require('./normalizeCsv');

const SAMPLE_DATA = path.join(__dirname, '..', '..', '..', 'sample-data');
const readSample = (...parts) => fs.readFileSync(path.join(SAMPLE_DATA, ...parts), 'utf8');

describe('normalizeCsv', () => {
  describe('well-formed input', () => {
    it('parses headers and rows into objects with no issues', () => {
      const result = normalizeCsv('id,name\n1,Acme\n2,Globex\n');

      assert.deepStrictEqual(result.headers, ['id', 'name']);
      assert.deepStrictEqual(result.rows, [
        { id: '1', name: 'Acme' },
        { id: '2', name: 'Globex' }
      ]);
      assert.deepStrictEqual(result.issues, []);
    });

    it('handles quoted fields containing commas, escaped quotes and newlines', () => {
      const result = normalizeCsv('id,note\n1,"a, b"\n2,"say ""hi"""\n3,"line1\nline2"\n');

      assert.deepStrictEqual(result.rows.map(r => r.note), ['a, b', 'say "hi"', 'line1\nline2']);
      assert.deepStrictEqual(result.issues, []);
    });
  });

  describe('cosmetic problems (fixed silently)', () => {
    it('strips a UTF-8 BOM from the first header', () => {
      const result = normalizeCsv('﻿id,name\n1,Acme\n');
      assert.deepStrictEqual(result.headers, ['id', 'name']);
    });

    it('accepts CRLF, CR and a missing trailing newline', () => {
      assert.strictEqual(normalizeCsv('id,name\r\n1,A\r\n2,B').rows.length, 2);
      assert.strictEqual(normalizeCsv('id,name\r1,A\r2,B\r').rows.length, 2);
    });

    it('skips blank lines', () => {
      const result = normalizeCsv('id,name\n\n1,A\n\n\n2,B\n');
      assert.strictEqual(result.rows.length, 2);
      assert.deepStrictEqual(result.issues, []);
    });

    it('trims whitespace around unquoted values and headers', () => {
      const result = normalizeCsv(' id , name \n 1 ,  Acme Corp \n');
      assert.deepStrictEqual(result.headers, ['id', 'name']);
      assert.deepStrictEqual(result.rows[0], { id: '1', name: 'Acme Corp' });
    });

    it('preserves whitespace inside quoted values', () => {
      const result = normalizeCsv('id,name\n1,"  padded  "\n');
      assert.strictEqual(result.rows[0].name, '  padded  ');
    });
  });

  describe('rows with unquoted commas (too many fields)', () => {
    const csv = [
      'id,status,description,parent',
      '1,Active,Main cash,',
      '2,Inactive,Petty cash,1',
      '3,Active,Another account,1',
      '4,Inactive,Savings,2',
      '5,Active,"Electric, gas, water",1',
      '6,Active,Electric, gas, water,1'
    ].join('\n');

    it('rejoins the split value in the column it belongs to', () => {
      const { rows } = normalizeCsv(csv);
      assert.deepStrictEqual(rows[5], {
        id: '6', status: 'Active', description: 'Electric, gas, water', parent: '1'
      });
    });

    it('reports each repaired row with its line number and column', () => {
      const { issues } = normalizeCsv(csv);
      assert.strictEqual(issues.length, 1);
      assert.strictEqual(issues[0].type, 'extra-fields-merged');
      assert.strictEqual(issues[0].line, 7);
      assert.strictEqual(issues[0].column, 'description');
    });

    it('repairs a split value in the last column', () => {
      const text = [
        'id,status,contact',
        '1,A,Alice',
        '2,I,Bob',
        '3,A,Carol',
        '4,I,Dan',
        '5,A,Williams, Robert'
      ].join('\n');
      const { rows, issues } = normalizeCsv(text);

      assert.deepStrictEqual(rows[4], { id: '5', status: 'A', contact: 'Williams, Robert' });
      assert.strictEqual(issues[0].column, 'contact');
    });

    it('does not guess when it cannot infer where the commas belong', () => {
      const { rows, issues } = normalizeCsv('a,b\n1,2,3\n');

      assert.strictEqual(rows.length, 0);
      assert.strictEqual(issues[0].type, 'row-unresolved');
      assert.strictEqual(issues[0].line, 2);
    });
  });

  describe('rows with too few fields', () => {
    it('pads missing trailing fields with empty strings and reports it', () => {
      const { rows, issues } = normalizeCsv('id,name,city\n1,Acme\n');

      assert.deepStrictEqual(rows[0], { id: '1', name: 'Acme', city: '' });
      assert.strictEqual(issues[0].type, 'missing-fields-padded');
      assert.strictEqual(issues[0].line, 2);
    });
  });

  describe('structural problems', () => {
    it('reports an unterminated quote and drops that record', () => {
      const { rows, issues } = normalizeCsv('id,name\n1,"oops\n2,B\n');

      assert.strictEqual(rows.length, 0);
      assert.strictEqual(issues[0].type, 'unterminated-quote');
      assert.strictEqual(issues[0].line, 2);
    });

    it('reports duplicate and empty headers', () => {
      const { issues } = normalizeCsv('id,id,\n1,2,3\n');
      const types = issues.map(i => i.type);

      assert.ok(types.includes('duplicate-header'));
      assert.ok(types.includes('empty-header'));
    });

    it('returns an empty result for empty input', () => {
      assert.deepStrictEqual(normalizeCsv(''), { headers: [], rows: [], issues: [] });
      assert.deepStrictEqual(normalizeCsv('﻿\n\n'), { headers: [], rows: [], issues: [] });
    });
  });

  describe('sample data', () => {
    const folders = fs.readdirSync(SAMPLE_DATA, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const folder of folders) {
      for (const file of ['clients', 'contacts', 'chart_of_accounts', 'transactions']) {
        it(`${folder}/${file}.csv: every row has exactly the header columns and none is dropped`, () => {
          const text = readSample(folder, `${file}.csv`);
          const { headers, rows, issues } = normalizeCsv(text);
          const expectedRows = text.split(/\r?\n/).filter(l => l.trim()).length - 1;

          assert.strictEqual(rows.length, expectedRows);
          for (const row of rows) {
            assert.deepStrictEqual(Object.keys(row), headers);
          }
          assert.ok(issues.every(i => i.type === 'extra-fields-merged'), JSON.stringify(issues));
        });
      }
    }

    it('Customer A chart of accounts: "Electric, gas, water" stays in the description', () => {
      const { rows } = normalizeCsv(readSample('CustomerA_ABCAccounting', 'chart_of_accounts.csv'));
      const utilities = rows.find(r => r['Account Number'] === '6300');

      assert.strictEqual(utilities.Description, 'Electric, gas, water');
      assert.strictEqual(utilities['Parent Account'], '6000');
    });

    it('Customer B clients: "Williams, Robert" stays in the main contact', () => {
      const { rows } = normalizeCsv(readSample('CustomerB_XYZFinancialServices', 'clients.csv'));

      assert.strictEqual(rows[0].mainContact, 'Williams, Robert');
      assert.strictEqual(rows[0].clientCode, 'XYZ-001');
    });
  });
});
