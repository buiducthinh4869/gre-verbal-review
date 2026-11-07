/**
 * Content.js: sửa nội dung trực tiếp (quản trị viên) và đề xuất sửa (mọi người dùng đã đăng nhập).
 *
 * Ba tab MỚI (chỉ thêm, tạo bằng cli.ensureContent; không đụng tab cũ):
 *  - content_overrides: bản sửa đang áp dụng, mỗi (targetType, targetId, field) một dòng. Web ghép đè lên file JSON gốc.
 *  - content_history:   lịch sử thay đổi. CHỈ THÊM DÒNG, không bao giờ sửa hay xóa.
 *  - suggestions:       đề xuất sửa của người dùng và kết quả duyệt.
 *
 * Mọi action ghi chạy trong LockService (route_); mọi action admin* kiểm tra role = admin ở server (route_);
 * userId luôn lấy từ token. File JSON gốc không bao giờ bị ghi từ đây.
 * Quy tắc hợp lệ là bản viết lại tối thiểu của assets/validate.js (cùng câu báo lỗi).
 */

var OVERRIDE_HEADERS = ['targetType', 'targetId', 'field', 'value', 'version', 'active', 'editedBy', 'editedAt', 'note'];
var HISTORY_HEADERS = ['changeId', 'targetType', 'targetId', 'field', 'before', 'after', 'source', 'changedBy', 'changedAt'];
var SUGGESTION_HEADERS = ['suggestionId', 'userId', 'targetType', 'targetId', 'field', 'currentValue', 'proposedValue', 'reason', 'sourceUrl', 'status', 'reviewerNote', 'createdAt', 'reviewedAt', 'changeId'];
var CONTENT_TABS = { content_overrides: OVERRIDE_HEADERS, content_history: HISTORY_HEADERS, suggestions: SUGGESTION_HEADERS };

var EDITABLE_FIELDS = {
  word: ['word', 'pos', 'meaning', 'nuance', 'example', 'collocations', 'root', 'confusables', 'priority', 'level'],
  exercise: ['sentence', 'blanks', 'options', 'answers', 'targets', 'hint', 'explanation', 'hidden', 'difficulty', 'skills']
};
var SKILL_CODES = ['contrast', 'continuation', 'degree', 'secondary-meaning', 'lookalike', 'collocation', 'nuance'];

/** difficulty (tùy chọn): 1, 2 hoặc 3; skills (tùy chọn): danh sách không rỗng các mã trong SKILL_CODES (khớp assets/validate.js). */
function difficultySkillErrs_(difficulty, skills) {
  var errs = [];
  if (difficulty != null && [1, 2, 3].indexOf(difficulty) < 0) errs.push('Độ khó phải là 1 (dễ), 2 (vừa) hoặc 3 (khó)');
  if (skills != null) {
    if (!isStrArr_(skills) || !skills.length) errs.push('Kỹ năng phải là danh sách không rỗng');
    else {
      skills.forEach(function (k) { if (SKILL_CODES.indexOf(k) < 0) errs.push('Kỹ năng `' + k + '` không có trong bảng kỹ năng'); });
      if (skills.some(function (k, i) { return skills.indexOf(k) !== i; })) errs.push('Kỹ năng bị trùng');
    }
  }
  return errs;
}
var SOURCE_REQUIRED = ['meaning', 'nuance'];
var REPORT_KINDS = ['two_correct', 'wrong_answer', 'wrong_explanation', 'other'];
var SUGGESTIONS_PER_DAY = 20;
var CONTENT_CACHE_KEY = 'content_bundle_v1';
var CONTENT_ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

/* ---------------- Tab ---------------- */

/** Tạo các tab nội dung nếu chưa có, đặt ở CUỐI file. Chạy lại vô hại; không đụng tab nào khác. */
function ensureContentTabs_(ss) {
  var created = [];
  Object.keys(CONTENT_TABS).forEach(function (name) {
    if (ss.getSheetByName(name)) return;
    var want = CONTENT_TABS[name];
    var sh = ss.insertSheet(name, ss.getSheets().length);
    if (sh.getMaxColumns() < want.length) sh.insertColumnsAfter(sh.getMaxColumns(), want.length - sh.getMaxColumns());
    sh.getRange(1, 1, sh.getMaxRows(), want.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, want.length).setValues([want]).setFontWeight('bold');
    sh.setFrozenRows(1);
    created.push(name);
  });
  return { created: created };
}

function contentReady_(ss) {
  return Object.keys(CONTENT_TABS).every(function (n) { return !!ss.getSheetByName(n); });
}
function requireContent_(ss) {
  if (!contentReady_(ss)) fail_('not_ready', 'Chức năng sửa nội dung chưa được bật. Báo người quản lý.');
}

/* ---------------- Tiện ích ---------------- */

function jsonParse_(s, dflt) {
  if (s === '' || s == null) return dflt;
  try { return JSON.parse(s); } catch (e) { return dflt; }
}
function jsonCell_(v) {
  var s = JSON.stringify(v === undefined ? null : v);
  if (s.length > 45000) fail_('bad_request', 'Nội dung quá dài.');
  return s;
}
/** Văn bản người dùng gõ: chặn Sheet hiểu thành công thức (=, +, -, @ ở đầu). */
function safeText_(v, n) {
  var s = clip_(v, n).trim();
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function sameJson_(a, b) {
  return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
}
function newId_(prefix) {
  return prefix + Utilities.formatDate(new Date(), TZ, 'yyyyMMddHHmmss') + '-' + Math.random().toString(36).slice(2, 7);
}
function usernames_(ss) {
  var ut = table_(ss, 'users');
  var map = {};
  ut.rows.forEach(function (r) { var id = cell_(ut, r, 'userId'); if (id) map[id] = cell_(ut, r, 'username') || id; });
  return map;
}
function isTrue_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }

/* ---------------- Kiểm tra hợp lệ (tối thiểu, tương đương assets/validate.js) ---------------- */

function isStrArr_(v) { return Array.isArray(v) && v.every(function (x) { return typeof x === 'string'; }); }
function placeholders_(s) {
  var found = {}, re = /\{(\d+)\}/g, m;
  while ((m = re.exec(String(s || '')))) found[m[1]] = true;
  return Object.keys(found).map(Number).sort(function (a, b) { return a - b; });
}
function optionErrs_(opts, label, errs) {
  var seen = {};
  opts.forEach(function (o) {
    var k = String(o).trim().toLowerCase();
    if (!k) errs.push(label + ': có phương án để trống');
    else if (seen[k]) errs.push(label + ': phương án "' + o + '" bị trùng');
    seen[k] = true;
  });
}

function validateWordServer_(w) {
  var errs = [];
  [['word', 'Từ', 120], ['pos', 'Loại từ', 20], ['meaning', 'Nghĩa', 500]].forEach(function (x) {
    if (typeof w[x[0]] !== 'string' || !w[x[0]].trim()) errs.push(x[1] + ' không được để trống');
    else if (w[x[0]].length > x[2]) errs.push(x[1] + ' quá dài (tối đa ' + x[2] + ' ký tự)');
  });
  [['nuance', 'Sắc thái', 2000], ['example', 'Ví dụ', 2000], ['root', 'Gốc từ', 300]].forEach(function (x) {
    if (w[x[0]] == null) return;
    if (typeof w[x[0]] !== 'string') errs.push(x[1] + ' phải là văn bản');
    else if (w[x[0]].length > x[2]) errs.push(x[1] + ' quá dài (tối đa ' + x[2] + ' ký tự)');
  });
  if ([1, 2, 3].indexOf(w.priority) < 0) errs.push('Mức ưu tiên phải là 1, 2 hoặc 3');
  if (w.level != null && !(w.level === 1 || w.level === 2 || w.level === 3 || w.level === 4)) errs.push('Mức trên thang phải là số nguyên từ 1 đến 4');
  if (w.collocations != null) {
    if (!isStrArr_(w.collocations)) errs.push('Collocation phải là danh sách văn bản');
    else if (w.collocations.length > 20 || w.collocations.some(function (x) { return !x.trim() || x.length > 120; })) errs.push('Collocation không hợp lệ (tối đa 20 mục, mỗi mục 1–120 ký tự)');
  }
  if (w.confusables != null) {
    if (!isStrArr_(w.confusables) || w.confusables.length > 10) errs.push('Từ dễ nhầm phải là danh sách id từ (tối đa 10)');
    else w.confusables.forEach(function (id) {
      if (id === w.id) errs.push('Từ dễ nhầm không được trỏ về chính từ này');
      else if (!CONTENT_ID_RE.test(id)) errs.push('Từ dễ nhầm `' + id + '` không tồn tại');
    });
  }
  return errs;
}

function validateExerciseServer_(ex) {
  var errs = [];
  if (typeof ex.sentence !== 'string' || !ex.sentence.trim()) errs.push('Câu không được để trống');
  else if (ex.sentence.length > 2000) errs.push('Câu quá dài (tối đa 2000 ký tự)');
  if (!isStrArr_(ex.targets) || !ex.targets.length) errs.push('Cần ít nhất một từ đích (targets)');
  else ex.targets.forEach(function (t) { if (!CONTENT_ID_RE.test(t)) errs.push('Từ đích `' + t + '` không tồn tại'); });
  [['hint', 'Gợi ý', 2000], ['explanation', 'Giải thích', 3000]].forEach(function (x) {
    if (ex[x[0]] == null) return;
    if (typeof ex[x[0]] !== 'string') errs.push(x[1] + ' phải là văn bản');
    else if (ex[x[0]].length > x[2]) errs.push(x[1] + ' quá dài (tối đa ' + x[2] + ' ký tự)');
  });
  if (ex.hidden != null && typeof ex.hidden !== 'boolean') errs.push('Trạng thái ẩn phải là có hoặc không');
  difficultySkillErrs_(ex.difficulty, ex.skills).forEach(function (e) { errs.push(e); });
  var ph = placeholders_(ex.sentence);
  if (ex.type === 'tc') {
    var blanks = ex.blanks;
    if (!Array.isArray(blanks) || !blanks.length || blanks.length > 3) { errs.push('Câu TC phải có từ 1 đến 3 chỗ trống'); return errs; }
    if (ph.length !== blanks.length || ph.some(function (n, k) { return n !== k; })) errs.push('`{0}` trong câu không khớp số chỗ trống');
    var want = blanks.length === 1 ? 5 : 3;
    blanks.forEach(function (b, k) {
      var label = blanks.length > 1 ? 'Chỗ trống ' + (k + 1) : 'Phương án';
      if (!b || !isStrArr_(b.options)) { errs.push(label + ': thiếu danh sách phương án'); return; }
      if (b.options.length !== want) errs.push('Câu TC ' + blanks.length + ' chỗ trống cần đúng ' + want + ' phương án mỗi chỗ');
      optionErrs_(b.options, label, errs);
      if (typeof b.answer !== 'string' || b.options.indexOf(b.answer) < 0) errs.push('Đáp án phải nằm trong danh sách phương án');
    });
  } else if (ex.type === 'se') {
    if (ph.length !== 1 || ph[0] !== 0) errs.push('`{0}` trong câu không khớp số chỗ trống: câu SE cần đúng một chỗ {0}');
    if (!(isStrArr_(ex.options) && ex.options.length === 6 && isStrArr_(ex.answers) && ex.answers.length === 2)) errs.push('Câu SE phải có đúng 6 phương án và đúng 2 đáp án');
    if (isStrArr_(ex.options)) optionErrs_(ex.options, 'Phương án', errs);
    if (isStrArr_(ex.answers)) {
      if (ex.answers.length === 2 && ex.answers[0] === ex.answers[1]) errs.push('Hai đáp án SE trùng nhau');
      if (ex.answers.some(function (a) { return !isStrArr_(ex.options) || ex.options.indexOf(a) < 0; })) errs.push('Đáp án phải nằm trong danh sách phương án');
    }
  } else {
    errs.push('Loại câu phải là TC hoặc SE');
  }
  return errs;
}

function failInvalid_(errs) {
  var e = new Error('Không lưu được: ' + errs.slice(0, 3).join('; ') + (errs.length > 3 ? ' (và ' + (errs.length - 3) + ' lỗi khác)' : '') + '.');
  e.code = 'invalid';
  throw e;
}

function checkTarget_(targetType, targetId) {
  if (!EDITABLE_FIELDS[targetType]) fail_('bad_request', 'Loại nội dung không hợp lệ.');
  if (!CONTENT_ID_RE.test(String(targetId || ''))) fail_('bad_request', 'Mã từ hoặc mã câu không hợp lệ.');
}

/* ---------------- Đọc ---------------- */

function overrideTable_(ss) { return table_(ss, 'content_overrides'); }

/** Các override đang áp dụng của một mục: {field: {i, value, version}}. */
function activeOverridesOf_(ot, targetType, targetId) {
  var out = {};
  ot.rows.forEach(function (r, i) {
    if (cell_(ot, r, 'targetType') !== targetType || cell_(ot, r, 'targetId') !== targetId) return;
    out[cell_(ot, r, 'field')] = { i: i, active: isTrue_(cell_(ot, r, 'active')), value: jsonParse_(cell_(ot, r, 'value'), null), version: parseInt(cell_(ot, r, 'version'), 10) || 0 };
  });
  return out;
}

/** Gói nội dung cho getState: overrides đang áp dụng + các mục đã đính chính. Có bộ nhớ đệm, xóa khi ghi. */
function readContent_(ss) {
  if (!contentReady_(ss)) return { overrides: [], corrected: [] };
  var cache = CacheService.getScriptCache();
  var hit = cache.get(CONTENT_CACHE_KEY);
  if (hit) { try { return JSON.parse(hit); } catch (e) { /* đọc lại */ } }
  var ot = overrideTable_(ss);
  var overrides = [];
  ot.rows.forEach(function (r) {
    if (!isTrue_(cell_(ot, r, 'active'))) return;
    var t = cell_(ot, r, 'targetType'), id = cell_(ot, r, 'targetId'), f = cell_(ot, r, 'field');
    if (!EDITABLE_FIELDS[t] || EDITABLE_FIELDS[t].indexOf(f) < 0) return;
    overrides.push({ t: t, id: id, f: f, v: jsonParse_(cell_(ot, r, 'value'), null), ver: parseInt(cell_(ot, r, 'version'), 10) || 1 });
  });
  var ht = table_(ss, 'content_history');
  var seen = {}, corrected = [];
  ht.rows.forEach(function (r) {
    if (cell_(ht, r, 'field') === 'hidden') return;
    var k = cell_(ht, r, 'targetType') + ':' + cell_(ht, r, 'targetId');
    if (cell_(ht, r, 'targetId') && !seen[k]) { seen[k] = true; corrected.push(k); }
  });
  var out = { overrides: overrides, corrected: corrected };
  var s = JSON.stringify(out);
  if (s.length < 90000) cache.put(CONTENT_CACHE_KEY, s, 21600);
  return out;
}
function dropContentCache_() { CacheService.getScriptCache().remove(CONTENT_CACHE_KEY); }

function pendingCount_(ss) {
  if (!ss.getSheetByName('suggestions')) return 0;
  var st = table_(ss, 'suggestions');
  return st.rows.filter(function (r) { return cell_(st, r, 'status') === 'pending'; }).length;
}

/** Phần nội dung trả về cùng getState. */
function contentForState_(ss, user) {
  var c = readContent_(ss);
  return { overrides: c.overrides, corrected: c.corrected, pending: user.role === 'admin' ? pendingCount_(ss) : 0 };
}

/* ---------------- Ghi thay đổi (dùng chung cho sửa trực tiếp, chấp nhận đề xuất, khôi phục, ẩn câu) ---------------- */

/**
 * p: {targetType, targetId, changes: {field: value}, resets: [field] (trả về dữ liệu gốc), base: bản gốc (JSON) của mục,
 *     note, source}. Ghép base + override đang áp dụng + thay đổi rồi kiểm tra hợp lệ cả mục; hợp lệ mới ghi.
 * Mỗi trường đổi: cập nhật / thêm một dòng content_overrides và THÊM một dòng content_history (cùng changeId).
 */
function applyContentChange_(ss, ctx, p) {
  requireContent_(ss);
  var targetType = String(p.targetType || ''), targetId = String(p.targetId || '');
  checkTarget_(targetType, targetId);
  var changes = p.changes && typeof p.changes === 'object' ? p.changes : {};
  var resets = Array.isArray(p.resets) ? p.resets.map(String) : [];
  var fields = Object.keys(changes).concat(resets);
  if (!fields.length) fail_('bad_request', 'Không có gì để lưu.');
  fields.forEach(function (f) { if (EDITABLE_FIELDS[targetType].indexOf(f) < 0) fail_('bad_request', 'Trường "' + f + '" không được phép sửa.'); });
  var base = p.base && typeof p.base === 'object' ? p.base : null;
  if (!base || base.id !== targetId) fail_('bad_request', 'Thiếu dữ liệu gốc của mục cần sửa.');
  if (targetType === 'exercise' && base.type !== 'tc' && base.type !== 'se') fail_('bad_request', 'Loại câu không hợp lệ.');

  var ot = overrideTable_(ss);
  var act = activeOverridesOf_(ot, targetType, targetId);
  var baseOf = function (f) { var v = base[f]; return v === undefined ? (f === 'hidden' ? false : null) : v; };
  var curOf = function (f) { return act[f] && act[f].active ? act[f].value : baseOf(f); };

  // mục sau khi đổi (để kiểm tra hợp lệ cả mục)
  var merged = JSON.parse(JSON.stringify(base));
  Object.keys(act).forEach(function (f) { if (act[f].active && EDITABLE_FIELDS[targetType].indexOf(f) >= 0) merged[f] = act[f].value; });
  Object.keys(changes).forEach(function (f) { merged[f] = changes[f]; });
  resets.forEach(function (f) { merged[f] = base[f]; });
  if (merged.level === null) delete merged.level;
  merged.id = targetId;
  var errs = targetType === 'word' ? validateWordServer_(merged) : validateExerciseServer_(merged);
  if (errs.length) failInvalid_(errs);

  var nowMs = Date.now(), stamp = vnStamp_(nowMs), changeId = newId_('ch-');
  var note = safeText_(p.note, 500);
  var source = String(p.source || 'admin-edit').slice(0, 80);
  var rowsChanged = [], rowsNew = [], hist = [], changed = [];
  fields.forEach(function (f) {
    var isReset = resets.indexOf(f) >= 0 && !(f in changes);
    var before = curOf(f);
    var after = isReset ? baseOf(f) : changes[f];
    var o = act[f];
    if (isReset) {
      if (!o || !o.active) return;              // vốn đã là dữ liệu gốc
      ot.rows[o.i] = mergeRow_(ot, ot.rows[o.i], { active: 'FALSE', editedBy: ctx.user.userId, editedAt: stamp, note: note });
      rowsChanged.push(o.i);
    } else {
      if (sameJson_(before, after)) return;     // không đổi gì
      var obj = { value: jsonCell_(after), active: 'TRUE', editedBy: ctx.user.userId, editedAt: stamp, note: note };
      if (o) { obj.version = o.version + 1; ot.rows[o.i] = mergeRow_(ot, ot.rows[o.i], obj); rowsChanged.push(o.i); }
      else { obj.targetType = targetType; obj.targetId = targetId; obj.field = f; obj.version = 1; rowsNew.push(obj); }
    }
    hist.push({ changeId: changeId, targetType: targetType, targetId: targetId, field: f, before: jsonCell_(before), after: jsonCell_(after),
      source: source, changedBy: ctx.user.userId, changedAt: stamp });
    changed.push(f);
  });
  if (!changed.length) return { changeId: '', changed: [], content: contentForState_(ss, ctx.user) };
  writeRows_(ot, rowsChanged);
  appendObjs_(ot, rowsNew);
  appendObjs_(header_(ss, 'content_history'), hist);
  dropContentCache_();
  return { changeId: changeId, changed: changed, content: contentForState_(ss, ctx.user) };
}

/* ---------------- Action quản trị ---------------- */

function adminSaveOverride_(ss, ctx, p) {
  return applyContentChange_(ss, ctx, { targetType: p.targetType, targetId: p.targetId, changes: p.changes, base: p.base, note: p.note, source: 'admin-edit' });
}

function adminHideExercise_(ss, ctx, p) {
  return applyContentChange_(ss, ctx, { targetType: 'exercise', targetId: p.exerciseId, changes: { hidden: p.hidden !== false }, base: p.base, note: p.note, source: 'admin-edit' });
}

/**
 * Khôi phục một thay đổi: tạo MỘT THAY ĐỔI MỚI (source revert:<changeId>) đưa các trường của thay đổi đó về giá trị
 * "trước" của nó. Nếu trước thay đổi đó trường chưa từng được sửa thì tắt override (trở về dữ liệu gốc).
 * Lịch sử cũ giữ nguyên.
 */
function adminRevertChange_(ss, ctx, p) {
  requireContent_(ss);
  var changeId = String(p.changeId || '');
  var ht = table_(ss, 'content_history');
  var mine = [];
  ht.rows.forEach(function (r, i) { if (cell_(ht, r, 'changeId') === changeId) mine.push(i); });
  if (!changeId || !mine.length) fail_('bad_request', 'Không tìm thấy thay đổi cần khôi phục.');
  var t = cell_(ht, ht.rows[mine[0]], 'targetType'), id = cell_(ht, ht.rows[mine[0]], 'targetId');
  var changes = {}, resets = [];
  mine.forEach(function (i) {
    var f = cell_(ht, ht.rows[i], 'field');
    var earlier = false;
    for (var k = 0; k < i; k++) {
      var r = ht.rows[k];
      if (cell_(ht, r, 'targetType') === t && cell_(ht, r, 'targetId') === id && cell_(ht, r, 'field') === f) { earlier = true; break; }
    }
    if (earlier) changes[f] = jsonParse_(cell_(ht, ht.rows[i], 'before'), null);
    else resets.push(f);
  });
  var out = applyContentChange_(ss, ctx, { targetType: t, targetId: id, changes: changes, resets: resets, base: p.base, note: p.note, source: 'revert:' + changeId });
  if (!out.changed.length) fail_('no_change', 'Nội dung hiện tại đã giống như trước thay đổi này.');
  return out;
}

function adminListHistory_(ss, ctx, p) {
  requireContent_(ss);
  var t = String(p.targetType || ''), id = String(p.targetId || '');
  checkTarget_(t, id);
  var ht = table_(ss, 'content_history');
  var names = usernames_(ss);
  var rows = [];
  ht.rows.forEach(function (r) {
    if (cell_(ht, r, 'targetType') !== t || cell_(ht, r, 'targetId') !== id) return;
    var by = cell_(ht, r, 'changedBy');
    rows.push({ changeId: cell_(ht, r, 'changeId'), field: cell_(ht, r, 'field'), before: jsonParse_(cell_(ht, r, 'before'), null),
      after: jsonParse_(cell_(ht, r, 'after'), null), source: cell_(ht, r, 'source'), changedBy: names[by] || by, changedAt: cell_(ht, r, 'changedAt') });
  });
  rows.reverse();
  return { history: rows.slice(0, 200) };
}

function adminExportOverrides_(ss) {
  requireContent_(ss);
  var ot = overrideTable_(ss);
  var names = usernames_(ss);
  var list = [];
  ot.rows.forEach(function (r) {
    if (!isTrue_(cell_(ot, r, 'active'))) return;
    var by = cell_(ot, r, 'editedBy');
    list.push({ targetType: cell_(ot, r, 'targetType'), targetId: cell_(ot, r, 'targetId'), field: cell_(ot, r, 'field'),
      value: jsonParse_(cell_(ot, r, 'value'), null), version: parseInt(cell_(ot, r, 'version'), 10) || 1,
      editedBy: names[by] || by, editedAt: cell_(ot, r, 'editedAt'), note: cell_(ot, r, 'note') });
  });
  var now = Date.now();
  return { date: vnDate_(now), exportedAt: vnStamp_(now), overrides: list };
}

/** Tắt (active = FALSE) các override đã đưa vào dữ liệu gốc. Chỉ tắt đúng phiên bản được gửi lên (bản sửa mới hơn vẫn giữ). */
function adminMarkOverridesBaked_(ss, ctx, p) {
  requireContent_(ss);
  var items = Array.isArray(p.items) ? p.items.slice(0, 2000) : [];
  var want = {};
  items.forEach(function (x) { if (x) want[x.targetType + ':' + x.targetId + ':' + x.field] = parseInt(x.version, 10) || 0; });
  var ot = overrideTable_(ss);
  var changed = [], stamp = vnStamp_(Date.now());
  ot.rows.forEach(function (r, i) {
    var k = cell_(ot, r, 'targetType') + ':' + cell_(ot, r, 'targetId') + ':' + cell_(ot, r, 'field');
    if (!(k in want) || !isTrue_(cell_(ot, r, 'active')) || (parseInt(cell_(ot, r, 'version'), 10) || 0) !== want[k]) return;
    ot.rows[i] = mergeRow_(ot, r, { active: 'FALSE', note: 'đã đưa vào dữ liệu gốc ' + stamp });
    changed.push(i);
  });
  writeRows_(ot, changed);
  if (changed.length) dropContentCache_();
  return { marked: changed.length, content: contentForState_(ss, ctx.user) };
}

/* ---------------- Đề xuất sửa ---------------- */

function suggestionValueErrs_(targetType, field, v) {
  if (field === '_report') {
    if (!v || typeof v !== 'object' || REPORT_KINDS.indexOf(v.kind) < 0) return ['Chọn loại lỗi'];
    if (v.text != null && (typeof v.text !== 'string' || v.text.length > 2000)) return ['Đề xuất sửa quá dài'];
    return [];
  }
  if (EDITABLE_FIELDS[targetType].indexOf(field) < 0) return ['Trường "' + field + '" không được phép sửa'];
  if (targetType === 'word') {
    var w = { word: 'x', pos: 'x', meaning: 'x', priority: 2 };
    w[field] = v;
    return validateWordServer_(w);
  }
  if (['sentence', 'hint', 'explanation'].indexOf(field) >= 0) return typeof v === 'string' && v.length <= 3000 ? [] : ['Nội dung không hợp lệ'];
  if (['options', 'answers', 'targets'].indexOf(field) >= 0) return isStrArr_(v) && v.length <= 10 ? [] : ['Nội dung không hợp lệ'];
  if (field === 'blanks') return Array.isArray(v) && v.length <= 3 && v.every(function (b) { return b && isStrArr_(b.options) && typeof b.answer === 'string'; }) ? [] : ['Nội dung không hợp lệ'];
  return ['Không đề xuất được trường này'];
}

function submitSuggestion_(ss, ctx, p) {
  requireContent_(ss);
  var t = String(p.targetType || ''), id = String(p.targetId || ''), field = String(p.field || '');
  checkTarget_(t, id);
  var errs = suggestionValueErrs_(t, field, p.proposedValue);
  if (errs.length) fail_('invalid', errs[0] + '.');
  if (field !== '_report' && sameJson_(p.currentValue, p.proposedValue)) fail_('invalid', 'Nội dung đề xuất giống hệt nội dung hiện tại.');
  var reason = String(p.reason || '').trim();
  if (reason.length < 10) fail_('invalid', 'Hãy ghi lý do (ít nhất 10 ký tự).');
  if (reason.length > 1000) fail_('invalid', 'Lý do quá dài (tối đa 1000 ký tự).');
  var url = String(p.sourceUrl || '').trim();
  if (url && (!/^https?:\/\/[^\s]+$/i.test(url) || url.length > 500)) fail_('invalid', 'Nguồn phải là một đường link bắt đầu bằng http:// hoặc https://');
  if (!url && SOURCE_REQUIRED.indexOf(field) >= 0) fail_('invalid', 'Đề xuất sửa nghĩa hoặc sắc thái cần kèm nguồn (link từ điển).');

  var st = table_(ss, 'suggestions');
  var todayVn = Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy');
  var nToday = userRows_(st, ctx.user.userId).filter(function (i) { return cell_(st, st.rows[i], 'createdAt').indexOf(todayVn) === 0; }).length;
  if (nToday >= SUGGESTIONS_PER_DAY) fail_('rate_limited', 'Bạn đã gửi ' + SUGGESTIONS_PER_DAY + ' đề xuất hôm nay. Hãy gửi tiếp vào ngày mai.');

  var sid = newId_('sg-');
  appendObjs_(st, [{
    suggestionId: sid, userId: ctx.user.userId, targetType: t, targetId: id, field: field,
    currentValue: field === '_report' ? '' : jsonCell_(p.currentValue), proposedValue: jsonCell_(p.proposedValue),
    reason: safeText_(reason, 1000), sourceUrl: url, status: 'pending', reviewerNote: '', createdAt: vnStamp_(Date.now()), reviewedAt: '', changeId: ''
  }]);
  return { suggestionId: sid };
}

function suggestionObj_(st, r, names) {
  var uid = cell_(st, r, 'userId');
  return {
    suggestionId: cell_(st, r, 'suggestionId'), userId: uid, username: names ? (names[uid] || uid) : undefined,
    targetType: cell_(st, r, 'targetType'), targetId: cell_(st, r, 'targetId'), field: cell_(st, r, 'field'),
    currentValue: jsonParse_(cell_(st, r, 'currentValue'), null), proposedValue: jsonParse_(cell_(st, r, 'proposedValue'), null),
    reason: cell_(st, r, 'reason'), sourceUrl: cell_(st, r, 'sourceUrl'), status: cell_(st, r, 'status'),
    reviewerNote: cell_(st, r, 'reviewerNote'), createdAt: cell_(st, r, 'createdAt'), reviewedAt: cell_(st, r, 'reviewedAt')
  };
}

function listMySuggestions_(ss, ctx) {
  if (!ss.getSheetByName('suggestions')) return { suggestions: [] };
  var st = table_(ss, 'suggestions');
  var out = userRows_(st, ctx.user.userId).map(function (i) { var o = suggestionObj_(st, st.rows[i]); delete o.username; delete o.userId; return o; });
  out.reverse();
  return { suggestions: out.slice(0, 200) };
}

function adminListSuggestions_(ss) {
  requireContent_(ss);
  var st = table_(ss, 'suggestions');
  var names = usernames_(ss);
  var list = st.rows.filter(function (r) { var s = cell_(st, r, 'status'); return s === 'pending' || s === 'deferred'; })
    .map(function (r) { return suggestionObj_(st, r, names); });
  return { suggestions: list, pending: list.filter(function (x) { return x.status === 'pending'; }).length };
}

/**
 * Duyệt một đề xuất. p: {suggestionId, decision: 'accept' | 'reject' | 'defer', note, changes?, base?}.
 * Chấp nhận kèm changes: tạo override + dòng content_history với source = suggestion:<id> (giống hệt tự sửa rồi lưu).
 */
function adminReviewSuggestion_(ss, ctx, p) {
  requireContent_(ss);
  var st = table_(ss, 'suggestions');
  var sid = String(p.suggestionId || '');
  var i = -1;
  st.rows.forEach(function (r, k) { if (cell_(st, r, 'suggestionId') === sid) i = k; });
  if (!sid || i < 0) fail_('bad_request', 'Không tìm thấy đề xuất.');
  var status = cell_(st, st.rows[i], 'status');
  if (status !== 'pending' && status !== 'deferred') fail_('conflict', 'Đề xuất này đã được xử lý.');
  var decision = String(p.decision || '');
  var note = safeText_(p.note, 500);
  var patch = { reviewerNote: note, reviewedAt: vnStamp_(Date.now()) };
  var out = { changeId: '' };
  if (decision === 'accept') {
    var changes = p.changes && typeof p.changes === 'object' ? p.changes : {};
    if (Object.keys(changes).length) {
      var r = applyContentChange_(ss, ctx, { targetType: cell_(st, st.rows[i], 'targetType'), targetId: cell_(st, st.rows[i], 'targetId'),
        changes: changes, base: p.base, note: note, source: 'suggestion:' + sid });
      out.changeId = r.changeId;
    }
    patch.status = 'accepted';
    patch.changeId = out.changeId;
  } else if (decision === 'reject') {
    if (String(p.note || '').trim().length < 3) fail_('invalid', 'Ghi ngắn lý do từ chối để người đề xuất biết.');
    patch.status = 'rejected';
  } else if (decision === 'defer') {
    patch.status = 'deferred';
  } else {
    fail_('bad_request', 'Quyết định không hợp lệ.');
  }
  st.rows[i] = mergeRow_(st, st.rows[i], patch);
  writeRows_(st, [i]);
  out.status = patch.status;
  out.content = contentForState_(ss, ctx.user);
  return out;
}
