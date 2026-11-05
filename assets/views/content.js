/**
 * views/content.js: sửa nội dung trực tiếp (quản trị viên, khi bật Chế độ sửa), đề xuất sửa / báo lỗi câu
 * (mọi người dùng), lịch sử + khôi phục, hàng chờ duyệt đề xuất, xuất bản sửa, trang "Đề xuất của tôi".
 *
 * Bản sửa lưu ở server (tab content_overrides); web ghép đè lên file JSON gốc (assets/overrides.js).
 * Mọi kiểm tra hợp lệ dùng chung assets/validate.js; server kiểm tra lại.
 */
import { App, esc, views, actions, render, toast, isAdmin, isCorrected, setContent, word, posLabel } from '../state.js';
import { call, isAuthError, LS } from '../api.js';
import { sessionLost } from '../auth.js';
import { renderMarkup } from '../render.js';
import { EDITABLE, FIELD_LABEL, validateWord, validateExercise } from '../validate.js';
import { applyOverrides, findBase, currentValue, bakedOverrides, sameValue } from '../overrides.js';

const ROMAN = ['i', 'ii', 'iii'];
const KIND = { two_correct: 'Có hai đáp án đúng', wrong_answer: 'Đáp án sai', wrong_explanation: 'Giải thích sai', other: 'Lỗi khác' };
const STATUS = { pending: ['Đang chờ duyệt', ''], accepted: ['Đã nhận', 'known'], rejected: ['Không nhận', 'leech'], deferred: ['Để xem sau', 'learning'] };
const SUGGEST_WORD_FIELDS = ['meaning', 'nuance', 'example', 'collocations', 'root'];
const SOURCE_REQUIRED = ['meaning', 'nuance'];
const DICT_HINT = 'Nên dẫn Merriam-Webster, Oxford hoặc Cambridge; mục Synonym Chooser của Merriam-Webster rất hữu ích để phân biệt từ gần nghĩa.';
const PEN = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4"/></svg>';
const CLOSE = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path stroke="currentColor" stroke-width="2" d="m6 6 12 12M18 6 6 18"/></svg>';

/* ---------------- Tiện ích dữ liệu ---------------- */

const merged = () => applyOverrides(App.vocabData, App.content.overrides);
/** Bản ghi (đã ghép bản sửa) của một từ / câu, dạng như trong file JSON. */
const itemNow = (t, id) => { const b = findBase(merged(), t, id); return b ? JSON.parse(JSON.stringify(b.item)) : null; };
/** Bản gốc (file JSON) gửi kèm cho server để ghi lịch sử "trước" và kiểm tra hợp lệ. */
const itemBase = (t, id) => { const b = findBase(App.vocabData, t, id); return b ? b.item : null; };
const hasWord = (id) => !!(App.idx.byId[id] && !App.idx.byId[id].custom);
const isScale = (w) => { const g = App.idx.groupById[w.group]; return !!(g && g.scale); };
const lcw = (s) => String(s || '').trim().toLowerCase();
const wordIdByText = (s) => { const q = lcw(s); const w = App.idx.words.find((x) => !x.custom && (lcw(x.word) === q || x.id === q)); return w ? w.id : null; };

async function api(action, payload) {
  try {
    return await call(action, payload, App.token);
  } catch (err) {
    if (isAuthError(err)) sessionLost(err);
    throw err;
  }
}

/** Giá trị → văn bản để hiển thị / so sánh. */
export function valueText(field, v) {
  if (v == null || v === '') return field === 'level' ? '(không có)' : '';
  if (field === '_report') return (KIND[v.kind] || 'Lỗi') + (v.text ? ': ' + v.text : '');
  if (field === 'confusables' || field === 'targets') return v.map((id) => (word(id) ? word(id).word : id)).join(', ');
  if (field === 'collocations') return v.join(' | ');
  if (field === 'options' || field === 'answers') return v.join(', ');
  if (field === 'blanks') return v.map((b, k) => (v.length > 1 ? '(' + ROMAN[k] + ') ' : '') + b.options.join(', ') + ' → ' + b.answer).join('; ');
  if (field === 'priority') return '★★★'.slice(0, v) + ' (' + v + '/3)';
  if (field === 'level') return v + '/4';
  if (field === 'hidden') return v ? 'Ẩn câu' : 'Hiện câu';
  return String(v);
}

/** Tô đậm phần khác nhau theo từng từ (LCS trên các từ). Trả về [html cũ, html mới]. */
export function wordDiff(a, b) {
  const A = String(a || '').split(/(\s+)/).filter((x) => x !== ''), B = String(b || '').split(/(\s+)/).filter((x) => x !== '');
  if (A.length * B.length > 250000) return [esc(a), esc(b)];
  const L = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  let i = 0, j = 0, ha = '', hb = '';
  const ws = (x) => /^\s+$/.test(x);
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) { ha += esc(A[i]); hb += esc(B[j]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { ha += ws(A[i]) ? esc(A[i]) : '<del>' + esc(A[i]) + '</del>'; i++; }
    else { hb += ws(B[j]) ? esc(B[j]) : '<ins>' + esc(B[j]) + '</ins>'; j++; }
  }
  for (; i < A.length; i++) ha += ws(A[i]) ? esc(A[i]) : '<del>' + esc(A[i]) + '</del>';
  for (; j < B.length; j++) hb += ws(B[j]) ? esc(B[j]) : '<ins>' + esc(B[j]) + '</ins>';
  return [ha, hb];
}

/** Hiển thị một trường đúng như trên trang (dùng cho xem trước). */
function displayHtml(field, v) {
  if (field === 'example') return renderMarkup(v || '');
  if (field === 'collocations') return (v || []).length ? '<ul class="colls">' + v.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '<span class="muted">(trống)</span>';
  return v == null || v === '' ? '<span class="muted">(trống)</span>' : esc(valueText(field, v));
}

/** Danh sách gợi ý tên từ (một bản duy nhất, gắn vào body để không mất khi vẽ lại ô sửa). */
let dlFor = null;
function wordsDatalist() {
  let dl = document.getElementById('ce-words');
  if (!dl) { dl = document.createElement('datalist'); dl.id = 'ce-words'; document.body.appendChild(dl); }
  if (dlFor !== App.idx) {
    dl.innerHTML = App.idx.words.filter((w) => !w.custom).map((w) => '<option value="' + esc(w.word) + '"></option>').join('');
    dlFor = App.idx;
  }
  return '';
}

/* ---------------- Chế độ sửa (nút ở thanh trên cùng) ---------------- */

export function initEditMode() { App.editMode = isAdmin() && LS.get('gre.editMode', false) === true; }
actions['ce-toggle'] = () => {
  if (!isAdmin()) return;
  App.editMode = !App.editMode;
  LS.set('gre.editMode', App.editMode);
  ED = null;
  toast(App.editMode ? 'Đã bật Chế độ sửa: bấm biểu tượng bút cạnh mỗi trường để sửa.' : 'Đã tắt Chế độ sửa.');
  render();
};

/* ---------------- Nhãn "đã đính chính", nút đề xuất / lịch sử trong chi tiết từ ---------------- */

function fixedLabel(t, id) {
  if (!isCorrected(t, id)) return '';
  return isAdmin()
    ? '<button class="tag fix" data-act="ce-hist" data-t="' + t + '" data-id="' + esc(id) + '" title="Xem lịch sử sửa">✎ đã đính chính</button>'
    : '<span class="tag fix" title="Nội dung đã được người quản lý đính chính">✎ đã đính chính</span>';
}
export const correctedTag = (t, id) => (isCorrected(t, id) ? '<span class="tag fix">✎ đã đính chính</span>' : '');

export function contentBar(w) {
  const label = fixedLabel('word', w.id);
  const btns = [];
  if (isAdmin()) {
    if (!isCorrected('word', w.id)) btns.push('<button class="btn quiet small-btn" data-act="ce-hist" data-t="word" data-id="' + esc(w.id) + '">Lịch sử</button>');
    if (!App.editMode) btns.push('<button class="btn quiet small-btn" data-act="ce-toggle">' + PEN + ' Bật chế độ sửa</button>');
  } else {
    btns.push('<button class="btn quiet small-btn" data-act="ce-suggest" data-id="' + esc(w.id) + '">' + PEN + ' Đề xuất sửa</button>');
  }
  return '<div class="ce-bar">' + label + btns.join('') + '</div>';
}

/* ---------------- Sửa tại chỗ một trường của từ ---------------- */

let ED = null; // {id, field, draft, mode: 'inline' | 'modal', suggestion?}
const WORD_ORDER = ['word', 'pos', 'meaning', 'priority', 'level', 'nuance', 'example', 'collocations', 'root', 'confusables'];
const TEXTAREA = { meaning: 2, nuance: 4, example: 3, root: 2 };
const PREVIEW = ['meaning', 'nuance', 'example'];

/** Các dòng chi tiết từ ở Chế độ sửa: mọi trường được phép sửa, cạnh mỗi trường có nút bút. */
export function editableRows(w) {
  const it = itemNow('word', w.id) || w;
  return WORD_ORDER.filter((f) => f !== 'level' || isScale(w) || it.level != null).map((f) => {
    const editing = ED && ED.mode === 'inline' && ED.id === w.id && ED.field === f;
    const v = it[f];
    let shown;
    if (f === 'example') shown = v ? '<span class="example">' + renderMarkup(v) + '</span>' : '';
    else if (f === 'collocations') shown = (v || []).length ? '<ul class="colls">' + v.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '';
    else if (f === 'pos') shown = esc(v) + (posLabel(v) !== v ? ' <span class="muted small">(' + esc(posLabel(v)) + ')</span>' : '');
    else shown = v == null || v === '' ? '' : esc(valueText(f, v));
    return '<dt>' + FIELD_LABEL[f] + '</dt><dd class="ce-field">' + (editing
      ? '<div class="ce-ed" id="ce-ed">' + fieldEditor() + '</div>'
      : '<div class="ce-val">' + (shown || '<span class="muted">(trống)</span>') + '</div>' +
        '<button class="icon-btn ce-pen" data-act="ce-edit" data-id="' + esc(w.id) + '" data-f="' + f + '" aria-label="Sửa ' + FIELD_LABEL[f].toLowerCase() + '" title="Sửa">' + PEN + '</button>') + '</dd>';
  }).join('');
}

function fieldEditor() {
  const f = ED.field, d = ED.draft;
  let h = '';
  if (f === 'word' || f === 'pos') {
    h += '<input class="input" id="ce-in" value="' + esc(d) + '" maxlength="' + (f === 'pos' ? 20 : 120) + '" aria-label="' + FIELD_LABEL[f] + '">';
  } else if (TEXTAREA[f]) {
    h += '<textarea class="input" id="ce-in" rows="' + TEXTAREA[f] + '" aria-label="' + FIELD_LABEL[f] + '">' + esc(d) + '</textarea>';
    if (f === 'example') h += '<p class="muted small ce-help">Giữ quy ước <code>*từ*</code> cho từ đang học và <code>**collocation**</code>.</p>';
    if (PREVIEW.includes(f)) h += '<div class="ce-preview"><span class="ce-plabel">Xem trước</span><div id="ce-prev">' + displayHtml(f, d) + '</div></div>';
  } else if (f === 'priority') {
    h += '<select class="input" id="ce-in" aria-label="Mức ưu tiên">' + [3, 2, 1].map((p) => '<option value="' + p + '"' + (d === p ? ' selected' : '') + '>' + valueText('priority', p) + '</option>').join('') + '</select>';
  } else if (f === 'level') {
    h += '<select class="input" id="ce-in" aria-label="Mức trên thang"><option value="">(không có)</option>' + [1, 2, 3, 4].map((p) => '<option value="' + p + '"' + (d === p ? ' selected' : '') + '>' + p + '/4' + (p === 1 ? ' (nhẹ nhất)' : p === 4 ? ' (mạnh nhất)' : '') + '</option>').join('') + '</select>';
  } else if (f === 'collocations' || f === 'confusables') {
    h += '<div class="ce-chips" role="list">' + d.map((x, k) => '<span class="ce-chip" role="listitem">' + esc(f === 'confusables' ? (word(x) ? word(x).word : x) : x) +
      '<button data-act="ce-chip-del" data-k="' + k + '" aria-label="Xóa ' + esc(f === 'confusables' && word(x) ? word(x).word : x) + '">×</button></span>').join('') + '</div>' +
      '<div class="ce-add"><input class="input" id="ce-add" ' + (f === 'confusables' ? 'list="ce-words" placeholder="Gõ tên từ rồi Enter"' : 'placeholder="Thêm collocation rồi Enter" maxlength="120"') + ' aria-label="Thêm ' + FIELD_LABEL[f].toLowerCase() + '">' +
      '<button class="btn" data-act="ce-chip-add">Thêm</button></div>' + (f === 'confusables' ? wordsDatalist() : '');
  }
  h += '<input class="input ce-note" id="ce-note" maxlength="300" placeholder="Ghi chú (tùy chọn), ví dụ: theo Merriam-Webster" aria-label="Ghi chú" value="' + esc(ED.note || '') + '">';
  h += '<div class="ce-err" id="ce-err" role="alert">' + (ED.errors || []).map((e) => '<div>' + esc(e) + '</div>').join('') + '</div>';
  h += '<div class="ce-actions"><button class="btn primary" data-act="ce-save">' + (ED.suggestion ? 'Lưu và chấp nhận' : 'Lưu') + ' <kbd>Ctrl S</kbd></button><button class="btn" data-act="ce-cancel">Hủy <kbd>Esc</kbd></button></div>';
  return h;
}

function readFieldDraft() {
  const f = ED.field;
  const el = document.getElementById('ce-in');
  const note = document.getElementById('ce-note');
  if (note) ED.note = note.value;
  if (!el) return ED.draft;
  if (f === 'priority') return Number(el.value);
  if (f === 'level') return el.value ? Number(el.value) : null;
  if (f === 'word' || f === 'pos') return el.value.trim();
  if (TEXTAREA[f]) return el.value.replace(/\s+$/, '').replace(/^\s+/, '');
  return ED.draft;
}

function paintEditor() {
  const box = document.getElementById('ce-ed');
  if (box) box.innerHTML = fieldEditor();
}
function focusEditor() {
  const el = document.getElementById('ce-add') || document.getElementById('ce-in');
  if (el) { el.focus(); if (el.setSelectionRange && el.tagName === 'TEXTAREA') el.setSelectionRange(el.value.length, el.value.length); }
}

function startFieldEdit(id, field, opts = {}) {
  const it = itemNow('word', id);
  if (!it) return;
  let d = opts.value !== undefined ? opts.value : it[field];
  if (field === 'collocations' || field === 'confusables') d = (d || []).slice();
  if (d == null) d = field === 'level' ? null : '';
  ED = { id, field, draft: d, note: '', errors: [], mode: opts.mode || 'inline', suggestion: opts.suggestion || null };
}

async function saveField() {
  if (!ED) return;
  ED.draft = readFieldDraft();
  const { id, field } = ED;
  const now = itemNow('word', id);
  let value = ED.draft;
  if (field === 'level' && value == null) value = null;
  const w2 = Object.assign({}, now, { [field]: value });
  if (value == null && field === 'level') delete w2.level;
  ED.errors = validateWord(w2, { hasWord, isScale: isScale(App.idx.byId[id]) });
  if (!ED.errors.length && !ED.suggestion && sameValue(now[field], value)) ED.errors = ['Nội dung chưa thay đổi.'];
  if (ED.errors.length) { paintEditor(); focusEditor(); return; }
  const btn = document.querySelector('[data-act="ce-save"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Đang lưu…'; }
  try {
    const payload = { targetType: 'word', targetId: id, changes: sameValue(now[field], value) ? {} : { [field]: value }, base: itemBase('word', id), note: ED.note };
    const res = ED.suggestion
      ? await api('adminReviewSuggestion', Object.assign({ suggestionId: ED.suggestion, decision: 'accept' }, payload))
      : await api('adminSaveOverride', payload);
    const wasModal = ED.mode === 'modal', sid = ED.suggestion;
    ED = null;
    setContent(res.content);
    toast(sid ? 'Đã chấp nhận đề xuất và lưu.' : 'Đã lưu. Mọi người sẽ thấy nội dung mới.');
    if (wasModal) { closeModal(); if (sid) reloadQueue(); }
    render();
    const pen = document.querySelector('[data-act="ce-edit"][data-id="' + id + '"][data-f="' + field + '"]');
    if (pen) pen.focus();
  } catch (err) {
    ED.errors = [err.message];
    paintEditor();
  }
}

function cancelField() {
  if (!ED) return;
  const { id, field, mode } = ED;
  ED = null;
  if (mode === 'modal') { closeModal(); return; }
  render();
  const pen = document.querySelector('[data-act="ce-edit"][data-id="' + id + '"][data-f="' + field + '"]');
  if (pen) pen.focus();
}

function chipAdd() {
  const el = document.getElementById('ce-add');
  if (!el || !ED) return;
  const raw = el.value.trim();
  if (!raw) return;
  if (ED.field === 'confusables') {
    const id = wordIdByText(raw);
    if (!id) { ED.errors = ['Không tìm thấy từ "' + raw + '" trong dữ liệu. Chọn từ trong danh sách gợi ý.']; }
    else if (id === ED.id) { ED.errors = ['Không thêm chính từ này vào danh sách dễ nhầm.']; }
    else if (ED.draft.includes(id)) { ED.errors = ['"' + raw + '" đã có trong danh sách.']; }
    else { ED.draft.push(id); ED.errors = []; }
  } else if (ED.draft.some((x) => lcw(x) === lcw(raw))) {
    ED.errors = ['"' + raw + '" đã có trong danh sách.'];
  } else { ED.draft.push(raw); ED.errors = []; }
  ED.note = (document.getElementById('ce-note') || {}).value || ED.note;
  paintEditor();
  focusEditor();
}

Object.assign(actions, {
  'ce-edit': (t) => {
    if (!isAdmin()) return;
    if (ED && ED.mode === 'inline' && !confirmDiscard()) return;
    startFieldEdit(t.dataset.id, t.dataset.f);
    render();
    focusEditor();
  },
  'ce-save': () => { if (EX) saveExercise(); else saveField(); },
  'ce-cancel': () => { if (EX) closeModal(); else cancelField(); },
  'ce-chip-add': () => chipAdd(),
  'ce-chip-del': (t) => {
    if (!ED) return;
    ED.note = (document.getElementById('ce-note') || {}).value || ED.note;
    ED.draft.splice(Number(t.dataset.k), 1);
    paintEditor();
    focusEditor();
  }
});

function confirmDiscard() {
  if (!ED) return true;
  const d = readFieldDraft();
  const now = itemNow('word', ED.id);
  return sameValue(now && now[ED.field], d) || window.confirm('Bỏ nội dung đang sửa?');
}

/* ---------------- Hộp thoại dùng chung ---------------- */

let M = null; // {title, body: () => html, opener, onPaint?}
function openModal(title, body, onPaint) {
  M = { title, body, opener: M ? M.opener : document.activeElement, onPaint };
  paintModal();
  const first = document.querySelector('#ceModal .ce-dbody input:not([type=hidden]), #ceModal .ce-dbody textarea, #ceModal .ce-dbody select, #ceModal .ce-dbody button');
  if (first) first.focus();
}
function paintModal() {
  let el = document.getElementById('ceModal');
  if (!el) { el = document.createElement('div'); el.id = 'ceModal'; document.body.appendChild(el); }
  const scroll = el.querySelector('.ce-dbody') ? el.querySelector('.ce-dbody').scrollTop : 0;
  el.innerHTML = '<div class="ce-backdrop" data-act="ce-close"></div><div class="ce-dialog" role="dialog" aria-modal="true" aria-labelledby="ce-title">' +
    '<div class="ce-dhead"><h2 id="ce-title">' + esc(M.title) + '</h2><button class="icon-btn" data-act="ce-close" aria-label="Đóng">' + CLOSE + '</button></div>' +
    '<div class="ce-dbody">' + M.body() + '</div></div>';
  el.hidden = false;
  el.querySelector('.ce-dbody').scrollTop = scroll;
  document.body.classList.add('modal-open');
  if (M.onPaint) M.onPaint();
}
function closeModal() {
  const el = document.getElementById('ceModal');
  if (el) { el.hidden = true; el.innerHTML = ''; }
  document.body.classList.remove('modal-open');
  const opener = M && M.opener;
  M = null; EX = null; SG = null; HI = null;
  if (ED && ED.mode === 'modal') ED = null;
  if (opener && opener.isConnected) opener.focus();
}
actions['ce-close'] = () => closeModal();
const modalOpen = () => !!M;

/* Bàn phím: Ctrl/Cmd + S lưu, Esc hủy; khi hộp thoại hoặc ô sửa đang mở thì phím không lọt xuống trang bên dưới. */
window.addEventListener('keydown', (e) => {
  const inEditor = !!(e.target && e.target.closest && (e.target.closest('#ce-ed') || e.target.closest('#ceModal')));
  if (!modalOpen() && !(ED && ED.mode === 'inline')) return;
  if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
    e.preventDefault(); e.stopPropagation();
    if (EX) saveExercise(); else if (ED) saveField(); else if (SG) submitSuggestion();
    return;
  }
  if (e.key === 'Escape') {
    e.preventDefault(); e.stopPropagation();
    if (modalOpen()) closeModal(); else cancelField();
    return;
  }
  if (e.key === 'Enter' && e.target && e.target.id === 'ce-add') { e.preventDefault(); e.stopPropagation(); chipAdd(); return; }
  if (e.key === 'Enter' && e.target && e.target.id === 'ce-x-tadd') { e.preventDefault(); e.stopPropagation(); exTargetAdd(); return; }
  if (modalOpen() || inEditor) e.stopPropagation();
}, true);

document.addEventListener('input', (e) => {
  if (ED && e.target.id === 'ce-in' && PREVIEW.includes(ED.field)) {
    const p = document.getElementById('ce-prev');
    if (p) p.innerHTML = displayHtml(ED.field, e.target.value);
  }
  if (EX && e.target.closest && e.target.closest('#ce-xform')) { readExDraft(); paintExLive(); }
});
document.addEventListener('change', (e) => {
  if (EX && e.target.closest && e.target.closest('#ce-xform')) {
    if (e.target.id === 'ce-x-nb') { readExDraft(); resizeBlanks(Number(e.target.value)); paintModal(); return; }
    readExDraft(); paintExLive();
  }
  if (SG && e.target.id === 'ce-s-field') { readSuggestion(); SG.field = e.target.value; SG.value = editableText(SG.field, itemNow('word', SG.id)[SG.field]); SG.errors = []; paintModal(); }
});

/* ---------------- Câu GRE: nút công cụ, trình sửa câu kèm xem trước ---------------- */

/** Nút cho một câu: nhãn đã đính chính; quản trị viên (Chế độ sửa): Sửa câu này, Ẩn / Hiện; người dùng: Báo lỗi câu này. */
export function exTools(ex) {
  if (!ex || !App.vocabData || !findBase(App.vocabData, 'exercise', ex.id)) return '';
  let h = '<div class="ce-extools">' + fixedLabel('exercise', ex.id) + (ex.hidden ? '<span class="tag leech">Đang ẩn</span>' : '');
  if (isAdmin()) {
    if (App.editMode) {
      h += '<button class="btn quiet small-btn" data-act="ce-ex-edit" data-id="' + esc(ex.id) + '">' + PEN + ' Sửa câu này</button>' +
        '<button class="btn quiet small-btn" data-act="ce-ex-hide" data-id="' + esc(ex.id) + '">' + (ex.hidden ? 'Hiện lại câu này' : 'Ẩn câu này') + '</button>';
      if (!isCorrected('exercise', ex.id)) h += '<button class="btn quiet small-btn" data-act="ce-hist" data-t="exercise" data-id="' + esc(ex.id) + '">Lịch sử</button>';
    }
  } else {
    h += '<button class="btn quiet small-btn" data-act="ce-report" data-id="' + esc(ex.id) + '">⚑ Báo lỗi câu này</button>';
  }
  return h + '</div>';
}

/** Câu GRE có từ này (trong chi tiết từ): xem nhanh, kèm nút sửa / báo lỗi. */
export function wordExercises(w) {
  const list = (isAdmin() ? App.idx.allExercises : App.idx.exercises).filter((e) => (e.targets || []).includes(w.id) || (e.answerIds || []).includes(w.id));
  if (!list.length) return '';
  return '<details class="ce-exlist"' + (EX_OPEN.has(w.id) ? ' open' : '') + ' data-wid="' + esc(w.id) + '"><summary>Câu GRE có từ này (' + list.length + ')</summary><ul class="review-list">' + list.map((e) => {
    const ans = e.type === 'se' ? e.answers.join(', ') : e.blanks.map((b) => b.answer).join(' · ');
    return '<li><div class="small muted">' + (e.type === 'se' ? 'Sentence Equivalence' : 'Text Completion' + (e.blanks.length > 1 ? ' · ' + e.blanks.length + ' chỗ trống' : '')) + ' · ' + esc(e.id) + '</div>' +
      '<p class="example" style="margin:4px 0">' + gapSentence(e) + '</p><div class="small">Đáp án: <b>' + esc(ans) + '</b></div>' + exTools(e) + '</li>';
  }).join('') + '</ul></details>';
}
const EX_OPEN = new Set();
document.addEventListener('toggle', (e) => {
  const d = e.target;
  if (d && d.classList && d.classList.contains('ce-exlist')) { if (d.open) EX_OPEN.add(d.dataset.wid); else EX_OPEN.delete(d.dataset.wid); }
}, true);

function gapSentence(e) {
  return esc(e.sentence).replace(/\{(\d+)\}/g, (_, n) => '<span class="gap">' + (e.blanks && e.blanks.length > 1 ? '(' + ROMAN[+n] + ')' : '&nbsp;') + '</span>');
}

let EX = null; // {id, draft, note, errors, suggestion?}

function exDraftFrom(it) {
  const d = { type: it.type, sentence: it.sentence || '', targets: (it.targets || []).slice(), hint: it.hint || '', explanation: it.explanation || '' };
  if (it.type === 'se') { d.options = it.options.slice(); d.answers = it.answers.slice(); }
  else d.blanks = it.blanks.map((b) => ({ options: b.options.slice(), answer: b.answer }));
  return d;
}

function openExerciseEditor(id, opts = {}) {
  const it = itemNow('exercise', id);
  if (!it) return;
  EX = { id, draft: exDraftFrom(it), note: '', errors: [], suggestion: opts.suggestion || null, intro: opts.intro || '' };
  openModal((opts.suggestion ? 'Sửa rồi chấp nhận · ' : 'Sửa câu ') + id, exFormHtml);
}

function exFormHtml() {
  const d = EX.draft;
  const isSE = d.type === 'se';
  let h = (EX.intro || '') + '<form id="ce-xform" class="ce-form" novalidate onsubmit="return false">';
  h += '<div class="field"><label for="ce-x-sentence">Câu</label><textarea class="input" id="ce-x-sentence" rows="4">' + esc(d.sentence) + '</textarea>' +
    '<p class="muted small ce-help">Đánh dấu chỗ trống bằng ' + (isSE ? '<code>{0}</code>' : '<code>{0}</code>, <code>{1}</code>, <code>{2}</code> theo thứ tự') + '.</p></div>';
  if (isSE) {
    h += '<fieldset class="ce-fs"><legend>Phương án (tích đúng 2 đáp án)</legend>' + d.options.map((o, k) =>
      '<div class="ce-optrow"><input type="checkbox" class="ce-x-seans" data-k="' + k + '" id="ce-x-a' + k + '"' + (d.answers.includes(o) && o ? ' checked' : '') + ' aria-label="Phương án ' + (k + 1) + ' là đáp án">' +
      '<input class="input ce-x-seopt" data-k="' + k + '" value="' + esc(o) + '" maxlength="120" aria-label="Phương án ' + (k + 1) + '"></div>').join('') + '</fieldset>';
  } else {
    h += '<div class="field"><label for="ce-x-nb">Số chỗ trống</label><select class="input" id="ce-x-nb">' + [1, 2, 3].map((n) => '<option value="' + n + '"' + (d.blanks.length === n ? ' selected' : '') + '>' + n + (n === 1 ? ' (5 phương án)' : ' (mỗi chỗ 3 phương án)') + '</option>').join('') + '</select></div>';
    h += '<div class="ce-blanks n' + d.blanks.length + '">' + d.blanks.map((b, bi) => '<fieldset class="ce-fs"><legend>' + (d.blanks.length > 1 ? 'Chỗ trống (' + ROMAN[bi] + ')' : 'Phương án') + ' · chọn đáp án</legend>' +
      b.options.map((o, k) => '<div class="ce-optrow"><input type="radio" name="ce-x-ans' + bi + '" class="ce-x-tcans" data-b="' + bi + '" data-k="' + k + '"' + (o && o === b.answer ? ' checked' : '') + ' aria-label="Phương án ' + (k + 1) + ' là đáp án">' +
        '<input class="input ce-x-tcopt" data-b="' + bi + '" data-k="' + k + '" value="' + esc(o) + '" maxlength="120" aria-label="Chỗ trống ' + (bi + 1) + ', phương án ' + (k + 1) + '"></div>').join('') + '</fieldset>').join('') + '</div>';
  }
  h += '<div class="field"><span class="label">Từ đích (tính tiến độ cho các từ này)</span><div class="ce-chips">' + d.targets.map((id, k) =>
    '<span class="ce-chip">' + esc(word(id) ? word(id).word : id) + '<button type="button" data-act="ce-x-tdel" data-k="' + k + '" aria-label="Bỏ ' + esc(word(id) ? word(id).word : id) + '">×</button></span>').join('') + '</div>' +
    '<div class="ce-add"><input class="input" id="ce-x-tadd" list="ce-words" placeholder="Gõ tên từ rồi Enter" aria-label="Thêm từ đích"><button type="button" class="btn" data-act="ce-x-tadd">Thêm</button></div>' + wordsDatalist() + '</div>';
  h += '<div class="field"><label for="ce-x-hint">Gợi ý</label><textarea class="input" id="ce-x-hint" rows="2">' + esc(d.hint) + '</textarea></div>';
  h += '<div class="field"><label for="ce-x-expl">Giải thích</label><textarea class="input" id="ce-x-expl" rows="4">' + esc(d.explanation) + '</textarea></div>';
  h += '<div class="field"><label for="ce-x-note">Ghi chú (tùy chọn)</label><input class="input" id="ce-x-note" maxlength="300" value="' + esc(EX.note) + '" placeholder="Ví dụ: theo Merriam-Webster"></div>';
  h += '</form>';
  h += '<h3 class="ce-h3">Xem trước</h3><div class="ce-xprev" id="ce-x-prev">' + exPreview(d) + '</div>';
  const hidden = !!(itemNow('exercise', EX.id) || {}).hidden;
  h += '<div class="ce-sticky"><div class="ce-err" id="ce-x-err" role="alert">' + errsHtml(EX.errors) + '</div><div class="ce-actions"><button class="btn primary" data-act="ce-save">' + (EX.suggestion ? 'Lưu và chấp nhận' : 'Lưu') + ' <kbd>Ctrl S</kbd></button><button class="btn" data-act="ce-cancel">Hủy <kbd>Esc</kbd></button>' +
    (EX.suggestion ? '' : '<button class="btn quiet" data-act="ce-ex-hide" data-id="' + esc(EX.id) + '">' + (hidden ? 'Hiện lại câu này' : 'Ẩn câu này') + '</button>') + '</div></div>';
  return h;
}
const errsHtml = (errs) => (errs || []).map((e) => '<div>' + esc(e) + '</div>').join('');

/** Xem trước như khi làm bài (đáp án đúng được đánh dấu như màn kết quả). */
function exPreview(d) {
  const isSE = d.type === 'se';
  const n = isSE ? 1 : d.blanks.length;
  let h = '<article class="card ce-card"><div class="card-kind">GRE · ' + (isSE ? 'Sentence Equivalence' : 'Text Completion' + (n > 1 ? ' · ' + n + ' chỗ trống' : '')) + '</div>';
  h += '<p class="gre-sentence">' + esc(d.sentence).replace(/\{(\d+)\}/g, (_, k) => '<span class="gap">&nbsp;' + (n > 1 ? '<small>(' + (ROMAN[+k] || '?') + ')</small>' : '') + '</span>') + '</p>';
  const opt = (o, ok, num) => '<div class="opt' + (ok ? ' correct' : '') + '"><span class="num">' + num + '</span><span>' + esc(o) + '</span><span class="mark">' + (ok ? '✓' : '') + '</span></div>';
  if (isSE) h += '<div class="options">' + d.options.map((o, k) => opt(o, d.answers.includes(o) && !!o, k + 1)).join('') + '</div>';
  else {
    let base = 0;
    h += '<div class="blank-cols n' + n + '">' + d.blanks.map((b, bi) => {
      const col = '<div class="blank-col">' + (n > 1 ? '<h4>Chỗ trống (' + ROMAN[bi] + ')</h4>' : '') + '<div class="options">' + b.options.map((o, k) => opt(o, o && o === b.answer, base + k + 1)).join('') + '</div></div>';
      base += b.options.length;
      return col;
    }).join('') + '</div>';
  }
  if (d.hint) h += '<div class="hintbox"><b>Gợi ý:</b> ' + esc(d.hint) + '</div>';
  if (d.explanation) h += '<div class="explain">' + esc(d.explanation) + '</div>';
  return h + '</article>';
}

function readExDraft() {
  if (!EX) return;
  const d = EX.draft;
  const v = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
  d.sentence = v('ce-x-sentence').trim();
  d.hint = v('ce-x-hint').trim();
  d.explanation = v('ce-x-expl').trim();
  EX.note = v('ce-x-note');
  if (d.type === 'se') {
    document.querySelectorAll('.ce-x-seopt').forEach((el) => { d.options[Number(el.dataset.k)] = el.value.trim(); });
    d.answers = [...document.querySelectorAll('.ce-x-seans')].filter((el) => el.checked).map((el) => d.options[Number(el.dataset.k)]);
  } else {
    document.querySelectorAll('.ce-x-tcopt').forEach((el) => { const b = d.blanks[Number(el.dataset.b)]; if (b) b.options[Number(el.dataset.k)] = el.value.trim(); });
    d.blanks.forEach((b, bi) => {
      const sel = document.querySelector('input[name="ce-x-ans' + bi + '"]:checked');
      b.answer = sel ? b.options[Number(sel.dataset.k)] : '';
    });
  }
}

function resizeBlanks(n) {
  const d = EX.draft;
  const want = n === 1 ? 5 : 3;
  while (d.blanks.length < n) d.blanks.push({ options: [], answer: '' });
  d.blanks.length = n;
  d.blanks.forEach((b) => {
    while (b.options.length < want) b.options.push('');
    if (b.options.length > want) {
      // giữ đáp án nếu có trong phần bị cắt
      const keep = b.options.slice(0, want);
      if (b.answer && !keep.includes(b.answer)) keep[want - 1] = b.answer;
      b.options = keep;
    }
  });
}

function exErrors() {
  const it = itemNow('exercise', EX.id);
  const draft = Object.assign({}, it, EX.draft);
  return validateExercise(draft, { hasWord });
}

function paintExLive() {
  const p = document.getElementById('ce-x-prev');
  if (p) p.innerHTML = exPreview(EX.draft);
  EX.errors = exErrors();
  const e = document.getElementById('ce-x-err');
  if (e) e.innerHTML = errsHtml(EX.errors);
}

function exChanges() {
  const now = itemNow('exercise', EX.id);
  const d = EX.draft, ch = {};
  const fields = ['sentence', 'targets', 'hint', 'explanation'].concat(d.type === 'se' ? ['options', 'answers'] : ['blanks']);
  fields.forEach((f) => {
    const before = now[f] == null ? (f === 'hint' || f === 'explanation' ? '' : now[f]) : now[f];
    if (!sameValue(before, d[f])) ch[f] = d[f];
  });
  return ch;
}

async function saveExercise() {
  if (!EX) return;
  readExDraft();
  EX.errors = exErrors();
  const ch = exChanges();
  if (!EX.errors.length && !Object.keys(ch).length && !EX.suggestion) EX.errors = ['Nội dung chưa thay đổi.'];
  if (EX.errors.length) { paintModal(); return; }
  try {
    const payload = { targetType: 'exercise', targetId: EX.id, changes: ch, base: itemBase('exercise', EX.id), note: EX.note };
    const res = EX.suggestion
      ? await api('adminReviewSuggestion', Object.assign({ suggestionId: EX.suggestion, decision: 'accept' }, payload))
      : await api('adminSaveOverride', payload);
    const sid = EX.suggestion;
    setContent(res.content);
    closeModal();
    toast(sid ? 'Đã chấp nhận đề xuất và lưu câu.' : 'Đã lưu câu. Mọi người sẽ thấy nội dung mới.');
    if (sid) reloadQueue();
    render();
  } catch (err) {
    EX.errors = [err.message];
    paintModal();
  }
}

function exTargetAdd() {
  if (!EX) return;
  readExDraft();
  const el = document.getElementById('ce-x-tadd');
  const raw = el ? el.value.trim() : '';
  if (!raw) return;
  const id = wordIdByText(raw);
  if (!id) EX.errors = ['Không tìm thấy từ "' + raw + '". Chọn từ trong danh sách gợi ý.'];
  else if (!EX.draft.targets.includes(id)) { EX.draft.targets.push(id); EX.errors = exErrors(); }
  paintModal();
  const again = document.getElementById('ce-x-tadd');
  if (again) again.focus();
}

async function toggleHidden(id) {
  const it = itemNow('exercise', id);
  if (!it) return;
  const hide = !it.hidden;
  if (hide && !window.confirm('Ẩn câu ' + id + '? Câu sẽ không còn xuất hiện trong luyện tập và thi thử (khôi phục được trong Lịch sử).')) return;
  try {
    const res = await api('adminHideExercise', { exerciseId: id, hidden: hide, base: itemBase('exercise', id) });
    setContent(res.content);
    if (modalOpen()) closeModal();
    toast(hide ? 'Đã ẩn câu ' + id + '.' : 'Đã hiện lại câu ' + id + '.');
    render();
  } catch (err) { toast(err.message); }
}

Object.assign(actions, {
  'ce-ex-edit': (t) => { if (isAdmin()) openExerciseEditor(t.dataset.id); },
  'ce-ex-hide': (t) => { if (isAdmin()) toggleHidden(t.dataset.id); },
  'ce-x-tadd': () => exTargetAdd(),
  'ce-x-tdel': (t) => { readExDraft(); EX.draft.targets.splice(Number(t.dataset.k), 1); EX.errors = exErrors(); paintModal(); }
});

/* ---------------- Đề xuất sửa (từ) và báo lỗi câu ---------------- */

let SG = null; // {t, id, field, value, reason, url, kind, errors}

/** Giá trị → văn bản để sửa trong ô (collocation: mỗi dòng một mục). */
function editableText(field, v) {
  if (field === 'collocations') return (v || []).join('\n');
  return v == null ? '' : String(v);
}
function fromText(field, s) {
  if (field === 'collocations') return s.split('\n').map((x) => x.trim()).filter(Boolean);
  return s.trim();
}

function openSuggest(id) {
  const it = itemNow('word', id);
  if (!it) return;
  SG = { t: 'word', id, field: 'meaning', value: editableText('meaning', it.meaning), reason: '', url: '', errors: [] };
  openModal('Đề xuất sửa · ' + it.word, suggestHtml);
}
function openReport(id) {
  if (!itemNow('exercise', id)) return;
  SG = { t: 'exercise', id, field: '_report', kind: '', value: '', reason: '', url: '', errors: [] };
  openModal('Báo lỗi câu ' + id, suggestHtml);
}

function suggestHtml() {
  let h = '<form class="ce-form" id="ce-sform" novalidate onsubmit="return false">';
  if (SG.t === 'word') {
    const need = SOURCE_REQUIRED.includes(SG.field);
    h += '<div class="field"><label for="ce-s-field">Trường muốn sửa</label><select class="input" id="ce-s-field">' +
      SUGGEST_WORD_FIELDS.map((f) => '<option value="' + f + '"' + (SG.field === f ? ' selected' : '') + '>' + FIELD_LABEL[f] + '</option>').join('') + '</select></div>';
    h += '<div class="field"><label for="ce-s-value">Nội dung mới' + (SG.field === 'collocations' ? ' (mỗi dòng một collocation)' : '') + '</label>' +
      '<textarea class="input" id="ce-s-value" rows="' + (SG.field === 'meaning' ? 2 : 4) + '">' + esc(SG.value) + '</textarea>' +
      (SG.field === 'example' ? '<p class="muted small ce-help">Giữ quy ước <code>*từ*</code> và <code>**collocation**</code>.</p>' : '') + '</div>';
    h += '<div class="field"><label for="ce-s-reason">Lý do (bắt buộc, ít nhất 10 ký tự)</label><textarea class="input" id="ce-s-reason" rows="3">' + esc(SG.reason) + '</textarea></div>';
    h += '<div class="field"><label for="ce-s-url">Nguồn ' + (need ? '(bắt buộc khi sửa ' + FIELD_LABEL[SG.field].toLowerCase() + ')' : '(khuyến khích)') + '</label>' +
      '<input class="input" id="ce-s-url" type="url" inputmode="url" placeholder="https://www.merriam-webster.com/dictionary/…" value="' + esc(SG.url) + '"></div>';
  } else {
    const ex = itemNow('exercise', SG.id);
    h += '<p class="example" style="margin:0 0 12px">' + gapSentence(ex) + '</p>';
    h += '<fieldset class="ce-fs"><legend>Loại lỗi</legend>' + Object.keys(KIND).map((k) =>
      '<label class="ce-radio"><input type="radio" name="ce-r-kind" value="' + k + '"' + (SG.kind === k ? ' checked' : '') + '> ' + KIND[k] + '</label>').join('') + '</fieldset>';
    h += '<div class="field"><label for="ce-s-reason">Mô tả lỗi (bắt buộc, ít nhất 10 ký tự)</label><textarea class="input" id="ce-s-reason" rows="3">' + esc(SG.reason) + '</textarea></div>';
    h += '<div class="field"><label for="ce-s-value">Đề xuất sửa cụ thể (tùy chọn)</label><textarea class="input" id="ce-s-value" rows="3" placeholder="Ví dụ: đổi phương án thứ ba thành …">' + esc(SG.value) + '</textarea></div>';
    h += '<div class="field"><label for="ce-s-url">Nguồn (khuyến khích)</label><input class="input" id="ce-s-url" type="url" inputmode="url" placeholder="https://…" value="' + esc(SG.url) + '"></div>';
  }
  h += '<p class="notice ce-hint">' + DICT_HINT + '</p>';
  h += '</form><div class="ce-err" role="alert">' + errsHtml(SG.errors) + '</div>';
  h += '<div class="ce-actions"><button class="btn primary" data-act="ce-s-send">Gửi đề xuất</button><button class="btn" data-act="ce-close">Hủy</button></div>';
  return h;
}

function readSuggestion() {
  const v = (id) => { const el = document.getElementById(id); return el ? el.value : undefined; };
  if (v('ce-s-value') !== undefined) SG.value = v('ce-s-value');
  if (v('ce-s-reason') !== undefined) SG.reason = v('ce-s-reason');
  if (v('ce-s-url') !== undefined) SG.url = v('ce-s-url').trim();
  const k = document.querySelector('input[name="ce-r-kind"]:checked');
  if (k) SG.kind = k.value;
}

async function submitSuggestion() {
  if (!SG) return;
  readSuggestion();
  const errs = [];
  let payload;
  if (SG.t === 'word') {
    const cur = itemNow('word', SG.id)[SG.field];
    const proposed = fromText(SG.field, SG.value);
    const w2 = Object.assign({}, itemNow('word', SG.id), { [SG.field]: proposed });
    validateWord(w2, { hasWord }).forEach((e) => errs.push(e));
    if (sameValue(cur == null ? '' : cur, proposed)) errs.push('Nội dung đề xuất giống hệt nội dung hiện tại.');
    payload = { targetType: 'word', targetId: SG.id, field: SG.field, currentValue: cur == null ? '' : cur, proposedValue: proposed };
    if (SOURCE_REQUIRED.includes(SG.field) && !SG.url) errs.push('Đề xuất sửa nghĩa hoặc sắc thái cần kèm nguồn (link từ điển).');
  } else {
    if (!SG.kind) errs.push('Chọn loại lỗi.');
    payload = { targetType: 'exercise', targetId: SG.id, field: '_report', proposedValue: { kind: SG.kind, text: SG.value.trim() } };
  }
  if (SG.reason.trim().length < 10) errs.push((SG.t === 'word' ? 'Lý do' : 'Mô tả lỗi') + ' cần ít nhất 10 ký tự.');
  if (SG.url && !/^https?:\/\/\S+$/i.test(SG.url)) errs.push('Nguồn phải là một đường link bắt đầu bằng http:// hoặc https://');
  SG.errors = errs;
  if (errs.length) { paintModal(); return; }
  payload.reason = SG.reason.trim();
  payload.sourceUrl = SG.url;
  const btn = document.querySelector('[data-act="ce-s-send"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Đang gửi…'; }
  try {
    await api('submitSuggestion', payload);
    closeModal();
    MY.list = null;
    toast('Đã gửi đề xuất. Xem trạng thái ở mục "Đề xuất của tôi" trong menu tài khoản.');
  } catch (err) {
    SG.errors = [err.message];
    paintModal();
  }
}

Object.assign(actions, {
  'ce-suggest': (t) => openSuggest(t.dataset.id),
  'ce-report': (t) => openReport(t.dataset.id),
  'ce-s-send': () => submitSuggestion()
});

/* ---------------- Lịch sử và khôi phục (quản trị viên) ---------------- */

let HI = null; // {t, id, rows, error}
const SOURCE_LABEL = (s) => (s === 'admin-edit' ? 'Sửa trực tiếp' : /^suggestion:/.test(s) ? 'Chấp nhận đề xuất' : /^revert:/.test(s) ? 'Khôi phục' : s);

async function openHistory(t, id) {
  HI = { t, id, rows: null, error: '' };
  const title = t === 'word' ? (word(id) ? word(id).word : id) : 'câu ' + id;
  openModal('Lịch sử sửa · ' + title, historyHtml);
  await loadHistory();
}
async function loadHistory() {
  try { HI.rows = (await api('adminListHistory', { targetType: HI.t, targetId: HI.id })).history; HI.error = ''; } catch (err) { HI.error = err.message; }
  if (M && HI) paintModal();
}

function historyHtml() {
  if (HI.error) return '<div class="empty">' + esc(HI.error) + '</div>';
  if (!HI.rows) return '<div class="loading">Đang tải lịch sử…</div>';
  if (!HI.rows.length) return '<div class="empty">Chưa có thay đổi nào.</div>';
  // gom các dòng cùng changeId (một lần lưu sửa nhiều trường)
  const groups = [];
  HI.rows.forEach((r) => { const g = groups.find((x) => x.changeId === r.changeId); if (g) g.rows.push(r); else groups.push({ changeId: r.changeId, rows: [r] }); });
  return '<ol class="ce-hist">' + groups.map((g) => {
    const r0 = g.rows[0];
    return '<li><div class="row"><b>' + esc(r0.changedAt) + '</b><span class="muted small">' + esc(r0.changedBy) + ' · ' + esc(SOURCE_LABEL(r0.source)) + '</span></div>' +
      g.rows.map((r) => {
        const [a, b] = wordDiff(valueText(r.field, r.before), valueText(r.field, r.after));
        return '<div class="ce-diff"><div class="ce-dlabel">' + esc(FIELD_LABEL[r.field] || r.field) + '</div><div class="ce-dcols"><div><span class="ce-plabel">Trước</span><div>' + (a || '<span class="muted">(trống)</span>') + '</div></div>' +
          '<div><span class="ce-plabel">Sau</span><div>' + (b || '<span class="muted">(trống)</span>') + '</div></div></div></div>';
      }).join('') +
      '<div class="ce-actions"><button class="btn small-btn" data-act="ce-revert" data-id="' + esc(g.changeId) + '">Khôi phục về trước lần này</button></div></li>';
  }).join('') + '</ol><p class="muted small">Khôi phục tạo một thay đổi mới; lịch sử cũ được giữ nguyên.</p>';
}

async function revert(changeId, btn) {
  if (!HI) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Đang khôi phục…'; }
  try {
    const res = await api('adminRevertChange', { changeId, base: itemBase(HI.t, HI.id) });
    setContent(res.content);
    toast('Đã khôi phục.');
    render();
    await loadHistory();
  } catch (err) {
    toast(err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Khôi phục về trước lần này'; }
  }
}

Object.assign(actions, {
  'ce-hist': (t) => { if (isAdmin()) openHistory(t.dataset.t, t.dataset.id); },
  'ce-revert': (t) => revert(t.dataset.id, t)
});

/* ---------------- Trang Quản lý: hàng chờ duyệt, xuất bản sửa ---------------- */

const Q = { list: null, error: '', loading: false, rejecting: null };

export async function reloadQueue() {
  if (!isAdmin()) return;
  Q.loading = true;
  try {
    const d = await api('adminListSuggestions', {});
    Q.list = d.suggestions;
    Q.error = '';
    App.content.pending = d.pending;
  } catch (err) { Q.error = err.message; }
  Q.loading = false;
  paintQueue();
}
function paintQueue() {
  const el = document.getElementById('ceAdmin');
  if (el && App.view === 'admin') el.innerHTML = adminContentHtml();
  const b = document.getElementById('meBtn');
  if (b) b.classList.toggle('has-badge', isAdmin() && App.content.pending > 0);
}

function targetName(s) {
  if (s.targetType === 'word') return word(s.targetId) ? word(s.targetId).word : s.targetId;
  return 'câu ' + s.targetId;
}

function suggestionCard(s) {
  const isReport = s.field === '_report';
  const fieldName = isReport ? 'Báo lỗi câu' : FIELD_LABEL[s.field] || s.field;
  const now = isReport ? null : currentValue(App.vocabData, App.content.overrides, s.targetType, s.targetId, s.field);
  const changed = !isReport && !sameValue(now == null ? '' : now, s.currentValue == null ? '' : s.currentValue);
  let h = '<div class="ce-sug' + (s.status === 'deferred' ? ' deferred' : '') + '"><div class="row"><b>' +
    (s.targetType === 'word' && word(s.targetId) ? '<button class="linkish" data-act="v-jump" data-id="' + esc(s.targetId) + '">' + esc(targetName(s)) + '</button>' : esc(targetName(s))) +
    ' · ' + esc(fieldName) + '</b><span class="muted small">' + esc(s.username) + ' · ' + esc(s.createdAt) + (s.status === 'deferred' ? ' · để sau' : '') + '</span></div>';
  if (changed) h += '<p class="notice warn small">Nội dung đã thay đổi kể từ lúc người dùng đề xuất. Cột "Hiện tại" là nội dung đang hiển thị.</p>';
  if (isReport) {
    const ex = itemNow('exercise', s.targetId);
    if (ex) h += '<p class="example" style="margin:6px 0">' + gapSentence(ex) + '</p><div class="small">Đáp án: <b>' + esc(ex.type === 'se' ? ex.answers.join(', ') : ex.blanks.map((b) => b.answer).join(' · ')) + '</b></div>';
    h += '<div class="ce-dcols"><div><span class="ce-plabel">Loại lỗi</span><div>' + esc(KIND[s.proposedValue && s.proposedValue.kind] || '') + '</div></div>' +
      '<div><span class="ce-plabel">Đề xuất sửa</span><div>' + esc((s.proposedValue && s.proposedValue.text) || '(không có)') + '</div></div></div>';
  } else {
    const [a, b] = wordDiff(valueText(s.field, now), valueText(s.field, s.proposedValue));
    h += '<div class="ce-dcols"><div><span class="ce-plabel">Hiện tại</span><div>' + (a || '<span class="muted">(trống)</span>') + '</div></div>' +
      '<div><span class="ce-plabel">Đề xuất</span><div>' + (b || '<span class="muted">(trống)</span>') + '</div></div></div>';
  }
  h += '<div class="small ce-why"><b>Lý do:</b> ' + esc(s.reason) + '</div>';
  if (s.sourceUrl) h += '<div class="small ce-why"><b>Nguồn:</b> <a href="' + esc(s.sourceUrl) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(s.sourceUrl) + '</a></div>';
  if (Q.rejecting === s.suggestionId) {
    h += '<form class="ce-reject" data-id="' + esc(s.suggestionId) + '" novalidate><label class="sr-only" for="ce-rj-' + esc(s.suggestionId) + '">Lý do từ chối</label>' +
      '<input class="input" id="ce-rj-' + esc(s.suggestionId) + '" maxlength="300" placeholder="Lý do từ chối (người đề xuất sẽ thấy)">' +
      '<button class="btn primary" type="submit">Từ chối</button><button class="btn" type="button" data-act="ce-q-rjcancel">Hủy</button></form>';
  } else {
    h += '<div class="ce-actions">' +
      (isReport ? '<button class="btn primary" data-act="ce-q-editaccept" data-id="' + esc(s.suggestionId) + '">Sửa câu rồi chấp nhận</button>' +
        '<button class="btn" data-act="ce-q-accept" data-id="' + esc(s.suggestionId) + '">Chấp nhận (không cần sửa)</button>'
        : '<button class="btn primary" data-act="ce-q-accept" data-id="' + esc(s.suggestionId) + '">Chấp nhận</button>' +
          '<button class="btn" data-act="ce-q-editaccept" data-id="' + esc(s.suggestionId) + '">Sửa rồi chấp nhận</button>') +
      '<button class="btn" data-act="ce-q-reject" data-id="' + esc(s.suggestionId) + '">Từ chối</button>' +
      (s.status === 'pending' ? '<button class="btn quiet" data-act="ce-q-defer" data-id="' + esc(s.suggestionId) + '">Để sau</button>' : '') + '</div>';
  }
  return h + '</div>';
}

export function adminContentHtml() {
  let h = '<section class="ce-admin"><h2 class="section">Đề xuất chờ duyệt' + (App.content.pending ? ' <span class="badge-inline">' + App.content.pending + '</span>' : '') + '</h2>';
  if (Q.error) h += '<div class="empty">' + esc(Q.error) + ' <button class="btn quiet" data-act="ce-q-reload">Thử lại</button></div>';
  else if (!Q.list) h += '<div class="loading">Đang tải đề xuất…</div>';
  else if (!Q.list.length) h += '<p class="muted">Không có đề xuất nào đang chờ.</p>';
  else {
    const pend = Q.list.filter((s) => s.status === 'pending'), later = Q.list.filter((s) => s.status === 'deferred');
    h += pend.map(suggestionCard).join('');
    if (later.length) h += '<details class="ce-later"><summary>Để sau (' + later.length + ')</summary>' + later.map(suggestionCard).join('') + '</details>';
  }
  const ov = App.content.overrides;
  const baked = bakedOverrides(App.vocabData, ov);
  h += '<h2 class="section">Bản sửa nội dung</h2><p class="muted small">Đang áp dụng <b>' + ov.length + '</b> bản sửa (từng trường). Bản sửa nằm trong Google Sheet và được ghép lên dữ liệu gốc khi tải trang. ' +
    'Thỉnh thoảng có thể xuất ra file để đưa vào dữ liệu gốc (xem UPDATE.md).</p><div class="ce-actions">' +
    '<button class="btn" data-act="ce-export"' + (ov.length ? '' : ' disabled') + '>Xuất các bản sửa</button>' +
    '<button class="btn" data-act="ce-bake"' + (baked.length ? '' : ' disabled') + '>Đánh dấu đã đưa vào dữ liệu gốc' + (baked.length ? ' (' + baked.length + ')' : '') + '</button></div>' +
    (ov.length && !baked.length ? '<p class="muted small">Nút "Đánh dấu" chỉ bật khi dữ liệu gốc trên web đã chứa đúng nội dung bản sửa (sau khi chạy scripts/apply-overrides.js, commit, push và GitHub Pages cập nhật).</p>' : '') + '</section>';
  return h;
}

function findSug(id) { return (Q.list || []).find((s) => s.suggestionId === id); }

async function review(id, decision, extra = {}, btn) {
  if (btn) btn.disabled = true;
  try {
    const res = await api('adminReviewSuggestion', Object.assign({ suggestionId: id, decision }, extra));
    setContent(res.content);
    toast(decision === 'accept' ? 'Đã chấp nhận.' : decision === 'reject' ? 'Đã từ chối.' : 'Đã để sau.');
    Q.rejecting = null;
    await reloadQueue();
  } catch (err) {
    toast(err.message);
    if (btn) btn.disabled = false;
  }
}

function acceptAsIs(id, btn) {
  const s = findSug(id);
  if (!s) return;
  if (s.field === '_report') { review(id, 'accept', {}, btn); return; }
  // kiểm tra hợp lệ cả từ sau khi đổi; không hợp lệ thì gợi ý "Sửa rồi chấp nhận"
  const it = itemNow(s.targetType, s.targetId);
  if (!it) { toast('Không tìm thấy mục được đề xuất trong dữ liệu.'); return; }
  const after = Object.assign({}, it, { [s.field]: s.proposedValue });
  const errs = s.targetType === 'word' ? validateWord(after, { hasWord, isScale: isScale(App.idx.byId[s.targetId]) }) : validateExercise(after, { hasWord });
  if (errs.length) { toast('Đề xuất chưa hợp lệ: ' + errs[0] + '. Dùng "Sửa rồi chấp nhận".'); return; }
  review(id, 'accept', { changes: { [s.field]: s.proposedValue }, base: itemBase(s.targetType, s.targetId) }, btn);
}

function editThenAccept(id) {
  const s = findSug(id);
  if (!s) return;
  if (s.targetType === 'exercise') {
    const intro = '<div class="notice small"><b>Báo lỗi của ' + esc(s.username) + ':</b> ' + esc(KIND[s.proposedValue && s.proposedValue.kind] || '') + '. ' + esc(s.reason) +
      (s.proposedValue && s.proposedValue.text ? '<br><b>Đề xuất:</b> ' + esc(s.proposedValue.text) : '') + '</div>';
    openExerciseEditor(s.targetId, { suggestion: id, intro });
    return;
  }
  startFieldEdit(s.targetId, s.field, { mode: 'modal', suggestion: id, value: Array.isArray(s.proposedValue) ? s.proposedValue.slice() : s.proposedValue });
  openModal('Sửa rồi chấp nhận · ' + targetName(s) + ' · ' + (FIELD_LABEL[s.field] || s.field), () => '<div class="ce-ed" id="ce-ed">' + fieldEditor() + '</div>');
  focusEditor();
}

async function exportOverrides(btn) {
  if (btn) btn.disabled = true;
  try {
    const d = await api('adminExportOverrides', {});
    const blob = new Blob([JSON.stringify(d, null, 2) + '\n'], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'overrides-' + d.date + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('Đã xuất ' + d.overrides.length + ' bản sửa ra file ' + a.download + '.');
  } catch (err) { toast(err.message); }
  if (btn) btn.disabled = false;
}

async function markBaked(btn) {
  const baked = bakedOverrides(App.vocabData, App.content.overrides);
  if (!baked.length) return;
  if (!window.confirm('Tắt ' + baked.length + ' bản sửa đã nằm trong dữ liệu gốc? Nội dung hiển thị không thay đổi.')) return;
  if (btn) btn.disabled = true;
  try {
    const res = await api('adminMarkOverridesBaked', { items: baked.map((o) => ({ targetType: o.t, targetId: o.id, field: o.f, version: o.ver })) });
    setContent(res.content);
    toast('Đã đánh dấu ' + res.marked + ' bản sửa.');
    paintQueue();
  } catch (err) { toast(err.message); if (btn) btn.disabled = false; }
}

Object.assign(actions, {
  'ce-q-reload': () => reloadQueue(),
  'ce-q-accept': (t) => acceptAsIs(t.dataset.id, t),
  'ce-q-editaccept': (t) => editThenAccept(t.dataset.id),
  'ce-q-reject': (t) => { Q.rejecting = t.dataset.id; paintQueue(); const el = document.getElementById('ce-rj-' + t.dataset.id); if (el) el.focus(); },
  'ce-q-rjcancel': () => { Q.rejecting = null; paintQueue(); },
  'ce-q-defer': (t) => review(t.dataset.id, 'defer', {}, t),
  'ce-export': (t) => exportOverrides(t),
  'ce-bake': (t) => markBaked(t)
});

document.addEventListener('submit', (e) => {
  const f = e.target;
  if (!f.classList || !f.classList.contains('ce-reject')) return;
  e.preventDefault();
  const note = f.querySelector('input').value.trim();
  if (note.length < 3) { toast('Ghi ngắn lý do từ chối để người đề xuất biết.'); return; }
  review(f.dataset.id, 'reject', { note }, f.querySelector('button[type=submit]'));
});

/* ---------------- Trang "Đề xuất của tôi" ---------------- */

const MY = { list: null, error: '' };
async function loadMine() {
  try { MY.list = (await api('listMySuggestions', {})).suggestions; MY.error = ''; } catch (err) { MY.error = err.message; }
  const el = document.getElementById('myList');
  if (el && App.view === 'mysugg') el.innerHTML = myListHtml();
}
function myListHtml() {
  if (MY.error) return '<div class="empty">' + esc(MY.error) + '</div>';
  if (!MY.list) return '<div class="loading">Đang tải…</div>';
  if (!MY.list.length) return '<div class="empty">Bạn chưa gửi đề xuất nào. Trong chi tiết một từ, bấm "Đề xuất sửa"; trong câu GRE, bấm "Báo lỗi câu này".</div>';
  return '<ul class="review-list">' + MY.list.map((s) => {
    const st = STATUS[s.status] || [s.status, ''];
    return '<li><div class="row"><b>' + esc(targetName(s)) + ' · ' + esc(s.field === '_report' ? 'Báo lỗi câu' : FIELD_LABEL[s.field] || s.field) + '</b>' +
      '<span class="tag ' + st[1] + '">' + st[0] + '</span></div>' +
      '<div class="small">' + esc(valueText(s.field, s.proposedValue)) + '</div>' +
      '<div class="small muted">Lý do: ' + esc(s.reason) + '</div>' +
      (s.reviewerNote ? '<div class="small ce-note-r"><b>Ghi chú của người duyệt:</b> ' + esc(s.reviewerNote) + '</div>' : '') +
      '<div class="small muted">Gửi lúc ' + esc(s.createdAt) + (s.reviewedAt ? ' · duyệt lúc ' + esc(s.reviewedAt) : '') + '</div></li>';
  }).join('') + '</ul>';
}

views.mysugg = {
  title: 'Đề xuất của tôi',
  render() {
    return '<div class="page-head"><h1>Đề xuất của tôi</h1><p>Các đề xuất sửa và báo lỗi bạn đã gửi, trạng thái duyệt và ghi chú của người quản lý.</p></div><div id="myList">' + myListHtml() + '</div>';
  },
  after() { loadMine(); }
};

/** Đăng xuất / đổi người dùng: bỏ mọi trạng thái sửa. */
export function resetContentUi() { ED = null; Q.list = null; MY.list = null; if (modalOpen()) closeModal(); App.editMode = false; }
