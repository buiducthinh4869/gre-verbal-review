/**
 * Store.js: đọc/ghi Google Sheet theo userId.
 *
 * Nguyên tắc an toàn dữ liệu:
 *  - Đọc/ghi theo TÊN CỘT (hàng tiêu đề), không theo vị trí, nên cột cũ khác thứ tự hay cột thừa
 *    (vd lastMoved, eventId của bản cũ) vẫn được giữ nguyên.
 *  - Chỉ cập nhật đúng những dòng thay đổi của chính người dùng đó, và thêm dòng mới ở cuối.
 *    Không bao giờ clear(), không ghi lại toàn bộ bảng, không sắp xếp lại.
 *  - Không tự tạo hay sửa cấu trúc Sheet khi xử lý yêu cầu thường; việc đó chỉ làm trong Migrate.js.
 */

var TZ = 'Asia/Ho_Chi_Minh';
var SCHEMA_VERSION = '2';

var TABS = {
  users: ['userId', 'username', 'displayName', 'passwordHash', 'salt', 'role', 'active', 'mustChangePassword', 'createdAt', 'lastLoginAt'],
  sessions: ['tokenHash', 'userId', 'createdAt', 'lastSeenAt'],
  progress: ['userId', 'wordId', 'box', 'dueDate', 'lapses', 'correctStreak', 'totalReviews', 'lastResult', 'lastReviewed', 'confusedWith', 'updatedAt', 'lastMoved'],
  log: ['userId', 'timestamp', 'wordId', 'mode', 'result', 'exerciseId', 'chosen', 'device', 'eventId'],
  custom_words: ['userId', 'id', 'word', 'pos', 'priority', 'meaning', 'nuance', 'example', 'collocations', 'root', 'createdAt', 'updatedAt', 'deletedAt'],
  settings: ['userId', 'key', 'value']
};
var USER_TABS = ['progress', 'log', 'custom_words', 'settings'];

/* ---------------- Mở Sheet ---------------- */

function openSs_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) fail_('not_ready', 'Hệ thống chưa được thiết lập.');
  return SpreadsheetApp.openById(id);
}

function schemaReady_() {
  return PropertiesService.getScriptProperties().getProperty('SCHEMA') === SCHEMA_VERSION;
}

/* ---------------- Bảng ---------------- */

/** Đọc cả tab thành {sh, name, headers, col, width, rows}. rows[i] là dòng Sheet i + 2 (chuỗi hiển thị). */
function table_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) fail_('not_ready', 'Thiếu tab ' + name + '.');
  var lastRow = sh.getLastRow(), lastCol = Math.max(sh.getLastColumn(), 1);
  var values = sh.getRange(1, 1, Math.max(lastRow, 1), lastCol).getDisplayValues();
  var headers = values[0].map(String);
  return { sh: sh, name: name, headers: headers, col: colMap_(headers), width: lastCol, rows: values.slice(1) };
}

/** Chỉ đọc hàng tiêu đề (dùng khi chỉ cần thêm dòng, vd log). */
function header_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) fail_('not_ready', 'Thiếu tab ' + name + '.');
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var headers = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(String);
  return { sh: sh, name: name, headers: headers, col: colMap_(headers), width: lastCol, rows: null };
}

function colMap_(headers) {
  var col = {};
  headers.forEach(function (h, i) { if (h && !(h in col)) col[h] = i; });
  return col;
}

function cell_(t, row, h) {
  var i = t.col[h];
  return i == null ? '' : String(row[i] == null ? '' : row[i]);
}

function rowObj_(t, row) {
  var o = {};
  Object.keys(t.col).forEach(function (h) { o[h] = row[t.col[h]]; });
  return o;
}

function isBlankRow_(row) {
  for (var i = 0; i < row.length; i++) if (String(row[i]) !== '') return false;
  return true;
}

/** Chỉ số các dòng (trong t.rows) thuộc userId. */
function userRows_(t, userId) {
  var out = [];
  var c = t.col.userId;
  for (var i = 0; i < t.rows.length; i++) if (String(t.rows[i][c]) === userId) out.push(i);
  return out;
}

/** Ghép giá trị của obj vào một dòng (giữ nguyên các cột không có trong obj). */
function mergeRow_(t, base, obj) {
  var row = base ? base.slice() : [];
  while (row.length < t.width) row.push('');
  Object.keys(obj).forEach(function (h) {
    var i = t.col[h];
    if (i != null) row[i] = obj[h] == null ? '' : String(obj[h]);
  });
  return row;
}

/** Ghi lại các dòng đã sửa (chỉ số trong t.rows), gom các dòng liền nhau thành một lần ghi. */
function writeRows_(t, indexes) {
  var list = indexes.slice().sort(function (a, b) { return a - b; }).filter(function (v, k, a) { return k === 0 || a[k - 1] !== v; });
  var k = 0;
  while (k < list.length) {
    var start = list[k], end = start;
    while (k + 1 < list.length && list[k + 1] === end + 1) { k++; end = list[k]; }
    var block = t.rows.slice(start, end + 1).map(function (r) { var x = r.slice(0, t.width); while (x.length < t.width) x.push(''); return x; });
    t.sh.getRange(start + 2, 1, block.length, t.width).setNumberFormat('@').setValues(block);
    k++;
  }
}

/** Thêm dòng mới ở cuối tab (giá trị dạng chữ). objs: mảng đối tượng theo tên cột. */
function appendObjs_(t, objs) {
  if (!objs.length) return;
  var rows = objs.map(function (o) { return mergeRow_(t, null, o); });
  var sh = t.sh;
  var start = sh.getLastRow() + 1;
  var need = start + rows.length - 1;
  if (need > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows() + 50);
  sh.getRange(start, 1, rows.length, t.width).setNumberFormat('@').setValues(rows);
  if (t.rows) {
    // giữ t.rows khớp với Sheet nếu có dòng trống ở giữa thì bỏ qua (getLastRow tính dòng cuối có dữ liệu)
    while (t.rows.length < start - 2) t.rows.push(blankRow_(t.width));
    rows.forEach(function (r) { t.rows.push(r); });
  }
}

function blankRow_(n) { var r = []; for (var i = 0; i < n; i++) r.push(''); return r; }

/* ---------------- Ngày giờ ---------------- */

function vnDate_(ms) { return Utilities.formatDate(new Date(ms), TZ, 'yyyy-MM-dd'); }
function vnStamp_(ms) { return Utilities.formatDate(new Date(ms), TZ, 'dd/MM/yyyy HH:mm:ss'); }
function isDateStr_(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }
function addDays_(dateStr, n) {
  var p = dateStr.split('-');
  var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* ---------------- Trạng thái từ (khớp assets/srs.js) ---------------- */

function clampInt_(v, lo, hi) {
  var n = parseInt(v, 10);
  if (isNaN(n)) n = lo;
  return Math.max(lo, Math.min(hi, n));
}

function normalizeState_(raw) {
  var cw = raw.confusedWith;
  if (typeof cw === 'string') cw = cw ? cw.split(/[,;\s]+/) : [];
  return {
    wordId: String(raw.wordId || ''),
    box: clampInt_(raw.box, 0, 5),
    dueDate: isDateStr_(raw.dueDate) ? raw.dueDate : '',
    lapses: clampInt_(raw.lapses, 0, 9999),
    correctStreak: clampInt_(raw.correctStreak, 0, 9999),
    totalReviews: clampInt_(raw.totalReviews, 0, 999999),
    lastResult: ['again', 'hard', 'good'].indexOf(raw.lastResult) >= 0 ? raw.lastResult : '',
    lastReviewed: raw.lastReviewed ? String(raw.lastReviewed) : '',
    confusedWith: (cw || []).filter(Boolean).map(String).slice(0, 5),
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : '',
    lastMoved: isDateStr_(raw.lastMoved) ? raw.lastMoved : ''
  };
}

function isLeech_(s) {
  if (!s || s.correctStreak >= 3) return false;
  return s.lapses >= 2 || (s.lastResult === 'again' && s.lapses >= 1);
}

function stateToRow_(s) {
  return {
    wordId: s.wordId, box: s.box, dueDate: s.dueDate, lapses: s.lapses, correctStreak: s.correctStreak,
    totalReviews: s.totalReviews, lastResult: s.lastResult, lastReviewed: s.lastReviewed,
    confusedWith: (s.confusedWith || []).join(', '), updatedAt: s.updatedAt, lastMoved: s.lastMoved
  };
}

/* ---------------- Đọc trạng thái một người ---------------- */

function readProgress_(ss, userId) {
  var t = table_(ss, 'progress');
  var out = {};
  userRows_(t, userId).forEach(function (i) {
    var s = normalizeState_(rowObj_(t, t.rows[i]));
    if (s.wordId) out[s.wordId] = out[s.wordId] && out[s.wordId].updatedAt > s.updatedAt ? out[s.wordId] : s;
  });
  return out;
}

function readSettings_(ss, userId) {
  var t = table_(ss, 'settings');
  var out = {};
  userRows_(t, userId).forEach(function (i) {
    var k = cell_(t, t.rows[i], 'key'), v = cell_(t, t.rows[i], 'value');
    if (!k) return;
    try { out[k] = JSON.parse(v); } catch (e) { out[k] = v; }
  });
  return out;
}

function customFromRow_(o) {
  return {
    id: String(o.id || ''), word: String(o.word || ''), pos: o.pos || '', priority: parseInt(o.priority, 10) || 2,
    meaning: o.meaning || '', nuance: o.nuance || '', example: o.example || '',
    collocations: String(o.collocations || '').split(' | ').map(function (x) { return x.trim(); }).filter(Boolean),
    root: o.root || '', createdAt: o.createdAt || '', updatedAt: o.updatedAt || ''
  };
}

function readCustomWords_(ss, userId) {
  var t = table_(ss, 'custom_words');
  return userRows_(t, userId)
    .filter(function (i) { return !cell_(t, t.rows[i], 'deletedAt'); })
    .map(function (i) { return customFromRow_(rowObj_(t, t.rows[i])); })
    .filter(function (w) { return w.id && w.word; });
}

function readState_(ss, userId) {
  var settings = readSettings_(ss, userId);
  var daily = settings._daily || {};
  var exLast = settings._exLast || {};
  delete settings._daily;
  delete settings._exLast;
  var now = Date.now();
  return {
    progress: readProgress_(ss, userId),
    customWords: readCustomWords_(ss, userId),
    settings: settings,
    daily: daily,
    exLast: exLast,
    nowMs: now,
    today: vnDate_(now)
  };
}

/** Thống kê cho trang Quản lý: số từ đã học, đến hạn, hay quên của mỗi người. */
function progressStats_(ss) {
  var t = table_(ss, 'progress');
  var today = vnDate_(Date.now());
  var latest = {};
  t.rows.forEach(function (r) {
    var u = cell_(t, r, 'userId');
    if (!u) return;
    var s = normalizeState_(rowObj_(t, r));
    if (!s.wordId) return;
    var m = latest[u] || (latest[u] = {});
    if (!m[s.wordId] || m[s.wordId].updatedAt < s.updatedAt) m[s.wordId] = s;
  });
  var out = {};
  Object.keys(latest).forEach(function (u) {
    var st = { learned: 0, due: 0, leech: 0 };
    Object.keys(latest[u]).forEach(function (w) {
      var s = latest[u][w];
      if (s.box >= 1) st.learned++;
      if (s.box >= 1 && s.dueDate && s.dueDate <= today) st.due++;
      if (isLeech_(s)) st.leech++;
    });
    out[u] = st;
  });
  return out;
}
