// Tab Luyện Reading: chọn đoạn văn theo loại đoạn, dạng câu, trạng thái; làm bài ở chế độ Học (chấm từng câu, hiện cách làm)
// hoặc Có giờ (đồng hồ theo thời gian gợi ý, chấm khi nộp); màn tổng kết có nhật ký lý do sai; thống kê theo dạng câu.
// Lịch sử lưu trên trình duyệt này (localStorage, theo tài khoản). Đoạn đang giữ cho đề thi thử cố định chưa làm bị ẩn.
import { App, esc, views, actions, render, heldIds, now, go as goView } from '../state.js';
import { LS } from '../api.js';
import {
  LENGTHS, TASKS, TASK_ORDER, READ_GUIDE, REASONS, budgetSec, taskOf, lastByPassage, passageStatus, filterPassages, pickNext,
  gradeAttempt, taskStats, reasonStats, weakestTask, trimHistory
} from '../rcpractice.js';
import { rcAnswers } from '../reading.js';
import { practiceShell, callout, calloutList } from './ui.js';

const LETTERS = 'ABCDE';
const STATUS = { all: 'Tất cả', new: 'Chưa làm', wrong: 'Còn sai', done: 'Đã đúng hết' };
const MODES = { study: 'Học', timed: 'Có giờ' };

const histKey = () => 'gre.rcHist.' + App.user.userId;
const prefKey = () => 'gre.rcPrefs.' + App.user.userId;
const hist = () => LS.get(histKey(), []);
const saveHist = (h) => LS.set(histKey(), trimHistory(h, 400));

/** Trạng thái màn hình (chỉ trong bộ nhớ; bộ lọc và chế độ nhớ theo trình duyệt). */
const R = { screen: 'list', pid: null, mode: 'study', cur: 0, choices: {}, checked: {}, start: 0, attempt: null, f: null, fUser: null };
function prefs() {
  if (!R.f || R.fUser !== App.user.userId) {
    R.fUser = App.user.userId;
    const p = LS.get(prefKey(), {});
    R.f = { length: p.length || 'all', tasks: Array.isArray(p.tasks) ? p.tasks : [], status: p.status || 'all' };
    R.mode = MODES[p.mode] ? p.mode : 'study';
  }
  return R.f;
}
const savePrefs = () => LS.set(prefKey(), Object.assign({}, R.f, { mode: R.mode }));

const pas = (id) => App.reading.passages.find((p) => p.id === id);
const q = (id) => App.reading.byId[id];
const pad2 = (n) => ('0' + n).slice(-2);
const mmss = (s) => { const neg = s < 0; s = Math.abs(Math.round(s)); return (neg ? '−' : '') + Math.floor(s / 60) + ':' + pad2(s % 60); };
const pct = (a, b) => (b ? Math.round(100 * a / b) + '%' : '—');
/** Câu trong đoạn văn: escape rồi chuyển **...** thành chữ in đậm. */
const sentHtml = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b class="rc-bold">$1</b>');
const sentPlain = (s) => String(s || '').replace(/\*\*/g, '');
const chip = (act, id, on, label) => '<button class="chip" data-act="' + act + '" data-id="' + esc(id) + '" aria-pressed="' + !!on + '">' + label + '</button>';

function currentList() {
  const last = lastByPassage(hist());
  return filterPassages(App.reading.passages, App.reading.byId, prefs(), last, heldIds());
}

/* ---------------- Màn danh sách ---------------- */
function listScreen() {
  const f = prefs();
  const H = hist();
  const last = lastByPassage(H);
  const held = heldIds();
  const usable = App.reading.passages.filter((p) => !p.questionIds.some((id) => held.has(id)));
  const nHeld = App.reading.passages.length - usable.length;
  const list = filterPassages(App.reading.passages, App.reading.byId, f, last, held);
  const st = taskStats(H, App.reading.byId);
  const tot = Object.values(st).reduce((a, s) => ({ n: a.n + s.n, ok: a.ok + s.ok }), { n: 0, ok: 0 });
  const doneP = usable.filter((p) => last[p.id]).length;
  const weak = weakestTask(st, 3);

  let h = '<div class="page-head"><h1>Luyện Reading</h1><p>Đoạn văn tự viết theo văn phong đề GRE. Chế độ Học chấm từng câu và hiện cách làm; chế độ Có giờ bấm giờ theo thời gian gợi ý và chấm khi nộp.</p></div>';
  h += '<div class="stats"><div class="stat"><div class="stat-num">' + doneP + '<small>/' + usable.length + '</small></div><div class="stat-label">Đoạn đã làm</div></div>' +
    '<div class="stat"><div class="stat-num">' + pct(tot.ok, tot.n) + '</div><div class="stat-label">Đúng (lần gần nhất mỗi câu)</div></div>' +
    '<div class="stat"><div class="stat-num">' + tot.n + '</div><div class="stat-label">Câu đã làm</div></div>' +
    '<div class="stat' + (weak ? ' alert' : '') + '"><div class="stat-num" style="font-size:20px">' + (weak ? esc(TASKS[weak.task].label) : '—') + '</div><div class="stat-label">' + (weak ? 'Dạng yếu nhất (' + pct(weak.r * weak.n, weak.n) + ')' : 'Dạng yếu nhất (cần ≥ 3 câu)') + '</div></div></div>';

  h += '<section class="card rcp-setup"><div class="field"><span class="label">Chế độ</span><div class="chips-wrap">' +
    Object.keys(MODES).map((m) => chip('rcp-mode', m, R.mode === m, MODES[m])).join('') + '</div>' +
    '<div class="help">' + (R.mode === 'study' ? 'Không tính giờ gắt. Chọn đáp án rồi bấm Kiểm tra để xem đúng sai, giải thích, cách làm và bẫy của dạng câu.' : 'Đồng hồ đếm ngược theo 1,5 phút mỗi câu (đoạn dài thêm 1 phút đọc). Hết giờ vẫn làm tiếp được, đồng hồ chuyển đỏ. Chấm khi nộp.') + '</div></div>';
  h += '<div class="field"><span class="label">Loại đoạn</span><div class="chips-wrap">' + chip('rcp-len', 'all', f.length === 'all', 'Tất cả') +
    Object.keys(LENGTHS).map((k) => chip('rcp-len', k, f.length === k, LENGTHS[k])).join('') + '</div></div>';
  h += '<div class="field"><span class="label">Dạng câu <span class="muted small">(chọn nhiều; đoạn có ít nhất một câu thuộc dạng đã chọn)</span></span><div class="chips-wrap">' +
    chip('rcp-task', 'all', !f.tasks.length, 'Tất cả') + TASK_ORDER.map((t) => chip('rcp-task', t, f.tasks.includes(t), esc(TASKS[t].label))).join('') + '</div></div>';
  h += '<div class="field"><span class="label">Trạng thái</span><div class="chips-wrap">' + Object.keys(STATUS).map((k) => chip('rcp-status', k, f.status === k, STATUS[k])).join('') + '</div></div>';
  h += '<div class="form-grid"><button class="btn primary big" data-act="rcp-next"' + (list.length ? '' : ' disabled') + '>Làm đoạn tiếp theo' + (list.length ? ' (' + list.length + ' đoạn phù hợp)' : ': không có đoạn phù hợp') + '</button></div></section>';


  if (tot.n) {
    h += '<h2 class="section">Theo dạng câu</h2><div class="table-wrap"><table class="mock-table rcp-stats"><thead><tr><th>Dạng</th><th>Câu</th><th>Đúng</th><th>Giây/câu</th><th></th></tr></thead><tbody>' +
      TASK_ORDER.filter((t) => st[t]).map((t) => {
        const s = st[t];
        const r = s.ok / s.n;
        return '<tr><td>' + esc(TASKS[t].label) + '</td><td>' + s.n + '</td><td class="' + (r < 0.6 ? 'bad' : r >= 0.85 ? 'good' : '') + '">' + pct(s.ok, s.n) + '</td><td>' + Math.round(s.sec / s.n) + '</td>' +
          '<td><button class="linkish" data-act="rcp-drill" data-id="' + t + '">Luyện dạng này</button></td></tr>';
      }).join('') + '</tbody></table></div>';
    const rs = reasonStats(H);
    const rk = Object.keys(rs).sort((a, b) => rs[b] - rs[a]);
    if (rk.length) h += '<p class="small muted">Lý do sai đã ghi: ' + rk.map((k) => esc(REASONS[k]) + ' (' + rs[k] + ')').join(' · ') + '</p>';
  }

  h += '<h2 class="section">Đoạn văn (' + list.length + ')</h2>';
  if (!list.length) h += '<div class="empty">Không có đoạn nào khớp bộ lọc.</div>';
  else {
    h += '<ul class="review-list rcp-list">' + list.map((p) => {
      const s = passageStatus(p.id, last);
      const a = last[p.id];
      const tasks = [...new Set(p.questionIds.map((id) => taskOf(q(id))))];
      const tag = s === 'new' ? '<span class="tag">Chưa làm</span>' : s === 'done' ? '<span class="tag known">✓ ' + a.items.length + '/' + a.items.length + '</span>' :
        '<span class="tag leech">' + a.items.filter((x) => x.ok).length + '/' + a.items.length + '</span>';
      return '<li><div class="row"><b>' + esc(p.title) + '</b><span class="muted small">' + esc(LENGTHS[p.length] || p.length) + ' · ' + p.questionIds.length + ' câu · ' + mmss(budgetSec(p)) + '</span><span class="spacer"></span>' + tag +
        '<button class="btn" data-act="rcp-open" data-id="' + esc(p.id) + '">' + (s === 'new' ? 'Làm' : 'Làm lại') + '</button></div>' +
        '<div class="small muted">' + tasks.map((t) => esc(TASKS[t].label)).join(' · ') + '</div></li>';
    }).join('') + '</ul>';
  }
  h += '<p class="small muted" style="margin-top:14px">Lịch sử luyện Reading lưu trên trình duyệt này.' + (nHeld ? ' ' + nHeld + ' đoạn đang được giữ cho đề thi thử cố định bạn chưa làm, sẽ hiện ở đây sau khi bạn làm đề đó.' : '') + '</p>';
  return h;
}

/* ---------------- Màn làm bài ---------------- */
function startPassage(pid) {
  const p = pas(pid);
  if (!p) return;
  Object.assign(R, { screen: 'do', pid, cur: 0, choices: {}, checked: {}, start: now(), attempt: null });
  render(); window.scrollTo(0, 0);
}

const isChecked = (id) => R.mode === 'study' && !!R.checked[id];

function passageHtml(p, e, showAns) {
  let k = 0;
  const pick = e.kind === 'sentence' && !isChecked(e.id) && !showAns;
  const sel = (R.choices[e.id] || [])[0];
  return p.paragraphs.map((para) => '<p>' + para.map((s) => {
    const i = k++;
    let cls = 'rc-sent' + (pick ? ' pick' : '');
    if (e.kind === 'sentence' && sel === String(i)) cls += ' on';
    if (e.kind === 'sentence' && (isChecked(e.id) || showAns) && e.answer === i) cls += ' ans';
    return pick
      ? '<span class="' + cls + '" role="radio" tabindex="0" aria-checked="' + (sel === String(i)) + '" data-act="rcp-pick" data-o="' + i + '">' + sentHtml(s) + '</span> '
      : '<span class="' + cls + '">' + sentHtml(s) + '</span> ';
  }).join('') + '</p>').join('');
}

function routineHtml(t, open) {
  const T = TASKS[t];
  return '<details class="rcp-routine"' + (open ? ' open' : '') + '><summary>💡 Cách làm dạng ' + esc(T.label) + '</summary>' +
    calloutList('tip', 'Ba bước', T.steps, true) + calloutList('trap', 'Bẫy hay gặp', T.traps) + '</details>';
}

function optionsHtml(e) {
  const c = R.choices[e.id] || [];
  const done = isChecked(e.id);
  const ans = rcAnswers(e);
  const multi = e.kind === 'multi';
  return '<div class="options" role="' + (multi ? 'group' : 'radiogroup') + '">' + e.options.map((o, k) => {
    const on = c.includes(o);
    let cls = '', mark = '';
    if (done) { if (ans.includes(o)) { cls = ' correct'; mark = '✓'; } else if (on) { cls = ' wrong'; mark = '✗'; } }
    return '<button class="opt' + (multi ? ' se-box' : '') + cls + '" role="' + (multi ? 'checkbox' : 'radio') + '" aria-checked="' + on + '"' + (done ? ' disabled' : '') +
      ' data-act="rcp-pick" data-o="' + esc(o) + '"><span class="num">' + (multi ? k + 1 : LETTERS[k]) + '</span><span>' + esc(o) + '</span><span class="mark">' + mark + '</span></button>';
  }).join('') + '</div>';
}

function doScreen() {
  const p = pas(R.pid);
  const ids = p.questionIds;
  const e = q(ids[R.cur]);
  const t = taskOf(e);
  const study = R.mode === 'study';
  const done = isChecked(e.id);
  const answered = (R.choices[e.id] || []).length > 0;

  let h = '<div class="rcp-bar"><button class="btn" data-act="rcp-list">← Danh sách</button><div class="rcp-title"><b>' + esc(p.title) + '</b><span class="muted small">' + esc(LENGTHS[p.length] || '') + ' · ' + MODES[R.mode] + '</span></div>' +
    '<span class="rcp-timer" id="rcpTimer" aria-live="off"></span></div>';
  h += '<div class="rcp-dots" role="group" aria-label="Các câu">' + ids.map((id, k) => {
    const st = isChecked(id) ? (gradeAttempt({ questionIds: [id] }, App.reading.byId, R.choices)[0].ok ? ' ok' : ' bad') : (R.choices[id] || []).length ? ' ans' : '';
    return '<button class="rcp-dot' + st + (k === R.cur ? ' cur' : '') + '" data-act="rcp-go" data-k="' + k + '">Câu ' + (k + 1) + '</button>';
  }).join('') + '</div>';

  h += '<div class="rc-wrap"><section class="card rc-passage" aria-label="Đoạn văn"><div class="card-kind"><span>' + (ids.length > 1 ? 'Câu 1 đến ' + ids.length + ' dựa trên đoạn văn này' : 'Câu hỏi dựa trên đoạn văn này') + '</span></div>' +
    '<div class="rc-text">' + passageHtml(p, e) + '</div></section>';
  h += '<article class="card exam-q rc-q"><div class="card-kind"><span>Câu ' + (R.cur + 1) + '/' + ids.length + '</span><span class="dotsep">' + esc(TASKS[t].label) + '</span></div>';
  if (e.kind === 'multi') h += '<p class="muted small rc-dir">Consider each of the choices separately and select all that apply.</p>';
  h += '<p class="rc-stem">' + esc(e.stem) + '</p>';
  if (e.kind === 'sentence') {
    const sel = (R.choices[e.id] || [])[0];
    h += done ? '' : '<p class="muted small">Bấm vào một câu trong đoạn văn để chọn; bấm câu khác để đổi.</p>';
    if (sel != null) h += '<div class="rc-chosen">Đã chọn: <i>' + esc(sentPlain(p.sentences[+sel])) + '</i></div>';
  } else h += optionsHtml(e);

  if (done) {
    const ok = gradeAttempt({ questionIds: [e.id] }, App.reading.byId, R.choices)[0].ok;
    h += '<div class="rcp-verdict ' + (ok ? 'good' : 'bad') + '">' + (ok ? '✓ Đúng' : '✗ Chưa đúng') + (e.kind === 'sentence' && !ok ? ': câu đúng được tô xanh trong đoạn văn' : '') + '</div>' +
      '<div class="explain small">' + esc(e.explanation || '') + '</div>' + routineHtml(t, !ok);
  } else if (study) h += routineHtml(t, false);

  const last = R.cur === ids.length - 1;
  h += '<div class="form-grid rcp-actions">';
  if (R.cur > 0) h += '<button class="btn" data-act="rcp-prev">← Câu trước</button>';
  if (study && !done) h += '<button class="btn primary" data-act="rcp-check"' + (answered ? '' : ' disabled') + '>Kiểm tra</button>';
  else if (!last) h += '<button class="btn primary" data-act="rcp-nextq">Câu tiếp →</button>';
  if (study && done && last) h += '<button class="btn primary" data-act="rcp-finish">Xem tổng kết</button>';
  if (!study) h += '<button class="btn' + (last ? ' primary' : '') + '" data-act="rcp-finish">Nộp bài</button>';
  h += '</div><p class="muted small">Phím tắt: 1–5 hoặc A–E chọn phương án, Enter ' + (study ? 'kiểm tra / câu tiếp' : 'câu tiếp (nộp bằng nút Nộp bài)') + ', ← → đổi câu.</p></article></div>';
  return h;
}

function tick() {
  const el = document.getElementById('rcpTimer');
  if (!el || R.screen !== 'do') return;
  const p = pas(R.pid);
  const used = (now() - R.start) / 1000;
  if (R.mode === 'timed') {
    const left = budgetSec(p) - used;
    el.textContent = '⏱ ' + mmss(left);
    el.classList.toggle('over', left < 0);
  } else el.textContent = '⏱ ' + mmss(used) + ' / gợi ý ' + mmss(budgetSec(p));
}

function finish() {
  const p = pas(R.pid);
  const items = gradeAttempt(p, App.reading.byId, R.choices);
  const a = { pid: p.id, mode: R.mode, at: now(), sec: Math.round((now() - R.start) / 1000), items };
  const H = hist(); H.push(a); saveHist(H);
  R.attempt = a; R.screen = 'result';
  render(); window.scrollTo(0, 0);
}

/* ---------------- Màn tổng kết ---------------- */
function resultScreen() {
  const a = R.attempt, p = pas(a.pid);
  const n = a.items.length, ok = a.items.filter((x) => x.ok).length, b = budgetSec(p);
  let h = '<div class="page-head"><h1>' + esc(p.title) + ': ' + ok + '/' + n + ' câu đúng</h1><p>' + MODES[a.mode] + ' · thời gian ' + mmss(a.sec) + ' (gợi ý ' + mmss(b) + ')' +
    (a.sec > b ? ' · <span class="bad">chậm hơn gợi ý ' + mmss(a.sec - b) + '</span>' : '') + '</p></div>';
  h += '<details class="card rc-res-passage"><summary>Xem lại đoạn văn</summary><div class="rc-text">' + p.paragraphs.map((para) => '<p>' + para.map((s) => sentHtml(s)).join(' ') + '</p>').join('') + '</div></details>';
  h += '<ol class="review-list rcp-res">' + a.items.map((x, k) => {
    const e = q(x.q);
    const t = taskOf(e);
    const show = (arr) => (e.kind === 'sentence' ? arr.map((i) => sentPlain(p.sentences[+i]) || '?') : arr.map((o) => {
      const i = e.options.indexOf(o);
      return (e.kind === 'mc' ? LETTERS[i] : i + 1) + '. ' + o;
    })).join('; ');
    let li = '<li><div class="row"><b>Câu ' + (k + 1) + '</b><span class="muted small">' + esc(TASKS[t].label) + '</span><span class="spacer"></span>' +
      (x.ok ? '<span class="tag known">✓ Đúng</span>' : x.c.length ? '<span class="tag leech">✗ Sai</span>' : '<span class="tag leech">○ Bỏ trống</span>') + '</div>' +
      '<p class="example" style="margin:6px 0">' + esc(e.stem) + '</p>' +
      '<div class="small">Bạn chọn: <b>' + esc(x.c.length ? show(x.c) : '(bỏ trống)') + '</b><br>Đáp án: <b>' + esc(show(rcAnswers(e))) + '</b></div>' +
      '<div class="explain small">' + esc(e.explanation || '') + '</div>';
    if (!x.ok) {
      li += '<div class="field rcp-reason"><span class="label small">Vì sao sai? (ghi vào nhật ký)</span><div class="chips-wrap">' +
        Object.keys(REASONS).map((r) => '<button class="chip" data-act="rcp-reason" data-k="' + k + '" data-id="' + r + '" aria-pressed="' + (x.reason === r) + '">' + esc(REASONS[r]) + '</button>').join('') + '</div></div>' +
        routineHtml(t, true);
    }
    return li + '</li>';
  }).join('') + '</ol>';
  h += '<div class="form-grid" style="margin-top:20px"><button class="btn primary big" data-act="rcp-next">Đoạn tiếp theo</button>' +
    '<button class="btn big" data-act="rcp-open" data-id="' + esc(p.id) + '">Làm lại đoạn này</button><button class="btn big" data-act="rcp-list">Về danh sách</button></div>';
  return h;
}

/* ---------------- View và hành động ---------------- */
views.reading = {
  title: 'Luyện Reading',
  wide: () => R.screen === 'do',
  enter() { if (R.screen === 'do' && !pas(R.pid)) R.screen = 'list'; },
  render() {
    prefs();
    if (R.screen === 'do' && pas(R.pid)) return doScreen();
    if (R.screen === 'result' && R.attempt && pas(R.attempt.pid)) return resultScreen();
    R.screen = 'list';
    return practiceShell('reading', listScreen());
  },
  after() {
    if (R.screen === 'do') {
      tick();
      App.timer = setInterval(tick, 1000);
      App.keyHandler = keys;
    }
  }
};

function keys(ev) {
  const p = pas(R.pid);
  const e = q(p.questionIds[R.cur]);
  const k = ev.key;
  // Câu trong đoạn văn đang được focus (dạng chọn câu): Enter hoặc Space để chọn
  const tg = ev.target;
  if ((k === 'Enter' || k === ' ') && tg && tg.dataset && tg.dataset.act === 'rcp-pick') { ev.preventDefault(); return pick(e, tg.dataset.o); }
  if (k === 'ArrowRight') { ev.preventDefault(); return go(R.cur + 1); }
  if (k === 'ArrowLeft') { ev.preventDefault(); return go(R.cur - 1); }
  if (k === 'Enter') {
    ev.preventDefault();
    if (R.mode === 'study' && !isChecked(e.id)) { if ((R.choices[e.id] || []).length) actions['rcp-check'](); return; }
    if (R.cur < p.questionIds.length - 1) return go(R.cur + 1);
    if (R.mode === 'study' && isChecked(e.id)) return finish(); // Có giờ: nộp bằng nút, tránh nộp nhầm
    return;
  }
  if (e.kind === 'sentence' || isChecked(e.id)) return;
  let i = -1;
  if (/^[1-5]$/.test(k)) i = +k - 1;
  else if (/^[a-eA-E]$/.test(k)) i = 'abcde'.indexOf(k.toLowerCase());
  if (i >= 0 && i < e.options.length) { ev.preventDefault(); pick(e, e.options[i]); }
}

function go(k) {
  const n = pas(R.pid).questionIds.length;
  if (k < 0 || k >= n) return;
  R.cur = k; render();
}

function pick(e, o) {
  if (isChecked(e.id)) return;
  const c = R.choices[e.id] || [];
  if (e.kind === 'multi') R.choices[e.id] = c.includes(o) ? c.filter((x) => x !== o) : c.concat([o]);
  else R.choices[e.id] = [String(o)];
  render();
}

Object.assign(actions, {
  'rcp-mode': (t) => { R.mode = t.dataset.id; savePrefs(); render(); },
  'rcp-len': (t) => { prefs().length = t.dataset.id; savePrefs(); render(); },
  'rcp-status': (t) => { prefs().status = t.dataset.id; savePrefs(); render(); },
  'rcp-task': (t) => {
    const f = prefs(), id = t.dataset.id;
    f.tasks = id === 'all' ? [] : f.tasks.includes(id) ? f.tasks.filter((x) => x !== id) : f.tasks.concat([id]);
    savePrefs(); render();
  },
  'rcp-drill': (t) => { Object.assign(prefs(), { tasks: [t.dataset.id], length: 'all', status: 'all' }); savePrefs(); render(); window.scrollTo(0, 0); },
  'rcp-next': () => {
    const p = pickNext(currentList(), lastByPassage(hist()), R.screen === 'result' && R.attempt ? R.attempt.pid : null);
    if (p) startPassage(p.id); else { R.screen = 'list'; render(); }
  },
  'rcp-open': (t) => startPassage(t.dataset.id),
  'rcp-list': () => { R.screen = 'list'; R.attempt = null; render(); window.scrollTo(0, 0); },
  'rcp-go': (t) => go(+t.dataset.k),
  'rcp-prev': () => go(R.cur - 1),
  'rcp-nextq': () => go(R.cur + 1),
  'rcp-pick': (t) => { const e = q(pas(R.pid).questionIds[R.cur]); pick(e, t.dataset.o); },
  'rcp-check': () => { const e = q(pas(R.pid).questionIds[R.cur]); if ((R.choices[e.id] || []).length) { R.checked[e.id] = true; render(); } },
  'rcp-finish': () => finish(),
  'rcp-reason': (t) => {
    const k = +t.dataset.k, r = t.dataset.id;
    const it = R.attempt.items[k];
    it.reason = it.reason === r ? undefined : r;
    const H = hist();
    const i = H.findIndex((a) => a.pid === R.attempt.pid && a.at === R.attempt.at);
    if (i >= 0) { H[i] = R.attempt; saveHist(H); }
    render();
  }
});

/* ---------------- Đoạn văn trong ngày (hiện ở trang Hôm nay) ---------------- */
const dailyKey = () => 'gre.rcDaily.' + App.user.userId;
/** Đoạn văn trong ngày: chọn một lần mỗi ngày (ưu tiên đoạn chưa làm, rồi đoạn còn sai), giữ nguyên cả ngày. */
export function dailyPassage(day) {
  const saved = LS.get(dailyKey(), null);
  const held = heldIds();
  if (saved && saved.day === day && pas(saved.pid) && !pas(saved.pid).questionIds.some((id) => held.has(id))) return pas(saved.pid);
  const usable = App.reading.passages.filter((p) => !p.questionIds.some((id) => held.has(id)));
  const p = pickNext(usable, lastByPassage(hist()), null);
  if (p) LS.set(dailyKey(), { day, pid: p.id });
  return p;
}
/** Thẻ đoạn văn trong ngày cho trang Hôm nay. */
export function dailyReadingCard(day) {
  const p = dailyPassage(day);
  if (!p) return '<div class="card warm-card"><p class="muted">Chưa có đoạn văn nào dùng được.</p></div>';
  const todayAt = (a) => a && a.pid === p.id && new Date(a.at + 7 * 3600e3).toISOString().slice(0, 10) === day;
  const a = hist().filter(todayAt).pop();
  const tasks = [...new Set(p.questionIds.map((id) => taskOf(q(id))))];
  const preview = sentPlain(p.sentences[0]);
  let h = '<div class="card warm-card"><div class="warm-meta">📖 ' + esc(LENGTHS[p.length] || '') + ' · ' + p.questionIds.length + ' câu · gợi ý ' + mmss(budgetSec(p)) + '</div>' +
    '<h3 class="warm-title">' + esc(p.title) + '</h3><p class="warm-preview">' + esc(preview.length > 220 ? preview.slice(0, 217) + '…' : preview) + '</p>' +
    '<div class="warm-tags">' + tasks.map((t) => '<span class="tag">' + esc(TASKS[t].label) + '</span>').join('') + '</div>';
  if (a) {
    const ok = a.items.filter((x) => x.ok).length;
    h += '<div class="warm-done ' + (ok === a.items.length ? 'good' : 'bad') + '">' + (ok === a.items.length ? '✓' : '✗') + ' Đã làm hôm nay: ' + ok + '/' + a.items.length + ' câu đúng, ' + mmss(a.sec) + '</div>' +
      '<div class="warm-actions"><button class="btn" data-act="rcp-daily" data-id="' + esc(p.id) + '">Làm lại</button></div>';
  } else h += '<div class="warm-actions"><button class="btn primary" data-act="rcp-daily" data-id="' + esc(p.id) + '">Làm ngay (chế độ Học)</button></div>';
  return h + '</div>';
}
actions['rcp-daily'] = (t) => {
  if (!pas(t.dataset.id)) return;
  prefs(); R.mode = 'study';
  Object.assign(R, { screen: 'do', pid: t.dataset.id, cur: 0, choices: {}, checked: {}, start: now(), attempt: null });
  goView('reading');
};
// Từ tab kiến thức Reading: mở Luyện tập › Reading, lọc sẵn một dạng câu
actions['rcp-drill-go'] = (t) => {
  Object.assign(prefs(), { tasks: [t.dataset.id], length: 'all', status: 'all' }); savePrefs();
  R.screen = 'list'; R.attempt = null;
  goView('reading');
};
