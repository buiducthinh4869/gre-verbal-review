/**
 * Code.js: doGet, include, khởi tạo Google Sheet tiến độ.
 * Sheet được tạo ở lần chạy đầu (setup() hoặc lần mở web đầu tiên), ID lưu trong Script Properties.
 */

var SHEET_TITLE = 'GRE Verbal - Tiến độ ôn tập';
var TZ = 'Asia/Ho_Chi_Minh';

var TABS = {
  progress: ['wordId', 'box', 'dueDate', 'lapses', 'correctStreak', 'totalReviews', 'lastResult',
    'lastReviewed', 'confusedWith', 'updatedAt', 'lastMoved'],
  log: ['timestamp', 'wordId', 'mode', 'result', 'exerciseId', 'chosen', 'device', 'eventId'],
  custom_words: ['id', 'word', 'pos', 'priority', 'meaning', 'nuance', 'example', 'collocations', 'root',
    'createdAt', 'updatedAt'],
  settings: ['key', 'value']
};

function doGet(e) {
  var ss = ensureSheet_();
  var params = (e && e.parameter) || {};
  var t = HtmlService.createTemplateFromFile('index');
  t.boot = safeJson_({
    vocab: VOCAB_DATA,
    state: readState_(ss),
    admin: params.admin === '1'
  });
  return t.evaluate()
    .setTitle('Ôn GRE Verbal')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/** Chạy một lần trong trình soạn thảo để cấp quyền và tạo Sheet. Chạy lại không ghi đè dữ liệu. */
function setup() {
  CacheService.getScriptCache().remove('tabs_ok');
  var ss = ensureSheet_();
  Logger.log('Sheet: ' + ss.getUrl());
  return ss.getUrl();
}

function ensureSheet_() {
  var props = PropertiesService.getScriptProperties();
  var ss = openSheet_(props.getProperty('SHEET_ID'));
  var created = false;
  if (!ss) {
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      ss = openSheet_(props.getProperty('SHEET_ID'));
      if (!ss) {
        ss = SpreadsheetApp.create(SHEET_TITLE);
        ss.setSpreadsheetTimeZone(TZ);
        props.setProperty('SHEET_ID', ss.getId());
        created = true;
      }
    } finally {
      lock.releaseLock();
    }
  }
  var cache = CacheService.getScriptCache();
  if (created || !cache.get('tabs_ok')) {
    ensureTabs_(ss, created);
    cache.put('tabs_ok', '1', 3600);
  }
  return ss;
}

function openSheet_(id) {
  if (!id) return null;
  try {
    return SpreadsheetApp.openById(id);
  } catch (err) {
    return null;
  }
}

/** Tạo tab còn thiếu, thêm cột còn thiếu vào cuối hàng tiêu đề. Không xóa, không ghi đè dữ liệu. */
function ensureTabs_(ss, created) {
  if (ss.getSpreadsheetTimeZone() !== TZ) ss.setSpreadsheetTimeZone(TZ);
  Object.keys(TABS).forEach(function (name) {
    var headers = TABS[name];
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sh.setFrozenRows(1);
      sh.getRange(1, 1, sh.getMaxRows(), Math.max(headers.length, sh.getMaxColumns())).setNumberFormat('@');
      return;
    }
    var lastCol = Math.max(sh.getLastColumn(), 1);
    var current = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    var missing = headers.filter(function (h) { return current.indexOf(h) < 0; });
    if (missing.length) {
      var start = current.filter(String).length ? lastCol + 1 : 1;
      if (start + missing.length - 1 > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), missing.length);
      sh.getRange(1, start, 1, missing.length).setValues([missing]).setFontWeight('bold');
      sh.getRange(1, start, sh.getMaxRows(), missing.length).setNumberFormat('@');
    }
    if (sh.getFrozenRows() < 1) sh.setFrozenRows(1);
  });
  if (created) {
    ss.getSheets().forEach(function (sh) {
      if (!TABS[sh.getName()] && ss.getSheets().length > 1) ss.deleteSheet(sh);
    });
    ss.setActiveSheet(ss.getSheetByName('progress'));
  }
}

/** Đọc một tab thành {sheet, headers, col (tên → chỉ số), rows (mảng chuỗi)}. */
function readTable_(ss, name) {
  var sh = ss.getSheetByName(name);
  var lastRow = sh.getLastRow();
  var lastCol = Math.max(sh.getLastColumn(), TABS[name].length);
  var values = sh.getRange(1, 1, Math.max(lastRow, 1), lastCol).getDisplayValues();
  var headers = values[0];
  var col = {};
  headers.forEach(function (h, i) { if (h) col[h] = i; });
  var rows = values.slice(1).filter(function (r) { return r.join('') !== ''; });
  return { sheet: sh, headers: headers, col: col, rows: rows, width: lastCol };
}

function rowToObj_(table, row) {
  var o = {};
  Object.keys(table.col).forEach(function (h) { o[h] = row[table.col[h]]; });
  return o;
}

function objToRow_(table, obj, base) {
  var row = base ? base.slice() : [];
  while (row.length < table.width) row.push('');
  Object.keys(table.col).forEach(function (h) {
    if (Object.prototype.hasOwnProperty.call(obj, h)) row[table.col[h]] = obj[h] == null ? '' : String(obj[h]);
  });
  return row;
}

/** Ghi lại toàn bộ thân bảng (hàng 2 trở đi) với số hàng ≥ số hàng cũ; hàng thừa được làm trống. */
function writeBody_(table, rows, oldCount) {
  var sh = table.sheet;
  var n = Math.max(rows.length, oldCount);
  if (!n) return;
  var body = rows.slice();
  while (body.length < n) {
    var blank = [];
    for (var i = 0; i < table.width; i++) blank.push('');
    body.push(blank);
  }
  if (n + 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), n + 1 - sh.getMaxRows());
  var range = sh.getRange(2, 1, n, table.width);
  range.setNumberFormat('@');
  range.setValues(body);
}

function readState_(ss) {
  var progress = {};
  var pt = readTable_(ss, 'progress');
  pt.rows.forEach(function (r) {
    var s = Srs.normalizeState(rowToObj_(pt, r));
    if (s.wordId) progress[s.wordId] = s;
  });

  var ct = readTable_(ss, 'custom_words');
  var customWords = ct.rows.map(function (r) { return customFromRow_(rowToObj_(ct, r)); })
    .filter(function (w) { return w.id && w.word; });

  var settings = readSettings_(ss);
  var daily = settings._daily || {};
  var exLast = settings._exLast || {};
  delete settings._daily;
  delete settings._exLast;

  var now = Date.now();
  return {
    progress: progress,
    customWords: customWords,
    settings: settings,
    daily: daily,
    exLast: exLast,
    nowMs: now,
    today: Srs.vnDate(now),
    sheetUrl: ss.getUrl()
  };
}

function readSettings_(ss) {
  var st = readTable_(ss, 'settings');
  var out = {};
  st.rows.forEach(function (r) {
    var k = r[st.col.key], v = r[st.col.value];
    if (!k) return;
    try { out[k] = JSON.parse(v); } catch (err) { out[k] = v; }
  });
  return out;
}

function customFromRow_(o) {
  return {
    id: o.id, word: o.word, pos: o.pos || '', priority: parseInt(o.priority, 10) || 2,
    meaning: o.meaning || '', nuance: o.nuance || '', example: o.example || '',
    collocations: String(o.collocations || '').split(' | ').map(function (x) { return x.trim(); }).filter(Boolean),
    root: o.root || '', createdAt: o.createdAt || '', updatedAt: o.updatedAt || ''
  };
}

function safeJson_(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
