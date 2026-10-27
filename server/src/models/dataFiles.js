/**
 * Customer data files (CSV exports) attached during onboarding:
 * parsing, inventory and profile detection
 */

/**
 * @typedef {Object} DataFile
 * @property {string} fileName - Original file name
 * @property {string|null} entity - Detected entity id, null when unrecognized
 * @property {string[]} headers - Column headers
 * @property {string[][]} rows - Data rows (raw values)
 * @property {number} rowCount - Number of data rows
 * @property {{line: number|null, message: string}[]} issues - Problems found in the file
 */

// Order matters: more specific names are checked first ("client_contacts" is contacts)
const ENTITIES = [
  { id: 'contacts', label: 'Contacts', pattern: /contact/i },
  { id: 'transactions', label: 'Transactions', pattern: /transaction|txn|ledger|journal/i },
  { id: 'chartOfAccounts', label: 'Chart of Accounts', pattern: /chart|accounts|coa|nominal/i },
  { id: 'clients', label: 'Clients', pattern: /client|customer/i }
];

const REGION_SIGNALS = [
  { region: 'EMEA', label: 'UK phone numbers (+44)', pattern: /^\+44[\d ]+$/ },
  { region: 'EMEA', label: 'UK tax references (GB…)', pattern: /^GB\d{9}$/ },
  { region: 'EMEA', label: '.co.uk email addresses', pattern: /@[^\s@]+\.co\.uk$/i },
  { region: 'North America', label: 'US tax IDs (EIN)', pattern: /^\d{2}-\d{7}$/ },
  { region: 'North America', label: 'US phone numbers', pattern: /^(\(\d{3}\) ?|\d{3}[.-])\d{3}[.-]\d{4}$/ }
];

/**
 * Parses CSV text into headers and rows. Supports quoted fields,
 * escaped quotes and CRLF line endings; skips blank lines.
 * @param {string} text
 * @returns {{headers: string[], rows: string[][]}}
 */
function parseCsv(text) {
  const input = text.replace(/^﻿/, '');
  const records = [];
  let record = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const [headers = [], ...rows] = records.filter(r => r.some(value => value.trim() !== ''));
  return { headers: headers.map(h => h.trim()), rows };
}

/**
 * Detects which entity a file holds from its name
 * @param {string} fileName
 * @returns {string|null} Entity id
 */
function detectEntity(fileName) {
  return ENTITIES.find(e => e.pattern.test(fileName))?.id || null;
}

function entityLabel(entityId) {
  return ENTITIES.find(e => e.id === entityId)?.label || 'Unrecognized';
}

/**
 * Parses an uploaded file and checks it for structural problems
 * @param {string} fileName
 * @param {string} text - Raw CSV content
 * @returns {DataFile}
 */
function summarizeDataFile(fileName, text) {
  const { headers, rows } = parseCsv(text);
  const issues = [];
  if (headers.length === 0) {
    issues.push({ line: null, message: 'File is empty' });
  }
  rows.forEach((row, index) => {
    if (row.length !== headers.length) {
      issues.push({
        line: index + 2,
        message: `Expected ${headers.length} columns, found ${row.length} (unquoted comma?)`
      });
    }
  });
  return { fileName, entity: detectEntity(fileName), headers, rows, rowCount: rows.length, issues };
}

function mostCommon(counts) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length > 0 ? entries[0][0] : null;
}

/**
 * Detects the column naming convention used across headers
 * @param {string[]} headers
 * @returns {string|null} 'Title Case' | 'camelCase' | 'snake_case'
 */
function detectColumnStyle(headers) {
  const counts = {};
  headers.forEach(header => {
    let style = null;
    if (/\s/.test(header) || /^[A-Z]/.test(header)) style = 'Title Case';
    else if (header.includes('_')) style = 'snake_case';
    else if (/^[a-z][a-z0-9]*[A-Z]/.test(header)) style = 'camelCase';
    if (style) counts[style] = (counts[style] || 0) + 1;
  });
  return mostCommon(counts);
}

/**
 * Detects the date format used in a set of values. Day/month order is
 * decided by values where one part is > 12; otherwise it's an assumption.
 * @param {string[]} values
 * @returns {{format: string, certain: boolean} | null}
 */
function detectDateFormat(values) {
  const definite = {};
  let ambiguousSeparator = null;

  values.forEach(value => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      definite['YYYY-MM-DD'] = (definite['YYYY-MM-DD'] || 0) + 1;
      return;
    }
    const match = value.match(/^(\d{2})([/-])(\d{2})\2(\d{4})$/);
    if (!match) return;
    const [, first, sep, second] = match;
    let format = null;
    if (Number(first) > 12) format = `DD${sep}MM${sep}YYYY`;
    else if (Number(second) > 12) format = `MM${sep}DD${sep}YYYY`;
    if (format) definite[format] = (definite[format] || 0) + 1;
    else ambiguousSeparator = ambiguousSeparator || sep;
  });

  const format = mostCommon(definite);
  if (format) return { format, certain: true };
  if (ambiguousSeparator) {
    return { format: `MM${ambiguousSeparator}DD${ambiguousSeparator}YYYY`, certain: false };
  }
  return null;
}

/**
 * Suggests a region from country-specific values (phone numbers, tax IDs, emails)
 * @param {string[]} values
 * @returns {{region: string, signals: string[]} | null}
 */
function detectRegion(values) {
  const counts = {};
  const signals = {};
  values.forEach(value => {
    const signal = REGION_SIGNALS.find(s => s.pattern.test(value.trim()));
    if (!signal) return;
    counts[signal.region] = (counts[signal.region] || 0) + 1;
    signals[signal.region] = signals[signal.region] || new Set();
    signals[signal.region].add(signal.label);
  });
  const region = mostCommon(counts);
  return region ? { region, signals: [...signals[region]] } : null;
}

/**
 * Detects the customer's data profile across all their files
 * @param {DataFile[]} files
 */
function detectProfile(files) {
  const headers = files.flatMap(f => f.headers);
  const values = files.flatMap(f => f.rows.flat());
  return {
    columnStyle: detectColumnStyle(headers),
    dateFormat: detectDateFormat(values),
    region: detectRegion(values)
  };
}

/**
 * Inventory of a customer's files for display: summaries (without row data),
 * expected entities still missing, and the detected profile
 * @param {DataFile[]} files
 */
function describeDataFiles(files) {
  return {
    files: files.map(({ rows, ...summary }) => ({ ...summary, entityLabel: entityLabel(summary.entity) })),
    missingEntities: ENTITIES
      .filter(e => !files.some(f => f.entity === e.id))
      .map(e => e.label),
    profile: files.length > 0 ? detectProfile(files) : null
  };
}

module.exports = {
  parseCsv,
  detectEntity,
  summarizeDataFile,
  detectColumnStyle,
  detectDateFormat,
  detectRegion,
  detectProfile,
  describeDataFiles
};
