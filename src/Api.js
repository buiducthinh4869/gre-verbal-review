/**
 * Api.js: các hàm client gọi qua google.script.run.
 * Mọi ghi Sheet đi qua saveEvents (có LockService). Gộp trạng thái từ: updatedAt mới hơn thắng.
 */

var SETTING_KEYS = ['newPerDay', 'autoStart', 'thinkFirst', 'examMode'];
var MAX_EVENTS = 200;
var MAX_CELL = 2000;

/** Lấy trạng thái mới nhất (dùng khi quay lại tab sau thời gian dài). */
function getState() {
  return readState_(ensureSheet_());
}

/**
 * Nhận một lô sự kiện từ hàng đợi của client.
 * Loại sự kiện:
 *  - review: {id, type, ts, day, wordId, mode, result, exerciseId, chosen, device, isNew, state}
 *  - custom_upsert: {id, type, ts, word}
 *  - custom_delete: {id, type, ts, wordId}
 *  - setting: {id, type, ts, key, value}
 * Trả về trạng thái hiện tại trên server của các từ liên quan.
 */
function saveEvents(events) {
  if (!Array.isArray(events)) throw new Error('events phải là mảng');
  events = events.filter(function (e) { return e && typeof e.id === 'string' && e.id.length <= 64; }).slice(0, MAX_EVENTS);

  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var ss = ensureSheet_();
    var cache = CacheService.getScriptCache();
    var keys = events.map(function (e) { return 'ev_' + e.id; });
    var seen = keys.length ? cache.getAll(keys) : {};
    var fresh = events.filter(function (e) { return !seen['ev_' + e.id]; });

    var now = Date.now();
    var serverToday = Srs.vnDate(now);
    var touchedWords = {};

    // ---- progress
    var pt = readTable_(ss, 'progress');
    var oldProgCount = pt.rows.length;
    var progRowIdx = {};
    pt.rows.forEach(function (r, i) { progRowIdx[r[pt.col.wordId]] = i; });
    var progChanged = false;

    // ---- settings (gồm _daily, _exLast)
    var settings = readSettings_(ss);
    var daily = settings._daily || {};
    var exLast = settings._exLast || {};
    var settingsChanged = false;

    // ---- custom words
    var ct = null, customRows = null, customIdx = null, customChanged = false, oldCustomCount = 0;
    function loadCustom() {
      if (ct) return;
      ct = readTable_(ss, 'custom_words');
      customRows = ct.rows.slice();
      oldCustomCount = customRows.length;
      customIdx = {};
      customRows.forEach(function (r, i) { customIdx[r[ct.col.id]] = i; });
    }

    var logRows = [];

    fresh.forEach(function (ev) {
      var tsMs = Date.parse(ev.ts);
      if (isNaN(tsMs) || tsMs > now + 5 * 60000) tsMs = now; // không tin giờ thiết bị chạy trước server
      var day = Srs.isDateStr(ev.day) && ev.day <= serverToday ? ev.day : Srs.vnDate(tsMs);

      if (ev.type === 'review') {
        var wordId = clip_(ev.wordId, 80);
        logRows.push([
          Utilities.formatDate(new Date(tsMs), TZ, 'dd/MM/yyyy HH:mm:ss'),
          wordId, clip_(ev.mode, 20), clip_(ev.result, 20), clip_(ev.exerciseId, 40),
          clip_(Array.isArray(ev.chosen) ? ev.chosen.join(' | ') : ev.chosen, 300),
          clip_(ev.device, 40), ev.id
        ]);
        var d = daily[day] || (daily[day] = { r: 0, n: 0 });
        d.r += 1;
        if (ev.isNew) d.n += 1;
        settingsChanged = true;
        if (ev.exerciseId) {
          var iso = new Date(tsMs).toISOString();
          if (!exLast[ev.exerciseId] || exLast[ev.exerciseId] < iso) exLast[ev.exerciseId] = iso;
        }
        if (ev.state && wordId) {
          var incoming = Srs.normalizeState(ev.state);
          incoming.wordId = wordId;
          if (!incoming.updatedAt) incoming.updatedAt = new Date(tsMs).toISOString();
          var i = progRowIdx[wordId];
          var current = i == null ? null : Srs.normalizeState(rowToObj_(pt, pt.rows[i]));
          if (!current || Srs.newer(current, incoming) === incoming && incoming.updatedAt !== current.updatedAt) {
            var obj = stateToRowObj_(incoming);
            if (i == null) {
              progRowIdx[wordId] = pt.rows.length;
              pt.rows.push(objToRow_(pt, obj));
            } else {
              pt.rows[i] = objToRow_(pt, obj, pt.rows[i]);
            }
            progChanged = true;
          }
        }
        if (wordId) touchedWords[wordId] = true;
      } else if (ev.type === 'custom_upsert' && ev.word) {
        loadCustom();
        var w = sanitizeCustom_(ev.word);
        if (!w) return;
        var j = customIdx[w.id];
        if (j == null) {
          customIdx[w.id] = customRows.length;
          customRows.push(objToRow_(ct, w));
          customChanged = true;
        } else {
          var old = rowToObj_(ct, customRows[j]);
          if (!old.updatedAt || w.updatedAt >= old.updatedAt) {
            w.createdAt = old.createdAt || w.createdAt;
            customRows[j] = objToRow_(ct, w, customRows[j]);
            customChanged = true;
          }
        }
      } else if (ev.type === 'custom_delete' && ev.wordId) {
        loadCustom();
        var k = customIdx[ev.wordId];
        if (k != null) {
          customRows[k] = null;
          delete customIdx[ev.wordId];
          customChanged = true;
        }
      } else if (ev.type === 'setting' && SETTING_KEYS.indexOf(ev.key) >= 0) {
        settings[ev.key] = sanitizeSetting_(ev.key, ev.value);
        settingsChanged = true;
      }
    });

    if (progChanged) writeBody_(pt, pt.rows, oldProgCount);
    if (logRows.length) {
      var lsh = ss.getSheetByName('log');
      var start = lsh.getLastRow() + 1;
      if (start + logRows.length - 1 > lsh.getMaxRows()) lsh.insertRowsAfter(lsh.getMaxRows(), logRows.length + 100);
      var lr = lsh.getRange(start, 1, logRows.length, logRows[0].length);
      lr.setNumberFormat('@');
      lr.setValues(logRows);
    }
    if (customChanged) {
      writeBody_(ct, customRows.filter(Boolean), oldCustomCount);
    }
    if (settingsChanged) {
      settings._daily = pruneDaily_(daily, serverToday);
      settings._exLast = exLast;
      writeSettings_(ss, settings);
    }

    if (keys.length) {
      var put = {};
      fresh.forEach(function (e) { put['ev_' + e.id] = '1'; });
      if (Object.keys(put).length) cache.putAll(put, 21600);
    }

    var states = {};
    Object.keys(touchedWords).forEach(function (id) {
      var i = progRowIdx[id];
      if (i != null) states[id] = Srs.normalizeState(rowToObj_(pt, pt.rows[i]));
    });
    return { ok: true, saved: fresh.length, duplicate: events.length - fresh.length, states: states, nowMs: Date.now(), today: serverToday };
  } finally {
    lock.releaseLock();
  }
}

/* ---- Hàm tiện dụng (client dùng hàng đợi saveEvents; các hàm này để gọi trực tiếp khi cần) ---- */

function addCustomWord(word) {
  var now = new Date().toISOString();
  word.id = word.id || 'c-' + Date.now().toString(36);
  word.createdAt = word.createdAt || now;
  word.updatedAt = now;
  return saveEvents([{ id: 'add-' + word.id + '-' + Date.now(), type: 'custom_upsert', ts: now, word: word }]);
}

function updateCustomWord(word) {
  return addCustomWord(word);
}

function deleteCustomWord(wordId) {
  return saveEvents([{ id: 'del-' + wordId + '-' + Date.now(), type: 'custom_delete', ts: new Date().toISOString(), wordId: wordId }]);
}

function saveSettings(obj) {
  var ts = new Date().toISOString();
  return saveEvents(Object.keys(obj || {}).map(function (k, i) {
    return { id: 'set-' + k + '-' + Date.now() + '-' + i, type: 'setting', ts: ts, key: k, value: obj[k] };
  }));
}

/**
 * Xóa toàn bộ tiến độ, nhật ký và từ tự thêm (giữ cài đặt). Chỉ mở từ trang ?admin=1 và cần gõ XOA.
 * Không bao giờ được gọi khi triển khai.
 */
function resetAllProgress(confirmText) {
  if (confirmText !== 'XOA') throw new Error('Cần gõ đúng XOA để xác nhận.');
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var ss = ensureSheet_();
    ['progress', 'log', 'custom_words'].forEach(function (name) {
      var sh = ss.getSheetByName(name);
      if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
    });
    var settings = readSettings_(ss);
    delete settings._daily;
    delete settings._exLast;
    writeSettings_(ss, settings);
    return readState_(ss);
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- nội bộ ---------------- */

function stateToRowObj_(s) {
  return {
    wordId: s.wordId, box: s.box, dueDate: s.dueDate, lapses: s.lapses, correctStreak: s.correctStreak,
    totalReviews: s.totalReviews, lastResult: s.lastResult, lastReviewed: s.lastReviewed,
    confusedWith: (s.confusedWith || []).join(', '), updatedAt: s.updatedAt, lastMoved: s.lastMoved
  };
}

function clip_(v, n) {
  if (v == null) return '';
  return String(v).slice(0, n || MAX_CELL);
}

function sanitizeCustom_(w) {
  var id = String(w.id || '');
  if (!/^c-[a-z0-9-]{3,40}$/.test(id)) return null;
  var word = clip_(w.word, 120).trim();
  var meaning = clip_(w.meaning, 500).trim();
  if (!word || !meaning) return null;
  var colls = Array.isArray(w.collocations) ? w.collocations : String(w.collocations || '').split(/\n| \| /);
  return {
    id: id, word: word, pos: clip_(w.pos, 20).trim(),
    priority: [1, 2, 3].indexOf(Number(w.priority)) >= 0 ? Number(w.priority) : 2,
    meaning: meaning, nuance: clip_(w.nuance, 1000).trim(), example: clip_(w.example, 1000).trim(),
    collocations: colls.map(function (x) { return String(x).trim(); }).filter(Boolean).join(' | ').slice(0, MAX_CELL),
    root: clip_(w.root, 200).trim(),
    createdAt: clip_(w.createdAt, 40) || new Date().toISOString(),
    updatedAt: clip_(w.updatedAt, 40) || new Date().toISOString()
  };
}

function sanitizeSetting_(key, v) {
  if (key === 'newPerDay') {
    var n = parseInt(v, 10);
    return isNaN(n) ? 10 : Math.max(0, Math.min(50, n));
  }
  return v === true || v === 'true';
}

function pruneDaily_(daily, today) {
  var cutoff = Srs.addDays(today, -400);
  var out = {};
  Object.keys(daily).forEach(function (d) { if (d >= cutoff) out[d] = daily[d]; });
  return out;
}

function writeSettings_(ss, settings) {
  var st = readTable_(ss, 'settings');
  var old = st.rows.length;
  var keys = Object.keys(settings).sort(function (a, b) {
    var ia = a.charAt(0) === '_' ? 1 : 0, ib = b.charAt(0) === '_' ? 1 : 0;
    return ia - ib || (a < b ? -1 : a > b ? 1 : 0);
  });
  var rows = keys.map(function (k) {
    var v = JSON.stringify(settings[k]);
    return objToRow_(st, { key: k, value: v.length > 45000 ? '{}' : v });
  });
  writeBody_(st, rows, old);
}
