/**
 * CSV normalization: turns raw CSV text, including text with common export
 * mistakes, into clean rows plus a list of the problems that were found.
 *
 * Silently fixed (cosmetic): BOM, CRLF/CR line endings, blank lines,
 * whitespace around unquoted values and headers.
 *
 * Fixed and reported: rows with unquoted commas inside a value (too many
 * fields), rows with missing trailing fields, duplicate/empty headers.
 *
 * Reported and dropped: unterminated quotes, and overlong rows where it is
 * not clear which column the extra commas belong to.
 */

/**
 * @typedef {Object} CsvIssue
 * @property {string} type - extra-fields-merged | missing-fields-padded | row-unresolved |
 *                           unterminated-quote | duplicate-header | empty-header
 * @property {number} line - 1-based line where the record starts
 * @property {string} message
 * @property {string} [column] - column the issue was resolved in, when applicable
 */

/**
 * @typedef {Object} NormalizedCsv
 * @property {string[]} headers
 * @property {Object<string, string>[]} rows
 * @property {CsvIssue[]} issues
 */

/**
 * Split text into records of raw fields. Quoted fields may contain commas,
 * escaped quotes ("") and line breaks.
 * @returns {{fields: {value: string, quoted: boolean}[], line: number, unterminated: boolean}[]}
 */
function parseRecords(text) {
  const records = [];
  let fields = [];
  let buffer = '';
  let quoted = false;
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;

  const endField = () => {
    fields.push({ value: buffer, quoted });
    buffer = '';
    quoted = false;
  };
  const endRecord = (unterminated = false) => {
    endField();
    records.push({ fields, line: recordLine, unterminated });
    fields = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          buffer += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n') line++;
        buffer += ch;
      }
      continue;
    }

    if (ch === '"' && !quoted && buffer.trim() === '') {
      buffer = '';
      quoted = true;
      inQuotes = true;
    } else if (ch === ',') {
      endField();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRecord();
      line++;
      recordLine = line;
    } else if (quoted) {
      // Text after a closing quote: ignore padding, keep anything else.
      if (ch.trim() !== '') buffer += ch;
    } else {
      buffer += ch;
    }
  }

  if (inQuotes) {
    endRecord(true);
  } else if (buffer !== '' || fields.length > 0 || quoted) {
    endRecord();
  }

  return records;
}

const isBlankRecord = ({ fields }) =>
  fields.length === 1 && !fields[0].quoted && fields[0].value.trim() === '';

const cleanValue = ({ value, quoted }) => (quoted ? value : value.trim());

function shapeOf(value) {
  const v = value.trim();
  if (/^[+-]?\d+(\.\d+)?$/.test(v)) return 'number';
  if (/^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/.test(v)) return 'date';
  if (/^[A-Za-z]+[-_]?\d+$/.test(v)) return 'id';
  return 'text';
}

/**
 * How consistent a column looks: do its values share one shape, and do they
 * repeat (as picklists and IDs-of-parents do)? A value glued together from the
 * wrong neighbours breaks both.
 */
function columnFit(values) {
  if (values.length === 0) return 0;
  const nonEmpty = values.filter(v => v !== '');
  let homogeneity = 1;
  if (nonEmpty.length > 0) {
    const counts = new Map();
    for (const v of nonEmpty) counts.set(shapeOf(v), (counts.get(shapeOf(v)) || 0) + 1);
    homogeneity = Math.max(...counts.values()) / nonEmpty.length;
  }
  const repetition = 1 - new Set(values).size / values.length;
  return homogeneity + repetition;
}

/** Join the `extra + 1` fields starting at `position` into a single value. */
function mergeAt(fields, position, extra) {
  const merged = fields.slice(position, position + extra + 1);
  const value = merged.some(f => f.quoted)
    ? merged.map(f => f.value).join(',')
    : merged.map(f => f.value).join(',').trim();
  return [
    ...fields.slice(0, position).map(cleanValue),
    value,
    ...fields.slice(position + extra + 1).map(cleanValue)
  ];
}

/**
 * Rows sharing the same number of extra fields are assumed to share the same
 * defect, so one merge position is chosen for the whole group by testing which
 * position leaves the columns most consistent. Returns null when there is no
 * clear winner.
 */
function pickMergePosition(group, extra, columnCount, cleanColumns) {
  let best = null;
  let tied = false;

  for (let position = 0; position < columnCount; position++) {
    const merged = group.map(record => mergeAt(record.fields, position, extra));
    let score = 0;
    for (let col = 0; col < columnCount; col++) {
      score += columnFit([...cleanColumns[col], ...merged.map(row => row[col])]);
    }
    // Pieces of one split value look alike ("Williams" + "Robert"), unlike
    // unrelated neighbours (a date next to a tax ID). Needed when every row is
    // overlong and there are no well-formed rows to compare against.
    const alike = group.filter(record =>
      new Set(record.fields.slice(position, position + extra + 1).map(f => shapeOf(f.value))).size === 1
    ).length;
    score += alike / group.length;
    if (best === null || score > best.score + 1e-9) {
      best = { position, score };
      tied = false;
    } else if (Math.abs(score - best.score) <= 1e-9) {
      tied = true;
    }
  }

  return tied ? null : best.position;
}

function buildHeaders(headerRecord, issues) {
  const seen = new Set();
  return headerRecord.fields.map((field, index) => {
    let name = cleanValue(field);
    if (name === '') {
      name = `column_${index + 1}`;
      issues.push({
        type: 'empty-header', line: headerRecord.line, column: name,
        message: `Header ${index + 1} is empty; named it "${name}"`
      });
    }
    if (seen.has(name)) {
      let suffix = 2;
      while (seen.has(`${name}_${suffix}`)) suffix++;
      issues.push({
        type: 'duplicate-header', line: headerRecord.line, column: name,
        message: `Header "${name}" is repeated; renamed to "${name}_${suffix}"`
      });
      name = `${name}_${suffix}`;
    }
    seen.add(name);
    return name;
  });
}

/**
 * @param {string} text - raw CSV content
 * @returns {NormalizedCsv}
 */
function normalizeCsv(text) {
  const records = parseRecords(String(text).replace(/^﻿/, '')).filter(r => !isBlankRecord(r));
  if (records.length === 0) return { headers: [], rows: [], issues: [] };

  const issues = [];
  const [headerRecord, ...dataRecords] = records;
  const headers = buildHeaders(headerRecord, issues);
  const columnCount = headers.length;

  const results = new Map(); // record -> array of cleaned values, or null when dropped
  const overlong = new Map(); // extra field count -> records
  const cleanColumns = headers.map(() => []);

  for (const record of dataRecords) {
    const count = record.fields.length;

    if (record.unterminated) {
      issues.push({
        type: 'unterminated-quote', line: record.line,
        message: `A quoted value starting on line ${record.line} is never closed; the rest of the file was consumed by it`
      });
      results.set(record, null);
    } else if (count === columnCount) {
      const values = record.fields.map(cleanValue);
      values.forEach((v, col) => cleanColumns[col].push(v));
      results.set(record, values);
    } else if (count < columnCount) {
      const values = record.fields.map(cleanValue);
      while (values.length < columnCount) values.push('');
      issues.push({
        type: 'missing-fields-padded', line: record.line,
        message: `Row has ${count} field(s), expected ${columnCount}; padded with empty values`
      });
      results.set(record, values);
    } else {
      const extra = count - columnCount;
      if (!overlong.has(extra)) overlong.set(extra, []);
      overlong.get(extra).push(record);
    }
  }

  for (const [extra, group] of overlong) {
    const position = pickMergePosition(group, extra, columnCount, cleanColumns);
    for (const record of group) {
      if (position === null) {
        issues.push({
          type: 'row-unresolved', line: record.line,
          message: `Row has ${extra} more field(s) than the ${columnCount} columns and it is unclear which value contains the extra commas; row dropped`
        });
        results.set(record, null);
      } else {
        issues.push({
          type: 'extra-fields-merged', line: record.line, column: headers[position],
          message: `Row has ${extra} more field(s) than the ${columnCount} columns; treated the commas as part of "${headers[position]}"`
        });
        results.set(record, mergeAt(record.fields, position, extra));
      }
    }
  }

  const rows = [];
  for (const record of dataRecords) {
    const values = results.get(record);
    if (values) rows.push(Object.fromEntries(headers.map((h, i) => [h, values[i]])));
  }

  issues.sort((a, b) => a.line - b.line);
  return { headers, rows, issues };
}

module.exports = { normalizeCsv };
