// Giả lập tối thiểu Google Apps Script (SpreadsheetApp, CacheService, LockService, Utilities, ...) để chạy
// mã trong apps-script/ bằng Node: dùng cho test và cho máy chủ thử cục bộ (scripts/dev-server.js).
'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const pad = (n, l = 2) => String(n).padStart(l, '0');
function formatDate(d, tz, f) {
  const t = new Date(d.getTime() + 7 * 3600 * 1000); // Asia/Ho_Chi_Minh = UTC+7
  const map = { yyyy: t.getUTCFullYear(), MM: pad(t.getUTCMonth() + 1), dd: pad(t.getUTCDate()), HH: pad(t.getUTCHours()), mm: pad(t.getUTCMinutes()), ss: pad(t.getUTCSeconds()) };
  return f.replace(/yyyy|MM|dd|HH|mm|ss/g, (m) => map[m]);
}

class Sheet {
  constructor(name, data) { this.name = name; this.data = data || []; this.maxRows = Math.max(1000, this.data.length); this.maxCols = Math.max(26, ...this.data.map((r) => r.length), 1); this.frozen = 0; this.fmt = []; }
  getName() { return this.name; }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxCols; }
  getLastRow() { for (let i = this.data.length - 1; i >= 0; i--) if ((this.data[i] || []).some((v) => v !== '' && v != null)) return i + 1; return 0; }
  getLastColumn() { let m = 0; this.data.forEach((r) => (r || []).forEach((v, j) => { if (v !== '' && v != null) m = Math.max(m, j + 1); })); return m; }
  insertRowsAfter(after, n) { this.maxRows += n; }
  insertColumnsAfter(after, n) { this.maxCols += n; }
  insertColumnBefore(c) { this.data.forEach((r) => { if (r) r.splice(c - 1, 0, ''); }); this.maxCols += 1; }
  deleteRow(r) { this.data.splice(r - 1, 1); }
  getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
  setFrozenRows(n) { this.frozen = n; }
  getFrozenRows() { return this.frozen; }
}

class Range {
  constructor(sh, r, c, nr, nc) {
    if (r < 1 || c < 1 || nr < 1 || nc < 1 || r + nr - 1 > sh.maxRows || c + nc - 1 > sh.maxCols) throw new Error(`Range ngoài lưới: ${sh.name} r${r} c${c} ${nr}x${nc}`);
    Object.assign(this, { sh, r, c, nr, nc });
  }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) { const v = (this.sh.data[this.r - 1 + i] || [])[this.c - 1 + j]; row.push(v == null ? '' : v); }
      out.push(row);
    }
    return out;
  }
  getDisplayValues() { return this.getValues().map((r) => r.map((v) => String(v))); }
  setValues(vals) {
    if (vals.length !== this.nr || vals.some((x) => x.length !== this.nc)) throw new Error(`setValues sai kích thước: cần ${this.nr}x${this.nc} (${this.sh.name})`);
    vals.forEach((row, i) => {
      const t = (this.sh.data[this.r - 1 + i] = this.sh.data[this.r - 1 + i] || []);
      row.forEach((v, j) => { t[this.c - 1 + j] = v; });
    });
    this.sh.writes = (this.sh.writes || 0) + 1;
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  setNumberFormat() { return this; }
  setFontWeight() { return this; }
}

function makeEnv(opts = {}) {
  const store = { sheets: [], props: Object.assign({ SHEET_ID: 'TEST_SHEET' }, opts.props || {}), cache: {}, tz: 'Asia/Ho_Chi_Minh', clock: opts.clock || null };
  const ss = {
    getId: () => 'TEST_SHEET', getUrl: () => 'https://docs.google.com/spreadsheets/d/TEST_SHEET/edit',
    getSpreadsheetTimeZone: () => store.tz, setSpreadsheetTimeZone: (z) => { store.tz = z; },
    getSheetByName: (n) => store.sheets.find((s) => s.name === n) || null,
    getSheets: () => store.sheets.slice(),
    insertSheet: (n) => { if (store.sheets.find((s) => s.name === n)) throw new Error('Sheet đã tồn tại: ' + n); const s = new Sheet(n); store.sheets.push(s); return s; }
  };
  const cacheGet = (k) => { const e = store.cache[k]; if (!e) return null; if (e.exp < Date.now()) { delete store.cache[k]; return null; } return e.v; };
  const cache = {
    get: cacheGet,
    put: (k, v, s) => { store.cache[k] = { v: String(v), exp: Date.now() + (s || 600) * 1000 }; },
    putAll: (o, s) => Object.keys(o).forEach((k) => cache.put(k, o[k], s)),
    getAll: (ks) => { const o = {}; ks.forEach((k) => { const v = cacheGet(k); if (v != null) o[k] = v; }); return o; },
    remove: (k) => { delete store.cache[k]; }
  };
  const toSigned = (buf) => Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
  const toBuf = (v) => (Array.isArray(v) ? Buffer.from(v.map((b) => (b + 256) % 256)) : Buffer.from(String(v), 'utf8'));
  const ctx = {
    console, Logger: { log: () => {} },
    SpreadsheetApp: { openById: (id) => { if (id !== 'TEST_SHEET') throw new Error('no sheet'); return ss; } },
    CacheService: { getScriptCache: () => cache },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (k in store.props ? store.props[k] : null),
      setProperty: (k, v) => { store.props[k] = String(v); },
      deleteProperty: (k) => { delete store.props[k]; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ s, setMimeType() { return this; }, getContent() { return this.s; } }) },
    Utilities: {
      formatDate,
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, v) => toSigned(crypto.createHash('sha256').update(toBuf(v)).digest()),
      base64Encode: (bytes) => toBuf(bytes).toString('base64'),
      base64EncodeWebSafe: (bytes) => toBuf(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      getUuid: () => crypto.randomUUID()
    }
  };
  vm.createContext(ctx);
  return { ctx, store, ss, Sheet };
}

function loadServer(env, dir) {
  dir = dir || path.join(__dirname, '..', 'apps-script');
  fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort().forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), env.ctx, { filename: f });
  });
}

/** Gọi doPost như Apps Script: trả về đối tượng JSON đã parse. */
function post(env, body) {
  const out = env.ctx.doPost({ postData: { contents: JSON.stringify(body) } });
  return JSON.parse(out.getContent());
}

module.exports = { makeEnv, loadServer, post, Sheet };
