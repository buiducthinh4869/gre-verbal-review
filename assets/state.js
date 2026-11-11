/**
 * state.js: trạng thái ứng dụng dùng chung giữa các trang, ghi nhận kết quả ôn, điều hướng.
 */
import * as S from './srs.js';
import { buildIndex } from './vocab.js';
import { doneFixedIds, heldExerciseIds } from './bank.js';
import { applyOverrides } from './overrides.js';
import { escapeHtml as esc } from './render.js';
import { LS } from './api.js';
import * as TL from './todaylist.js';
import { EXAM_DATE } from '../config.js';

export { S, TL, esc, EXAM_DATE };
export const SESSION_MAX = 40;
export const DEFAULT_SETTINGS = { newPerDay: 10, autoStart: false, thinkFirst: true, examMode: false, skipVocabIntro: false };

export const App = {
  vocabData: null,        // {clusters: [...]} tải từ data/
  fixedMocks: [],         // đề thi thử cố định (data/mocks/*.json), theo thứ tự trong data/mocks/index.json
  token: null,
  user: null,             // {userId, username, displayName, role, mustChangePassword}
  sync: null,             // SyncQueue
  progress: {},
  settings: Object.assign({}, DEFAULT_SETTINGS),
  customWords: [],
  daily: {},
  exLast: {},
  exRes: {},              // {exId: [ngày, 1 đúng | 0 sai]} kết quả gần nhất của từng bài GRE
  mocks: null,            // lịch sử thi thử (getMocks), null = chưa tải
  content: { overrides: [], corrected: [], pending: 0 }, // bản sửa nội dung (getState): ghép đè lên vocabData
  editMode: false,        // Chế độ sửa của quản trị viên
  idx: null,
  view: 'today',
  session: null,
  vocab: { c: null, g: null, all: false, open: null, q: '', prio: 'all', status: 'all' },
  // today: null = phạm vi theo cụm; 'all' | 'due' | 'new' | 'leech' = phạm vi "Danh sách hôm nay" (cả danh sách hoặc một thẻ)
  practice: { clusters: [], group: 'all', p3: false, leech: false, mode: 'w2m', count: '20', kinds: [], diffs: [], skills: [], onlyNew: false, useGroup: 'all', today: null },
  todayList: { tab: null, open: null }, // khối Danh sách hôm nay: thẻ đang mở (null = tự chọn), mở / thu gọn (null = theo khổ màn hình)
  editId: null,
  keyHandler: null,
  timer: null,
  clockOffset: 0,
  lastRefresh: 0
};

/* ---------------- Đồng hồ theo server (không tin giờ thiết bị) ---------------- */
export const now = () => Date.now() + App.clockOffset;
export const today = () => S.vnDate(now());
export const nowIso = () => new Date(now()).toISOString();
export function setServerClock(nowMs) { if (nowMs) App.clockOffset = nowMs - Date.now(); }

/* ---------------- Thiết bị, id sự kiện ---------------- */
const DEVICE = (() => {
  let id = LS.get('gre.device', null);
  if (!id) { id = Math.random().toString(36).slice(2, 8); LS.set('gre.device', id); }
  const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  return (mobile ? 'mobile-' : 'desktop-') + id;
})();
let evCounter = 0;
export const evId = () => DEVICE + '-' + now().toString(36) + '-' + (evCounter++).toString(36);

/* ---------------- Bộ nhớ đệm tiến độ trên máy (theo userId) ---------------- */
const cacheKey = () => 'gre.cache.' + App.user.userId;
let cacheTimer = null;
export function saveCache() {
  clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => {
    if (!App.user) return;
    LS.set(cacheKey(), { progress: App.progress, customWords: App.customWords, settings: App.settings, daily: App.daily, exLast: App.exLast, exRes: App.exRes, mocks: App.mocks, content: App.content, clockOffset: App.clockOffset });
  }, 300);
}
export function loadCache() {
  const c = LS.get(cacheKey(), null);
  if (!c) return false;
  applyState(c, { fromCache: true });
  return true;
}

/** Nạp trạng thái (từ server hoặc bộ nhớ đệm), rồi áp lại các sự kiện còn trong hàng đợi. */
export function applyState(st, opts = {}) {
  if (!opts.fromCache) setServerClock(st.nowMs); else if (st.clockOffset) App.clockOffset = st.clockOffset;
  App.progress = {};
  Object.keys(st.progress || {}).forEach((id) => { App.progress[id] = S.normalizeState(st.progress[id]); });
  App.customWords = (st.customWords || []).slice();
  App.settings = Object.assign({}, DEFAULT_SETTINGS, TL.dropStaleDayKeys(st.settings || {}, today()));
  App.daily = Object.assign({}, st.daily || {});
  App.exLast = Object.assign({}, st.exLast || {});
  App.exRes = Object.assign({}, st.exRes || {});
  if (opts.fromCache && st.mocks) App.mocks = st.mocks;
  if (st.content) setContent(st.content, { noRebuild: true });
  applyPending(!opts.fromCache);
  rebuildIndex();
  if (!opts.fromCache) saveCache();
}

function applyPending(countDaily) {
  (App.sync ? App.sync.queue : []).forEach((ev) => {
    if (ev.type === 'review') {
      if (ev.state && ev.wordId) App.progress[ev.wordId] = S.newer(App.progress[ev.wordId], S.normalizeState(ev.state));
      if (countDaily) bumpDaily(ev.day, ev.isNew);
      if (ev.exerciseId && (!App.exLast[ev.exerciseId] || App.exLast[ev.exerciseId] < ev.ts)) App.exLast[ev.exerciseId] = ev.ts;
      noteExResult(ev.exerciseId, ev.result, ev.day);
    } else if (ev.type === 'custom_upsert') {
      upsertCustomLocal(ev.word);
    } else if (ev.type === 'custom_delete') {
      App.customWords = App.customWords.filter((w) => w.id !== ev.wordId);
    } else if (ev.type === 'setting') {
      App.settings[ev.key] = ev.value;
    }
  });
}

export function mergeServerStates(states) {
  Object.keys(states || {}).forEach((id) => { App.progress[id] = S.newer(App.progress[id], S.normalizeState(states[id])); });
  saveCache();
}

export function rebuildIndex() { if (App.vocabData) App.idx = buildIndex(applyOverrides(App.vocabData, App.content.overrides), App.customWords); }

/** Nạp bản sửa nội dung ({overrides, corrected, pending}) từ server hoặc bộ nhớ đệm. */
export function setContent(c, opts = {}) {
  App.content = {
    overrides: Array.isArray(c && c.overrides) ? c.overrides : [],
    corrected: Array.isArray(c && c.corrected) ? c.corrected : [],
    pending: Number(c && c.pending) || 0
  };
  if (!opts.noRebuild) { rebuildIndex(); saveCache(); }
}
/** Từ / câu đã được đính chính (mọi người đều thấy nhãn). */
export const isCorrected = (t, id) => App.content.corrected.includes(t + ':' + id);
export const isAdmin = () => !!(App.user && App.user.role === 'admin');

/** Câu đang được giữ cho đề thi thử cố định mà người đang đăng nhập chưa làm (không xuất hiện ở luyện tập, thi thử ngẫu nhiên, ôn hôm nay). */
export const heldIds = () => heldExerciseIds(App.fixedMocks, doneFixedIds(App.mocks));
/** Câu GRE đang dùng được cho luyện tập (bỏ câu ẩn và câu đang giữ). */
export const practiceExercises = () => { const h = heldIds(); return App.idx.exercises.filter((e) => !h.has(e.id)); };

export function upsertCustomLocal(w) {
  const i = App.customWords.findIndex((x) => x.id === w.id);
  if (i < 0) App.customWords.push(w);
  else if (!App.customWords[i].updatedAt || w.updatedAt >= App.customWords[i].updatedAt) App.customWords[i] = w;
}

/* ---------------- Ghi nhận kết quả (lạc quan: cập nhật ngay rồi đưa vào hàng đợi) ---------------- */
function bumpDaily(day, isNew) {
  const d = App.daily[day] || (App.daily[day] = { r: 0, n: 0 });
  d.r += 1;
  if (isNew) d.n += 1;
}

export function pushEvent(ev) {
  if (App.sync) App.sync.push(ev);
  saveCache();
}

/** Kết quả gần nhất của một bài GRE (giống server): [ngày, 1 | 0]. */
function noteExResult(exId, result, day) {
  if (!exId || /^scale:/.test(exId) || (result !== 'good' && result !== 'again')) return;
  const prev = App.exRes[exId];
  if (!prev || !(prev[0] > day)) App.exRes[exId] = [day, result === 'good' ? 1 : 0];
}

export function pushReview(wordId, state, info, isNew) {
  const t = today();
  bumpDaily(t, isNew);
  if (info.exerciseId) { App.exLast[info.exerciseId] = nowIso(); noteExResult(info.exerciseId, info.result, t); }
  pushEvent({
    id: evId(), type: 'review', ts: state ? state.updatedAt : nowIso(), day: t, wordId: wordId || '',
    mode: info.mode, result: info.result, exerciseId: info.exerciseId || '', chosen: info.chosen || '',
    device: DEVICE, isNew: !!isNew, state: state || null
  });
}

/** Áp dụng kết quả ('again' | 'hard' | 'good') cho một từ. */
export function record(wordId, result, info, confusedWith) {
  const prev = App.progress[wordId] || S.newState(wordId);
  let st = prev;
  (confusedWith || []).forEach((c) => { st = S.addConfusion(st, c, nowIso()); });
  const next = S.applyResult(st, result, today(), nowIso());
  App.progress[wordId] = next;
  const isNew = !prev.box && next.box >= 1;
  pushReview(wordId, next, { mode: info.mode, result, exerciseId: info.exerciseId, chosen: info.chosen }, isNew);
  return next;
}

/** Chỉ ghi một lượt gặp (targets khác trong bài GRE). */
export function touch(wordId, info) {
  const next = S.touchReview(App.progress[wordId] || S.newState(wordId), nowIso());
  App.progress[wordId] = next;
  pushReview(wordId, next, { mode: info.mode, result: 'seen', exerciseId: info.exerciseId, chosen: info.chosen }, false);
}

export function setSetting(k, v) {
  App.settings[k] = v;
  pushEvent({ id: evId(), type: 'setting', ts: nowIso(), key: k, value: v });
}

/* ---------------- Tiện ích hiển thị ---------------- */
export const word = (id) => App.idx.byId[id];
export const stateOf = (id) => App.progress[id];
export function fmtDate(d) { if (!d) return '—'; const p = d.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
export function fmtIsoDate(iso) { if (!iso) return '—'; const ms = Date.parse(iso); return isNaN(ms) ? '—' : fmtDate(S.vnDate(ms)); }
const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
export function weekday(d) { const p = d.split('-'); return WEEKDAYS[new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay()]; }
export function stars(p) { return '<span class="prio prio-' + p + '" title="Mức ưu tiên ' + p + '/3" aria-label="Ưu tiên ' + p + ' trên 3">' + '★★★'.slice(0, p) + '</span>'; }
const POS = { v: 'động từ', n: 'danh từ', adj: 'tính từ', adv: 'trạng từ', 'v/n': 'động từ / danh từ' };
export const posLabel = (p) => POS[p] || p || '';
export const newToday = () => { const d = App.daily[today()]; return d ? d.n : 0; };
export const activeDays = () => Object.keys(App.daily).filter((d) => App.daily[d].r > 0);
export function leechWords() {
  return App.idx.words.filter((w) => S.isLeech(stateOf(w.id))).sort((a, b) => stateOf(b.id).lapses - stateOf(a.id).lapses);
}
/** Phiên ôn hôm nay: từ đến hạn + đúng các từ mới cố định của hôm nay (todayLists().new) còn chưa học. */
export function dailyQueue() {
  return S.buildDailyQueue(App.idx, App.progress, { today: today(), newIds: todayLists().new, max: SESSION_MAX });
}

/**
 * Danh sách hôm nay {due, new, leech} (mảng id từ). Từ mới cố định trong ngày và ảnh chụp Đến hạn đầu ngày được lưu ở
 * cài đặt todayNew:<ngày> / todayDue:<ngày> (đồng bộ giữa các thiết bị). Chỉ lưu khi đã tải trạng thái từ server trong
 * hôm nay, để máy đang dùng bộ nhớ đệm cũ không ghi đè danh sách đã chọn ở máy khác.
 */
export function todayLists() {
  const t = today();
  const fresh = App.lastRefresh > 0 && S.vnDate(App.lastRefresh + App.clockOffset) === t;
  const nw = TL.pickTodayNew(App.idx, App.progress, { today: t, newLimit: Number(App.settings.newPerDay) || 0, newDoneToday: newToday(), stored: App.settings[TL.newKey(t)] });
  if (nw.save && fresh) setSetting(TL.newKey(t), nw.ids);
  const du = TL.pickTodayDue(App.idx, App.progress, { today: t, stored: App.settings[TL.dueKey(t)], newIds: nw.ids });
  if (du.save && fresh) setSetting(TL.dueKey(t), du.ids);
  return { due: du.ids, new: nw.ids, leech: TL.pickLeech(App.idx, App.progress) };
}
/** Id các từ của Danh sách hôm nay theo phạm vi: 'all' (cả danh sách, không trùng) hoặc một thẻ. */
export function todayScopeIds(card) {
  const L = todayLists();
  return card === 'all' ? TL.unionIds(L) : (L[card] || []);
}
/** Từ đã có câu trả lời hôm nay (giờ Việt Nam). */
export const reviewedToday = () => TL.reviewedToday(App.progress, today());
export function statusTag(id) {
  const st = S.statusOf(stateOf(id));
  if (st === 'new') return '';
  const icon = { learning: '◔', known: '✓', leech: '!' }[st];
  return '<span class="tag ' + st + '">' + icon + ' ' + (st === 'leech' ? 'Hay quên' : 'Hộp ' + stateOf(id).box) + '</span>';
}
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 2800);
}
export const isTyping = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '');
export function switchHtml(id, on, label) {
  return '<span class="switch"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + ' role="switch"' + (label ? ' aria-label="' + esc(label) + '"' : '') + '><span class="track"></span></span>';
}

/* ---------------- Điều hướng ---------------- */
export const views = {};   // tên -> { render(): html, after?(), title?, auth?: true (trang không cần đăng nhập) }
export const actions = {}; // data-act -> fn(target, event)

const ICONS = {
  today: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M4 6.5h16M4 6.5V19a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V6.5M4 6.5 5 4h14l1 2.5M8 11h3v3H8z"/></svg>',
  vocab: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M5 4.5h10.5a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3V4.5Zm0 12.5a3 3 0 0 1 3-3h10.5M9 8.5h5.5"/></svg>',
  mock: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M12 21a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Zm0-11v3.8l2.4 1.6M10 2.8h4M18.4 6.6l1.3-1.3"/></svg>',
  practice: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M9 4.5h6M10 4.5v4.2L5.2 17a2 2 0 0 0 1.7 3h10.2a2 2 0 0 0 1.7-3L14 8.7V4.5M7.5 14h9"/></svg>',
  book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5m0 3.2v.3"/></svg>',
  add: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M12 5v14M5 12h14"/></svg>'
};
const TABS = [
  { id: 'today', long: 'Hôm nay', short: 'Hôm nay' },
  { id: 'vocab', long: 'Từ vựng', short: 'Từ vựng' },
  { id: 'practice', long: 'Luyện tập', short: 'Luyện tập' },
  { id: 'mock', long: 'Thi thử', short: 'Thi thử' },
  { id: 'book', long: 'Sổ từ hay quên', short: 'Hay quên' },
  { id: 'add', long: 'Thêm từ', short: 'Thêm từ' }
];
export const ROUTES = ['today', 'vocab', 'practice', 'mock', 'book', 'add', 'account', 'admin', 'mysugg'];

function renderChrome() {
  const authView = !!(views[App.view] && views[App.view].auth);
  document.body.classList.toggle('is-auth', authView);
  const tabs = document.getElementById('tabs');
  const edit = document.getElementById('editToggle');
  if (edit) {
    edit.hidden = authView || !App.idx || !isAdmin();
    edit.setAttribute('aria-pressed', String(!!App.editMode));
  }
  const me = document.getElementById('meBtn');
  if (me) me.classList.toggle('has-badge', !authView && isAdmin() && App.content.pending > 0);
  if (authView || !App.idx) { tabs.innerHTML = ''; return; }
  const current = App.view === 'session' ? (App.session && App.session.from) || 'today' : App.view;
  document.body.classList.toggle('exam-mode', !!(views[App.view] && views[App.view].immersive && views[App.view].immersive()));
  const nLeech = leechWords().length;
  tabs.innerHTML = TABS.map((t) => {
    const badge = t.id === 'book' && nLeech ? '<span class="badge" aria-label="' + nLeech + ' từ">' + nLeech + '</span>' : '';
    return '<button class="tab" data-nav="' + t.id + '"' + (current === t.id ? ' aria-current="page"' : '') + '>' +
      ICONS[t.id] + '<span class="tab-long">' + t.long + '</span><span class="tab-short">' + t.short + '</span>' + badge + '</button>';
  }).join('');
  const initial = document.getElementById('meInitial');
  if (initial && App.user) initial.textContent = (App.user.displayName || App.user.username || '?').trim().charAt(0).toUpperCase();
}

export function stopTimer() { if (App.timer) { clearInterval(App.timer); App.timer = null; } }

export function render() {
  stopTimer();
  App.keyHandler = null;
  renderChrome();
  const v = views[App.view] || views.today;
  const el = document.getElementById('view');
  el.classList.toggle('wide', !!(v.wide && v.wide()));
  el.innerHTML = v.render();
  if (v.after) v.after();
  document.title = (v.title ? v.title + ' · ' : '') + 'Ôn GRE Verbal';
}

/** Tách hash thành {view, sub}: "#vocab/praise-criticism/praise-verbs" → {view: 'vocab', sub: ['praise-criticism', 'praise-verbs']}. */
export function parseHash(h) {
  const parts = String(h || '').replace(/^#/, '').split('/').filter(Boolean).map((x) => { try { return decodeURIComponent(x); } catch (e) { return x; } });
  return { view: parts[0] || '', sub: parts.slice(1) };
}

/** Hash của trang hiện tại (trang có đường dẫn con, vd Từ vựng, tự khai báo qua views[x].path()). */
export function hashFor(view) {
  const v = views[view];
  const sub = v && v.path ? v.path() : [];
  return '#' + [view].concat(sub).map(encodeURIComponent).join('/');
}

/** Ghi hash của trạng thái hiện tại. replace = true: không tạo mục lịch sử mới (vd mở / đóng chi tiết một từ). */
export function syncHash(replace) {
  if (!ROUTES.includes(App.view)) return;
  const h = hashFor(App.view);
  if (location.hash === h) return;
  if (replace) history.replaceState(null, '', h); else history.pushState(null, '', h);
  lastHash = h;
}
export let lastHash = '';
export function setLastHash(h) { lastHash = h; }

/**
 * Chuyển trang. Trang chính đi qua hash (#today, #vocab/..., ...) để nút Quay lại hoạt động.
 * sub: đường dẫn con (mảng) nếu có; không truyền thì trang tự khôi phục chỗ xem gần nhất (views[x].restore).
 */
export function go(view, sub) {
  stopTimer();
  if (view !== 'session') App.session = null;
  App.view = view;
  const v = views[view];
  if (v && v.enter) { if (sub) v.enter(sub); else if (v.restore) v.restore(); else v.enter([]); }
  syncHash(false);
  render();
  window.scrollTo(0, 0);
}
