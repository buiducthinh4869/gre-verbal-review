/**
 * Api.js: điểm vào web app (chỉ trả JSON) và định tuyến action.
 *
 * Client gửi POST, Content-Type text/plain (tránh preflight CORS), body:
 *   { "action": "...", "token": "...", "payload": {...} }
 * Trả về { ok: true, data } hoặc { ok: false, error: { code, message } } (message tiếng Việt).
 *
 * Mọi action (trừ login) cần token hợp lệ; userId lấy từ token, không bao giờ từ payload.
 * Mọi action chạy trong LockService.getScriptLock() (chờ tối đa 10 giây).
 */

var LOCK_WAIT_MS = 10000;
var SETTING_KEYS = ['newPerDay', 'autoStart', 'thinkFirst', 'examMode', 'skipVocabIntro'];
// Danh sách hôm nay (đợt 02): todayNew:<YYYY-MM-DD> (từ mới cố định trong ngày), todayDue:<YYYY-MM-DD> (từ đến hạn đầu ngày).
// Giá trị là mảng id từ. Mỗi ngày một dòng mới trong tab settings; dòng cũ giữ nguyên (client bỏ qua khóa cũ hơn 7 ngày).
var DAY_LIST_KEY_RE = /^today(New|Due):\d{4}-\d{2}-\d{2}$/;
var DAY_LIST_MAX = 80;
function isSettingKey_(k) { return SETTING_KEYS.indexOf(k) >= 0 || DAY_LIST_KEY_RE.test(String(k || '')); }
var MAX_EVENTS = 100;
var MAX_CELL = 2000;

var ACTIONS = {
  login:             { auth: false, fn: function (ss, ctx, p) { return login_(ss, p); } },
  logout:            { allowMustChange: true, fn: function (ss, ctx) { return logout_(ss, ctx); } },
  me:                { allowMustChange: true, fn: function (ss, ctx) { return { user: publicUser_(ctx.user) }; } },
  setPassword:       { allowMustChange: true, fn: function (ss, ctx, p) { return setPassword_(ss, ctx, p); } },
  getState:          { fn: function (ss, ctx) { var st = readState_(ss, ctx.user.userId); st.user = publicUser_(ctx.user); st.content = safeContentForState_(ss, ctx.user); return st; } },
  saveEvents:        { fn: function (ss, ctx, p) { return saveEvents_(ss, ctx.user.userId, p && p.events); } },
  updateProfile:     { fn: function (ss, ctx, p) { return updateProfile_(ss, ctx, p); } },
  saveSettings:      { fn: function (ss, ctx, p) { return saveEvents_(ss, ctx.user.userId, settingEvents_(p && p.settings)); } },
  addCustomWord:     { fn: function (ss, ctx, p) { return saveEvents_(ss, ctx.user.userId, [customEvent_('custom_upsert', p && p.word)]); } },
  updateCustomWord:  { fn: function (ss, ctx, p) { return saveEvents_(ss, ctx.user.userId, [customEvent_('custom_upsert', p && p.word)]); } },
  deleteCustomWord:  { fn: function (ss, ctx, p) { return saveEvents_(ss, ctx.user.userId, [customEvent_('custom_delete', { id: p && p.id })]); } },
  saveMock:          { fn: function (ss, ctx, p) { return saveMock_(ss, ctx.user.userId, p); } },
  getMocks:          { fn: function (ss, ctx, p) { return getMocks_(ss, ctx.user.userId, p); } },
  submitSuggestion:  { fn: function (ss, ctx, p) { return submitSuggestion_(ss, ctx, p); } },
  listMySuggestions: { fn: function (ss, ctx) { return listMySuggestions_(ss, ctx); } },
  adminSaveOverride: { admin: true, fn: function (ss, ctx, p) { return adminSaveOverride_(ss, ctx, p); } },
  adminRevertChange: { admin: true, fn: function (ss, ctx, p) { return adminRevertChange_(ss, ctx, p); } },
  adminHideExercise: { admin: true, fn: function (ss, ctx, p) { return adminHideExercise_(ss, ctx, p); } },
  adminListHistory:  { admin: true, fn: function (ss, ctx, p) { return adminListHistory_(ss, ctx, p); } },
  adminListSuggestions: { admin: true, fn: function (ss) { return adminListSuggestions_(ss); } },
  adminReviewSuggestion: { admin: true, fn: function (ss, ctx, p) { return adminReviewSuggestion_(ss, ctx, p); } },
  adminExportOverrides: { admin: true, fn: function (ss) { return adminExportOverrides_(ss); } },
  adminMarkOverridesBaked: { admin: true, fn: function (ss, ctx, p) { return adminMarkOverridesBaked_(ss, ctx, p); } },
  adminListUsers:    { admin: true, fn: function (ss, ctx) { return adminListUsers_(ss); } },
  adminSetActive:    { admin: true, fn: function (ss, ctx, p) { return adminSetActive_(ss, ctx, p); } },
  adminResetPassword:{ admin: true, fn: function (ss, ctx, p) { return adminResetPassword_(ss, ctx, p); } },
  adminRenameUser:   { admin: true, fn: function (ss, ctx, p) { return adminRenameUser_(ss, ctx, p); } }
};

function doGet() {
  return json_({ ok: true, service: 'gre-verbal-api' });
}

function doPost(e) {
  var out;
  try {
    var body = parseBody_(e);
    var action = String(body.action || '');
    if (action.indexOf('cli.') === 0) {
      out = { ok: true, data: cliRoute_(action, body) };
    } else {
      out = { ok: true, data: route_(action, body) };
    }
  } catch (err) {
    out = { ok: false, error: toError_(err) };
  }
  return json_(out);
}

function route_(action, body) {
  var def = ACTIONS[action];
  if (!def) fail_('bad_request', 'Thao tác không hợp lệ.');
  if (!schemaReady_()) fail_('not_ready', 'Hệ thống đang được nâng cấp. Thử lại sau ít phút.');
  return withLock_(function () {
    var ss = openSs_();
    var ctx = {};
    if (def.auth !== false) {
      ctx = authenticate_(ss, body.token);
      if (ctx.user.mustChangePassword && !def.allowMustChange) fail_('must_change_password', 'Bạn cần đặt mật khẩu mới trước khi tiếp tục.');
      if (def.admin && ctx.user.role !== 'admin') fail_('forbidden', 'Chỉ người quản lý mới làm được việc này.');
    }
    var payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
    return def.fn(ss, ctx, payload);
  });
}

/** Nội dung sửa cho getState; lỗi đọc (vd tab chưa có) không được làm hỏng getState. */
function safeContentForState_(ss, user) {
  try { return contentForState_(ss, user); } catch (e) { console.error(e && e.stack ? e.stack : e); return { overrides: [], corrected: [], pending: 0 }; }
}

/* ---------------- Tiện ích chung ---------------- */

function fail_(code, message) {
  var e = new Error(message);
  e.code = code;
  throw e;
}

function toError_(err) {
  if (err && err.code) return { code: err.code, message: err.message };
  console.error(err && err.stack ? err.stack : err);
  return { code: 'server_error', message: 'Lỗi máy chủ. Thử lại sau.' };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function parseBody_(e) {
  var raw = e && e.postData && e.postData.contents;
  if (!raw) fail_('bad_request', 'Thiếu dữ liệu gửi lên.');
  if (raw.length > 500000) fail_('bad_request', 'Dữ liệu gửi lên quá lớn.');
  try {
    var b = JSON.parse(raw);
    if (!b || typeof b !== 'object') throw new Error('x');
    return b;
  } catch (err) {
    fail_('bad_request', 'Dữ liệu gửi lên không phải JSON hợp lệ.');
  }
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) fail_('busy', 'Máy chủ đang bận. Thử lại sau giây lát.');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function clip_(v, n) {
  if (v == null) return '';
  return String(v).slice(0, n || MAX_CELL);
}

/* ---------------- Lưu sự kiện ---------------- */

function settingEvents_(obj) {
  var ts = new Date().toISOString();
  return Object.keys(obj || {}).map(function (k, i) {
    return { id: 'set-' + k + '-' + Date.now() + '-' + i, type: 'setting', ts: ts, key: k, value: obj[k] };
  });
}

function customEvent_(type, w) {
  w = w || {};
  var ts = new Date().toISOString();
  if (type === 'custom_upsert') {
    w.updatedAt = ts;
    w.createdAt = w.createdAt || ts;
    return { id: 'cw-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8), type: type, ts: ts, word: w };
  }
  return { id: 'cd-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8), type: type, ts: ts, wordId: w.id };
}

/**
 * Nhận một lô sự kiện từ hàng đợi của client (đã có token). Loại sự kiện:
 *  - review: {id, type, ts, day, wordId, mode, result, exerciseId, chosen, device, isNew, state}
 *  - custom_upsert: {id, type, ts, word}
 *  - custom_delete: {id, type, ts, wordId}
 *  - setting: {id, type, ts, key, value}
 * Gộp theo updatedAt: với mỗi (userId, wordId), bản mới hơn thắng. Trả về trạng thái mới nhất của các từ liên quan.
 * Sự kiện trùng id (gửi lại sau lỗi mạng) bị bỏ qua trong 6 giờ.
 */
function saveEvents_(ss, userId, events) {
  if (!Array.isArray(events)) fail_('bad_request', 'events phải là mảng.');
  events = events.filter(function (e) { return e && typeof e.id === 'string' && e.id.length <= 80; }).slice(0, MAX_EVENTS);

  var cache = CacheService.getScriptCache();
  var keyOf = function (e) { return 'ev_' + userId + '_' + e.id; };
  var seen = events.length ? cache.getAll(events.map(keyOf)) : {};
  var fresh = events.filter(function (e) { return !seen[keyOf(e)]; });

  var now = Date.now();
  var serverToday = vnDate_(now);
  var touched = {};

  var pt = null, progIdx = null, progChanged = [];
  function loadProgress() {
    if (pt) return;
    pt = table_(ss, 'progress');
    progIdx = {};
    userRows_(pt, userId).forEach(function (i) { progIdx[cell_(pt, pt.rows[i], 'wordId')] = i; });
  }

  var stt = table_(ss, 'settings');
  var setIdx = {};
  userRows_(stt, userId).forEach(function (i) { setIdx[cell_(stt, stt.rows[i], 'key')] = i; });
  var setVal = function (k) {
    var i = setIdx[k];
    if (i == null) return undefined;
    try { return JSON.parse(cell_(stt, stt.rows[i], 'value')); } catch (e) { return undefined; }
  };
  var daily = setVal('_daily') || {};
  var exLast = setVal('_exLast') || {};
  var exRes = setVal('_exRes') || {};
  var dailyChanged = false, exChanged = false, resChanged = false, settingPatch = {};

  var ct = null, custIdx = null, custChanged = [], custNew = [];
  function loadCustom() {
    if (ct) return;
    ct = table_(ss, 'custom_words');
    custIdx = {};
    userRows_(ct, userId).forEach(function (i) { custIdx[cell_(ct, ct.rows[i], 'id')] = i; });
  }

  var logObjs = [], progNew = [];

  fresh.forEach(function (ev) {
    var tsMs = Date.parse(ev.ts);
    if (isNaN(tsMs) || tsMs > now + 5 * 60000) tsMs = now; // không tin giờ thiết bị chạy trước server
    var day = isDateStr_(ev.day) && ev.day <= serverToday ? ev.day : vnDate_(tsMs);

    if (ev.type === 'review') {
      var wordId = clip_(ev.wordId, 80);
      logObjs.push({
        userId: userId, timestamp: vnStamp_(tsMs), wordId: wordId, mode: clip_(ev.mode, 20), result: clip_(ev.result, 20),
        exerciseId: clip_(ev.exerciseId, 40), chosen: clip_(Array.isArray(ev.chosen) ? ev.chosen.join(' | ') : ev.chosen, 300),
        device: clip_(ev.device, 40), eventId: ev.id
      });
      var d = daily[day] || (daily[day] = { r: 0, n: 0 });
      d.r += 1;
      if (ev.isNew) d.n += 1;
      dailyChanged = true;
      if (ev.exerciseId) {
        var iso = new Date(tsMs).toISOString();
        var exId = clip_(ev.exerciseId, 40);
        if (!exLast[exId] || exLast[exId] < iso) { exLast[exId] = iso; exChanged = true; }
        // kết quả gần nhất của từng bài GRE (để Thi thử ưu tiên câu chưa làm / làm sai): [ngày, 1 đúng | 0 sai]
        if ((ev.result === 'good' || ev.result === 'again') && !/^scale:/.test(exId)) {
          var prevRes = exRes[exId];
          if (!prevRes || !(prevRes[0] > day)) { exRes[exId] = [day, ev.result === 'good' ? 1 : 0]; resChanged = true; }
        }
      }
      if (ev.state && wordId && /^[A-Za-z0-9_.-]{1,80}$/.test(wordId)) {
        loadProgress();
        var incoming = normalizeState_(ev.state);
        incoming.wordId = wordId;
        if (!incoming.updatedAt || Date.parse(incoming.updatedAt) > now + 5 * 60000) incoming.updatedAt = new Date(tsMs).toISOString();
        var obj = stateToRow_(incoming);
        obj.userId = userId;
        var i = progIdx[wordId];
        if (i == null) {
          var pending = progNew.filter(function (x) { return x.wordId === wordId; })[0];
          if (!pending) progNew.push(obj);
          else if (String(obj.updatedAt) > String(pending.updatedAt)) progNew[progNew.indexOf(pending)] = obj;
        } else {
          var cur = normalizeState_(rowObj_(pt, pt.rows[i]));
          if (incoming.updatedAt > cur.updatedAt) {
            pt.rows[i] = mergeRow_(pt, pt.rows[i], obj);
            progChanged.push(i);
          }
        }
        touched[wordId] = true;
      }
    } else if (ev.type === 'custom_upsert' && ev.word) {
      loadCustom();
      var w = sanitizeCustom_(ev.word);
      if (!w) return;
      w.userId = userId;
      var j = custIdx[w.id];
      if (j == null) {
        var dup = custNew.filter(function (x) { return x.id === w.id; })[0];
        if (dup) custNew[custNew.indexOf(dup)] = w; else custNew.push(w);
      } else {
        var oldU = cell_(ct, ct.rows[j], 'updatedAt');
        if (!oldU || w.updatedAt >= oldU) {
          w.createdAt = cell_(ct, ct.rows[j], 'createdAt') || w.createdAt;
          w.deletedAt = '';
          ct.rows[j] = mergeRow_(ct, ct.rows[j], w);
          custChanged.push(j);
        }
      }
    } else if (ev.type === 'custom_delete' && ev.wordId) {
      loadCustom();
      var k = custIdx[String(ev.wordId)];
      if (k != null) {
        ct.rows[k] = mergeRow_(ct, ct.rows[k], { deletedAt: new Date(tsMs).toISOString(), updatedAt: new Date(tsMs).toISOString() });
        custChanged.push(k);
      }
      custNew = custNew.filter(function (x) { return x.id !== String(ev.wordId); });
    } else if (ev.type === 'setting' && isSettingKey_(ev.key)) {
      settingPatch[ev.key] = sanitizeSetting_(ev.key, ev.value);
    }
  });

  // ---- ghi Sheet: chỉ dòng của người này, thêm dòng mới ở cuối
  if (pt) {
    writeRows_(pt, progChanged);
    appendObjs_(pt, progNew);
    progNew.forEach(function (o, k) { progIdx[o.wordId] = pt.rows.length - progNew.length + k; });
  }
  if (logObjs.length) appendObjs_(header_(ss, 'log'), logObjs);
  if (ct) {
    writeRows_(ct, custChanged);
    appendObjs_(ct, custNew);
  }
  if (dailyChanged) settingPatch._daily = pruneDaily_(daily, serverToday);
  if (exChanged) settingPatch._exLast = exLast;
  if (resChanged) settingPatch._exRes = exRes;
  var setChanged = [], setNew = [];
  Object.keys(settingPatch).forEach(function (key) {
    var v = JSON.stringify(settingPatch[key]);
    if (v.length > 45000) return;
    var i = setIdx[key];
    if (i == null) setNew.push({ userId: userId, key: key, value: v });
    else { stt.rows[i] = mergeRow_(stt, stt.rows[i], { value: v }); setChanged.push(i); }
  });
  writeRows_(stt, setChanged);
  appendObjs_(stt, setNew);

  if (fresh.length) {
    var put = {};
    fresh.forEach(function (e) { put[keyOf(e)] = '1'; });
    cache.putAll(put, 21600);
  }

  var states = {};
  if (pt) Object.keys(touched).forEach(function (id) {
    var i = progIdx[id];
    if (i != null && pt.rows[i]) states[id] = normalizeState_(rowObj_(pt, pt.rows[i]));
  });
  return { saved: fresh.length, duplicate: events.length - fresh.length, states: states, nowMs: Date.now(), today: serverToday };
}

function sanitizeCustom_(w) {
  var id = String(w.id || '');
  if (!/^c-[a-z0-9-]{3,40}$/.test(id)) return null;
  var word = clip_(w.word, 120).trim();
  var meaning = clip_(w.meaning, 500).trim();
  if (!word || !meaning) return null;
  var colls = Array.isArray(w.collocations) ? w.collocations : String(w.collocations || '').split(/\n| \| /);
  var now = new Date().toISOString();
  return {
    id: id, word: word, pos: clip_(w.pos, 20).trim(),
    priority: [1, 2, 3].indexOf(Number(w.priority)) >= 0 ? Number(w.priority) : 2,
    meaning: meaning, nuance: clip_(w.nuance, 1000).trim(), example: clip_(w.example, 1000).trim(),
    collocations: colls.map(function (x) { return String(x).trim(); }).filter(Boolean).join(' | ').slice(0, MAX_CELL),
    root: clip_(w.root, 200).trim(),
    createdAt: clip_(w.createdAt, 40) || now,
    updatedAt: clip_(w.updatedAt, 40) || now
  };
}

function sanitizeSetting_(key, v) {
  if (DAY_LIST_KEY_RE.test(String(key))) {
    var out = [];
    (Array.isArray(v) ? v : []).forEach(function (id) {
      if (typeof id !== 'string') return;
      if (/^[a-z0-9][a-z0-9-]{0,79}$/.test(id) && out.indexOf(id) < 0 && out.length < DAY_LIST_MAX) out.push(id);
    });
    return out;
  }
  if (key === 'newPerDay') {
    var n = parseInt(v, 10);
    return isNaN(n) ? 10 : Math.max(0, Math.min(50, n));
  }
  return v === true || v === 'true';
}

function pruneDaily_(daily, today) {
  var cutoff = addDays_(today, -400);
  var out = {};
  Object.keys(daily).forEach(function (d) { if (d >= cutoff) out[d] = daily[d]; });
  return out;
}

/* ---------------- Thi thử ---------------- */

var MOCK_MODES = ['s1', 's2', 'full', 'fixed'];

/**
 * Khóa của MỘT lần làm. Đề ngẫu nhiên: mockId là mã riêng của lần làm. Đề cố định (mode = 'fixed'): mockId là id đề
 * (vd 'mock-01'), làm lại nhiều lần cùng mockId, nên thêm thời điểm bắt đầu để phân biệt các lần làm.
 */
function mockAttemptKey_(mockId, mode, startedStamp) {
  return mode === 'fixed' ? mockId + '@' + startedStamp : mockId;
}

/** "dd/MM/yyyy HH:mm:ss" (giờ VN) → ms; không đọc được thì 0. */
function parseVnStamp_(s) {
  var m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return 0;
  return Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]) - 7 * 3600 * 1000;
}

/** Thời điểm client gửi lên: không tin giờ thiết bị chạy trước server; sai định dạng thì lấy giờ server. */
function clampMs_(v, now) {
  var n = Number(v);
  if (!isFinite(n) || n <= 0 || n > now + 5 * 60000 || n < now - 400 * 86400000) return now;
  return n;
}

/**
 * Lưu kết quả một bài thi thử: mỗi section một dòng trong tab mocks (chỉ THÊM dòng, không sửa dòng nào).
 * p: {mockId, mode, startedAt (ms), finishedAt (ms), sections: [{section, score, total, durationSec, items: [{i, c, ok, t}]}]}
 * Gửi lại cùng mockId + section (mất mạng rồi thử lại) thì bỏ qua, không ghi trùng.
 */
function saveMock_(ss, userId, p) {
  var mockId = String(p.mockId || '');
  if (!/^[A-Za-z0-9_-]{6,60}$/.test(mockId)) fail_('bad_request', 'mockId không hợp lệ.');
  var mode = MOCK_MODES.indexOf(p.mode) >= 0 ? p.mode : '';
  if (!mode) fail_('bad_request', 'Loại bài thi thử không hợp lệ.');
  if (!Array.isArray(p.sections) || !p.sections.length || p.sections.length > 2) fail_('bad_request', 'sections không hợp lệ.');
  if (!ss.getSheetByName('mocks')) fail_('not_ready', 'Chưa có tab mocks. Báo người quản lý.');
  var t = table_(ss, 'mocks');
  var have = {};
  userRows_(t, userId).forEach(function (i) {
    var r = t.rows[i];
    have[mockAttemptKey_(String(cell_(t, r, 'mockId')), String(cell_(t, r, 'mode')), String(cell_(t, r, 'startedAt'))) + '#' + cell_(t, r, 'section')] = true;
  });
  var now = Date.now();
  var started = clampMs_(p.startedAt, now), finished = clampMs_(p.finishedAt, now);
  var attempt = mockAttemptKey_(mockId, mode, vnStamp_(started));
  var rows = [];
  p.sections.forEach(function (sec) {
    sec = sec || {};
    var n = clampInt_(sec.section, 1, 2);
    if (have[attempt + '#' + n]) return;
    var items = Array.isArray(sec.items) ? sec.items.slice(0, 40).map(function (x) {
      x = x || {};
      return { i: clip_(x.i, 40), c: clip_(x.c, 200), ok: x.ok ? 1 : 0, t: clampInt_(x.t, 0, 7200) };
    }) : [];
    var json = JSON.stringify(items);
    if (json.length > 45000) json = JSON.stringify(items.map(function (x) { return { i: x.i, ok: x.ok, t: x.t }; }));
    rows.push({
      userId: userId, mockId: mockId, startedAt: vnStamp_(started), finishedAt: vnStamp_(finished), mode: mode, section: n,
      score: clampInt_(sec.score, 0, 40), total: clampInt_(sec.total, 0, 40), durationSec: clampInt_(sec.durationSec, 0, 7200), items: json
    });
    have[attempt + '#' + n] = true;
  });
  appendObjs_(t, rows);
  return { saved: rows.length, mockId: mockId };
}

/** Các bài thi thử của chính người đang đăng nhập (lọc theo userId của phiên), mới nhất trước, gộp section theo mockId. */
function getMocks_(ss, userId, p) {
  if (!ss.getSheetByName('mocks')) return { mocks: [] };
  var t = table_(ss, 'mocks');
  var by = {}, order = [];
  userRows_(t, userId).forEach(function (i) {
    var o = rowObj_(t, t.rows[i]);
    var id = String(o.mockId || '');
    if (!id) return;
    var key = mockAttemptKey_(id, String(o.mode || ''), String(o.startedAt || ''));
    var m = by[key];
    if (!m) {
      m = by[key] = { mockId: id, mode: String(o.mode || ''), startedAt: String(o.startedAt || ''), finishedAt: String(o.finishedAt || ''), startedMs: parseVnStamp_(o.startedAt), sections: [] };
      order.push(m);
    }
    var items = [];
    try { items = JSON.parse(o.items || '[]'); } catch (e) { items = []; }
    m.sections.push({ section: clampInt_(o.section, 1, 2), score: clampInt_(o.score, 0, 99), total: clampInt_(o.total, 0, 99), durationSec: clampInt_(o.durationSec, 0, 99999), items: items });
  });
  order.forEach(function (m) { m.sections.sort(function (a, b) { return a.section - b.section; }); });
  order.sort(function (a, b) { return b.startedMs - a.startedMs; });
  var limit = (p && p.limit) ? clampInt_(p.limit, 1, 50) : 20;
  // giới hạn chỉ áp dụng cho đề ngẫu nhiên; mọi lần làm đề cố định luôn được trả về (web dùng để biết đề nào đã làm)
  var n = 0;
  return { mocks: order.filter(function (m) { return m.mode === 'fixed' || n++ < limit; }) };
}
