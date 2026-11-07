// Trang Thi thử section Verbal: màn bắt đầu + lịch sử, làm bài như thật (đồng hồ, Trước/Tiếp, Đánh dấu,
// Xem lại), màn chuyển section, màn kết quả. Bài đang làm lưu tạm trong localStorage để tải lại trang vẫn làm
// tiếp, đồng hồ chạy theo thời gian thực. Kết quả lưu vào tab mocks (saveMock), gửi lại nếu mất mạng.
import { exTools } from './content.js';
import { App, S, esc, views, actions, word, record, touch, render, go, toast, isTyping, now, stopTimer, heldIds } from '../state.js';
import { call, LS, isAuthError } from '../api.js';
import {
  MODES, SECTION_SPEC, KIND_LABEL, ADAPT_THRESHOLD, exKind, isAnswered, isTouched, planSections, pickSection, adaptFrom,
  gradeItem, encodeChoice, decodeChoice, summarize
} from '../mock.js';
import { startSession, startWordsSession } from './session.js';
import { difficultyHtml, skillsHtml, wordsInQuestionHtml, vocabIntroHtml } from './grevocab.js';
import { SKILLS, DIFFICULTY } from '../bank.js';

const ROMAN = ['i', 'ii', 'iii'];
const M = { screen: 'start', resultId: null, mode: 's1', clusters: [], confirm: false, prep: null };
const runKey = () => 'gre.mockRun.' + App.user.userId;
const queueKey = () => 'gre.mockQueue.' + App.user.userId;
let run = null, runUser = null;

/* ---------------- Trạng thái bài đang làm ---------------- */

export function activeRun() {
  if (!App.user) return null;
  if (runUser !== App.user.userId) { run = LS.get(runKey(), null); runUser = App.user.userId; }
  return run;
}
function saveRun() { if (!App.user) return; if (run) LS.set(runKey(), run); else LS.del(runKey()); }
const curSec = () => run.sections[run.sec];
const curItem = () => curSec().items[run.cur];
const ex = (id) => App.idx.exById[id];

const pad2 = (n) => ('0' + n).slice(-2);
const mmss = (sec) => { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ':' + pad2(sec % 60); };
function vnStamp(ms) { const d = new Date(ms + 7 * 3600e3); return pad2(d.getUTCDate()) + '/' + pad2(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear() + ' ' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ':' + pad2(d.getUTCSeconds()); }
const shortDate = (stamp) => String(stamp || '').slice(0, 16);

/** Câu cho thi thử ngẫu nhiên: bỏ câu đang giữ cho đề cố định chưa làm. */
function poolFor(clusters) {
  const held = heldIds();
  return App.idx.exercises.filter((e) => !held.has(e.id) && (!clusters.length || clusters.includes(e.clusterId)));
}

/* ---------------- Đề cố định ---------------- */
export const fixedById = (id) => (App.fixedMocks || []).find((m) => m.id === id) || null;
/** Khóa riêng của MỘT lần làm: đề ngẫu nhiên dùng mockId; đề cố định (mockId = id đề) thêm thời điểm bắt đầu. */
export const entryKey = (m) => (m.mode === 'fixed' ? m.mockId + '~' + m.startedMs : m.mockId);
const modeLabel = (m) => (m.mode === 'fixed' ? (fixedById(m.mockId) || { title: m.mockId }).title : (MODES[m.mode] || { label: m.mode }).label);
const attemptsOf = (id) => (App.mocks || []).filter((m) => m.mode === 'fixed' && m.mockId === id).sort((a, b) => b.startedMs - a.startedMs);
const fixedItemIds = (fm) => fm.sections.flatMap((s) => s.items).filter((id) => ex(id));
const sumOf = (m) => m.sections.reduce((a, s) => ({ sc: a.sc + s.score, t: a.t + s.total, d: a.d + s.durationSec }), { sc: 0, t: 0, d: 0 });

/** Cộng thời gian đang xem câu hiện tại vào câu đó. */
function leaveQ() {
  if (!run || run.phase !== 'q') return;
  const it = curItem();
  it.t = (it.t || 0) + Math.max(0, now() - (run.qEnter || now())) / 1000;
  run.qEnter = now();
}

function newSection(no, ids, min) {
  return {
    no, min, items: ids.map((id) => {
      const e = ex(id);
      return { ex: id, order: e.type === 'se' ? [S.shuffle(e.options)] : e.blanks.map((b) => S.shuffle(b.options)), choice: e.type === 'se' ? [] : e.blanks.map(() => null), marked: false, t: 0 };
    }), startMs: null, deadline: null, endMs: null, score: null
  };
}

function beginSection() {
  const s = curSec();
  s.startMs = now();
  s.deadline = s.startMs + s.min * 60000;
  run.phase = 'q';
  run.cur = 0;
  run.qEnter = now();
  M.confirm = false;
  saveRun();
}

/** Chuẩn bị đề ngẫu nhiên: chọn câu Section đầu (Section sau chọn khi nộp Section trước, theo kết quả). */
function prepRandom() {
  const pool = poolFor(M.clusters);
  const plan = planSections(M.mode, pool.length);
  if (!plan.sections.every((s) => s.n > 0)) { toast('Phạm vi này chưa đủ câu để thi thử.'); return null; }
  const first = plan.sections[0];
  return { kind: 'random', mode: M.mode, clusters: M.clusters.slice(), plan: plan.sections, ids: pickSection(pool, first.n, { exRes: App.exRes, today: S.vnDate(now()) }) };
}
/** Chuẩn bị đề cố định: thứ tự câu đúng như file đề; thứ tự phương án vẫn xáo trộn khi tạo section. */
function prepFixed(id) {
  const fm = fixedById(id);
  if (!fm) { toast('Không tìm thấy đề này.'); return null; }
  const plan = fm.sections.map((s, k) => ({ no: k + 1, title: s.title, min: s.minutes, ids: s.items.filter((x) => ex(x)), n: 0 }));
  plan.forEach((p) => { p.n = p.ids.length; });
  if (!plan.every((p) => p.n)) { toast('Đề này đang thiếu câu, báo người quản lý.'); return null; }
  return { kind: 'fixed', mode: 'fixed', fixedId: fm.id, clusters: (fm.clusters || []).slice(), plan, ids: plan[0].ids };
}
/** Bấm Làm đề / Bắt đầu: hiện màn "Từ vựng cần biết" (nếu bật) rồi mới vào bài. */
function requestStart(prep) {
  if (!prep) return;
  if (App.settings.skipVocabIntro) { launch(prep); return; }
  M.prep = prep;
  M.screen = 'intro';
  render();
  window.scrollTo(0, 0);
}
function launch(prep) {
  M.prep = null;
  const first = prep.plan[0];
  const t0 = Math.floor(now() / 1000) * 1000; // làm tròn giây: khớp mốc giờ server lưu (dd/MM/yyyy HH:mm:ss)
  run = {
    v: 1, id: prep.kind === 'fixed' ? prep.fixedId : 'mk' + now().toString(36) + Math.random().toString(36).slice(2, 6),
    fixedId: prep.fixedId || null, mode: prep.mode, clusters: prep.clusters,
    plan: prep.plan, startedAt: t0, sec: 0, cur: 0, phase: 'q', qEnter: now(), hideTimer: false, sections: [newSection(first.no, prep.ids, first.min)]
  };
  runUser = App.user.userId;
  beginSection();
  M.screen = 'start';
  go('mock', []);
}

/** Nộp section hiện tại (bấm Nộp, hoặc hết giờ). */
function submitSection() {
  if (!run) return;
  leaveQ();
  stopTimer();
  const s = curSec();
  s.endMs = Math.min(now(), s.deadline || now());
  let score = 0;
  s.items.forEach((it) => { if (gradeItem(ex(it.ex), it.choice, App.idx).correct) score++; });
  s.score = score;
  const next = run.plan[run.sec + 1];
  if (next) {
    const used = new Set(run.sections.flatMap((x) => x.items.map((i) => i.ex)));
    let ids;
    if (run.fixedId) ids = next.ids; // đề cố định: đúng thứ tự trong file, không thích ứng
    else {
      run.adapt = adaptFrom(score, s.items.length);
      ids = pickSection(poolFor(run.clusters), next.n, { exRes: App.exRes, today: S.vnDate(now()), prefer: run.adapt, exclude: used });
    }
    run.sections.push(newSection(next.no, ids, next.min));
    run.sec++;
    run.phase = 'break';
    saveRun();
    render();
    window.scrollTo(0, 0);
    return;
  }
  finishMock();
}

/** Xong bài: cập nhật lặp lại ngắt quãng, lưu kết quả (hàng đợi riêng, gửi lại nếu lỗi), hiện màn kết quả. */
function finishMock() {
  const finishedAt = now();
  const result = {
    mockId: run.fixedId || run.id, mode: run.mode, startedAt: run.startedAt, finishedAt, adapt: run.adapt || null,
    sections: run.sections.map((s) => ({
      section: s.no, score: s.score, total: s.items.length,
      durationSec: Math.round(((s.endMs || finishedAt) - s.startMs) / 1000),
      items: s.items.map((it) => {
        const e = ex(it.ex);
        return { i: it.ex, c: encodeChoice(it.choice), ok: gradeItem(e, it.choice, App.idx).correct ? 1 : 0, t: Math.round(it.t || 0) };
      })
    }))
  };
  // Lặp lại ngắt quãng theo đúng quy tắc hiện có (mỗi từ lên hộp tối đa một lần mỗi ngày); câu bỏ trống không tính.
  run.sections.forEach((s) => s.items.forEach((it) => {
    const e = ex(it.ex);
    const gr = gradeItem(e, it.choice, App.idx);
    if (!gr.answered) return;
    const info = { mode: 'mock', exerciseId: e.id, chosen: encodeChoice(it.choice) };
    const graded = {};
    gr.g.answerIds.forEach((id) => {
      record(id, gr.correct ? 'good' : 'again', info, gr.g.confusions.filter((x) => x.wordId === id).map((x) => x.confusedWith));
      graded[id] = true;
    });
    gr.g.otherTargetIds.forEach((id) => { if (!graded[id]) touch(id, info); });
  }));
  const entry = entryFromResult(result);
  result.key = entryKey(entry);
  const q = LS.get(queueKey(), []);
  q.push(result);
  LS.set(queueKey(), q);
  App.mocks = [entry].concat((App.mocks || []).filter((m) => entryKey(m) !== result.key));
  run = null;
  saveRun();
  M.screen = 'result';
  M.resultId = result.key;
  go('mock', ['result', result.key]);
  flushMockQueue();
}

function entryFromResult(r) {
  return { mockId: r.mockId, mode: r.mode, startedAt: vnStamp(r.startedAt), finishedAt: vnStamp(r.finishedAt), startedMs: r.startedAt, adapt: r.adapt, sections: r.sections, pending: true };
}
/** Các bài đã làm nhưng chưa lưu được lên máy chủ (để lịch sử và việc giữ câu không bị mất khi tải lại từ server). */
export function pendingEntries() {
  if (!App.user) return [];
  return LS.get(queueKey(), []).map(entryFromResult);
}

let flushing = false;
/** Gửi các bài thi thử chưa lưu được lên tab mocks. */
export async function flushMockQueue() {
  if (flushing || !App.user || !App.token) return;
  flushing = true;
  try {
    let q = LS.get(queueKey(), []);
    while (q.length) {
      const r = q[0];
      try {
        await call('saveMock', { mockId: r.mockId, mode: r.mode, startedAt: r.startedAt, finishedAt: r.finishedAt, sections: r.sections }, App.token);
      } catch (err) {
        if (isAuthError(err) || ['network', 'busy', 'server_error', 'not_ready'].includes(err.code)) break; // thử lại sau
      }
      const rk = r.key || r.mockId;
      q = LS.get(queueKey(), []).filter((x) => (x.key || x.mockId) !== rk);
      LS.set(queueKey(), q);
      const m = (App.mocks || []).find((x) => entryKey(x) === rk);
      if (m) delete m.pending;
    }
  } finally { flushing = false; }
}

/* ---------------- Trang ---------------- */

views.mock = {
  title: 'Thi thử',
  enter(sub) {
    M.confirm = false;
    M.prep = null;
    if (sub && sub[0] === 'result' && sub[1]) { M.screen = 'result'; M.resultId = sub[1]; } else { M.screen = 'start'; M.resultId = null; }
  },
  path() { return !activeRun() && M.screen === 'result' && M.resultId ? ['result', M.resultId] : []; },
  immersive() { const r = activeRun(); return !!r && App.view === 'mock'; },
  render() {
    if (activeRun()) return runScreen();
    if (M.screen === 'result') return resultScreen();
    if (M.screen === 'intro' && M.prep) return introScreen();
    return startScreen();
  },
  after() { if (activeRun() && run.phase !== 'break') startClock(); }
};

/* ---------------- Màn bắt đầu ---------------- */

function startScreen() {
  const clusters = App.idx.clusters.filter((c) => !c.custom);
  M.clusters = M.clusters.filter((id) => clusters.some((c) => c.id === id));
  const pool = poolFor(M.clusters);
  const nSE = pool.filter((e) => e.type === 'se').length;
  const plan = planSections(M.mode, pool.length);
  let h = '<div class="page-head"><h1>Thi thử section Verbal</h1><p>Mô phỏng làm bài trên máy: đồng hồ đếm ngược, đi lại tự do trong section, đánh dấu, xem lại. Không gợi ý, không hiện đúng sai trong lúc làm.</p></div>';
  h += '<div class="notice">Đề thật có khoảng một nửa số câu là Reading Comprehension. Bản thi thử này hiện chỉ gồm Text Completion và Sentence Equivalence.</div>';
  h += fixedList();
  h += '<h2 class="section">Đề ngẫu nhiên</h2><p class="muted small" style="margin-top:0">Câu chọn ngẫu nhiên trong các cụm bạn chọn, ưu tiên câu chưa làm hoặc từng làm sai.</p>';
  h += '<div class="form-grid"><div class="field"><span class="label">Loại bài</span><div class="modes" role="radiogroup">' + Object.keys(MODES).map((m) => {
    const secs = MODES[m].secs.map((s) => SECTION_SPEC[s]);
    const n = secs.reduce((a, s) => a + s.n, 0), min = secs.reduce((a, s) => a + s.min, 0);
    const desc = m === 'full' ? 'Section 1 rồi Section 2 · ' + n + ' câu · ' + min + ' phút' : n + ' câu · ' + min + ' phút';
    return '<label class="mode"><input type="radio" name="mkmode" value="' + m + '"' + (M.mode === m ? ' checked' : '') + '><span><b>' + MODES[m].label + '</b><span>' + desc + '</span></span></label>';
  }).join('') + '</div></div>';
  h += '<div class="field"><span class="label" id="mkcl">Lấy câu từ các cụm</span><div class="chips-wrap" role="group" aria-labelledby="mkcl">' +
    '<button class="chip" data-act="mk-cluster" data-id="all" aria-pressed="' + !M.clusters.length + '">Tất cả</button>' +
    clusters.map((c) => '<button class="chip" data-act="mk-cluster" data-id="' + c.id + '" aria-pressed="' + M.clusters.includes(c.id) + '">' + esc(c.title) + '</button>').join('') + '</div>' +
    '<div class="help">Phạm vi có ' + pool.length + ' câu: ' + (pool.length - nSE) + ' Text Completion, ' + nSE + ' Sentence Equivalence.</div></div>';
  const total = plan.sections.reduce((a, s) => a + s.n, 0), mins = plan.sections.reduce((a, s) => a + s.min, 0);
  if (plan.short) {
    h += '<div class="notice warn">Phạm vi này chỉ có <b>' + pool.length + ' câu</b>, ít hơn ' + plan.need + ' câu của đề thật. ' +
      (total ? 'Bạn có thể làm bài ngắn hơn: ' + total + ' câu trong ' + mins + ' phút (giữ nhịp thời gian như đề thật).' : 'Chọn thêm cụm để thi thử.') + '</div>';
  }
  h += '<button class="btn primary big" data-act="mk-start"' + (total && plan.sections.every((s) => s.n) ? '' : ' disabled') + '>' +
    (plan.short ? 'Làm bài ngắn hơn (' + total + ' câu, ' + mins + ' phút)' : 'Bắt đầu ' + MODES[M.mode].label + ' (' + total + ' câu, ' + mins + ' phút)') + '</button></div>';
  const nHeld = heldIds().size;
  if (nHeld) h += '<p class="muted small held-note">' + nHeld + ' câu đang được giữ cho đề cố định bạn chưa làm, nên không có trong đề ngẫu nhiên.</p>';
  h += '<h2 class="section">Lịch sử đề ngẫu nhiên</h2>' + historyTable();
  return h;
}

/** Danh sách đề cố định: tên, mô tả, cụm, số câu, thời gian, trạng thái của tôi, nút Làm đề / Làm lại, lịch sử từng lần làm. */
function fixedList() {
  const list = App.fixedMocks || [];
  if (!list.length) return '';
  let h = '<h2 class="section">Đề cố định</h2><div class="fixed-list">';
  list.forEach((fm) => {
    const n = fm.sections.reduce((a, s) => a + s.items.length, 0);
    const mins = fm.sections.reduce((a, s) => a + s.minutes, 0);
    const cl = (fm.clusters || []).map((c) => (App.idx.clusterById[c] || { title: c }).title);
    const tries = attemptsOf(fm.id);
    const last = tries[0];
    const status = App.mocks == null && !tries.length ? '<span class="muted">Đang tải…</span>'
      : last ? (() => { const s = sumOf(last); return '<span class="fx-done">✓ Lần gần nhất: <b>' + s.sc + '/' + s.t + '</b>, ngày ' + esc(String(last.startedAt).slice(0, 10)) + (last.pending ? ' <span class="muted small">(chưa lưu)</span>' : '') + '</span>'; })()
      : '<span class="fx-new">○ Chưa làm</span>';
    h += '<article class="fixed-card"><div class="fx-head"><h3>' + esc(fm.title) + '</h3>' + status + '</div>' +
      (fm.description ? '<p class="fx-desc">' + esc(fm.description) + '</p>' : '') +
      '<div class="fx-meta"><span><b>' + n + '</b> câu</span><span><b>' + mins + '</b> phút</span><span>' + fm.sections.map((s) => esc(s.title) + ': ' + s.items.length + ' câu / ' + s.minutes + ' phút').join(' · ') + '</span></div>' +
      (cl.length ? '<div class="fx-clusters"><span class="muted small">Cụm từ vựng:</span> ' + cl.map((t) => '<span class="gchip">' + esc(t) + '</span>').join('') + '</div>' : '') +
      '<div class="fx-actions"><button class="btn ' + (last ? '' : 'primary') + '" data-act="mk-fixed" data-id="' + esc(fm.id) + '">' + (last ? 'Làm lại' : 'Làm đề') + '</button></div>';
    if (tries.length) {
      h += '<details class="fx-hist"' + (tries.length > 1 ? ' open' : '') + '><summary>Các lần làm (' + tries.length + ')</summary><div class="table-wrap"><table class="mock-table"><thead><tr><th>Ngày</th>' +
        fm.sections.map((s) => '<th>' + esc(s.title) + '</th>').join('') + '<th>Tổng</th><th>Thời gian</th></tr></thead><tbody>' +
        tries.map((m) => {
          const s = sumOf(m);
          return '<tr><td><a href="#mock/result/' + encodeURIComponent(entryKey(m)) + '">' + esc(shortDate(m.startedAt)) + '</a>' + (m.pending ? ' <span class="muted small">(chưa lưu)</span>' : '') + '</td>' +
            fm.sections.map((_, k) => { const x = m.sections.find((y) => y.section === k + 1); return '<td class="num">' + (x ? x.score + '/' + x.total : '—') + '</td>'; }).join('') +
            '<td class="num"><b>' + s.sc + '/' + s.t + '</b></td><td class="num">' + mmss(s.d) + '</td></tr>';
        }).join('') + '</tbody></table></div></details>';
    }
    h += '</article>';
  });
  return h + '</div>';
}

function introScreen() {
  const p = M.prep;
  const ids = p.kind === 'fixed' ? p.plan.flatMap((s) => s.ids) : p.ids;
  const exs = ids.map((id) => ex(id)).filter(Boolean);
  const title = p.kind === 'fixed' ? fixedById(p.fixedId).title : 'Thi thử ' + MODES[p.mode].label;
  const total = p.plan.reduce((a, s) => a + s.n, 0), mins = p.plan.reduce((a, s) => a + s.min, 0);
  App.keyHandler = (e) => { if (e.key === 'Enter' && !isTyping(e)) { e.preventDefault(); launch(p); } };
  return vocabIntroHtml(exs, {
    intro: esc(title) + ' · ' + total + ' câu · ' + mins + ' phút. Ôn nhanh các nhóm từ có trong phương án trước khi bấm Bắt đầu; đồng hồ chỉ chạy sau khi bắt đầu.',
    note: p.kind === 'random' && p.plan.length > 1 ? 'Danh sách dưới đây tính theo các câu của Section 1. Section 2 được chọn khi bạn nộp Section 1, theo kết quả Section 1.' : '',
    startAct: 'mk-launch', startLabel: 'Bắt đầu làm bài', backAct: 'mk-new', backLabel: 'Quay lại'
  });
}

function historyTable() {
  if (App.mocks == null) return '<p class="muted small">Đang tải lịch sử…</p>';
  const list = App.mocks.filter((m) => m.mode !== 'fixed');
  if (!list.length) return '<p class="muted small">Chưa có lần thi thử ngẫu nhiên nào.</p>';
  return '<div class="table-wrap"><table class="mock-table"><thead><tr><th>Ngày</th><th>Loại</th><th>Điểm</th><th>Thời gian</th></tr></thead><tbody>' +
    list.map((m) => {
      const sum = sumOf(m);
      return '<tr><td><a href="#mock/result/' + encodeURIComponent(entryKey(m)) + '">' + esc(shortDate(m.startedAt)) + '</a>' + (m.pending ? ' <span class="muted small" title="Chưa lưu lên máy chủ, sẽ thử lại">(chưa lưu)</span>' : '') + '</td>' +
        '<td>' + esc((MODES[m.mode] || { label: m.mode }).label) + '</td><td class="num">' + sum.sc + '/' + sum.t + '</td><td class="num">' + mmss(sum.d) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
}

/* ---------------- Làm bài ---------------- */

function runScreen() {
  if (run.phase === 'break') return breakScreen();
  const s = curSec();
  const head = '<div class="exam-bar"><div class="eb-where"><b>Section ' + s.no + '</b>' + (run.phase === 'q' ? '<span>Câu ' + (run.cur + 1) + ' / ' + s.items.length + '</span>' : '<span>Xem lại</span>') + '</div>' +
    '<div class="eb-timer"><span class="timer" id="mtimer"' + (run.hideTimer ? ' hidden' : '') + ' aria-label="Thời gian còn lại"></span>' +
    '<button class="btn quiet small-btn" data-act="mk-timer" aria-pressed="' + !run.hideTimer + '">' + (run.hideTimer ? 'Hiện giờ' : 'Ẩn giờ') + '</button></div></div>';
  return head + (run.phase === 'review' ? reviewScreen() : questionScreen());
}

function questionScreen() {
  const s = curSec(), it = curItem(), e = ex(it.ex);
  const isSE = e.type === 'se';
  const nB = isSE ? 1 : e.blanks.length;
  const label = isSE ? 'Sentence Equivalence: chọn đúng 2 từ cho hai câu cùng nghĩa' : 'Text Completion' + (nB > 1 ? ', ' + nB + ' chỗ trống: chọn một từ cho mỗi cột' : ': chọn một từ');
  let h = '<article class="card exam-q"><div class="card-kind"><span>' + label + '</span>' + (it.marked ? '<span class="dotsep mark-on">⚑ Đã đánh dấu</span>' : '') + '</div>';
  const sent = esc(e.sentence).replace(/\{(\d+)\}/g, (_, n) => {
    n = +n;
    const filled = isSE ? (it.choice.length ? it.choice.join(' / ') : '') : it.choice[n];
    return '<span class="gap' + (filled ? ' filled' : '') + '">' + (filled ? esc(filled) : '&nbsp;') + (nB > 1 ? '<small>(' + ROMAN[n] + ')</small>' : '') + '</span>';
  });
  h += '<p class="gre-sentence">' + sent + '</p>';
  if (isSE) {
    h += '<div class="options" role="group" aria-label="Chọn 2 phương án">' + it.order[0].map((o, k) =>
      '<button class="opt se-box" role="checkbox" aria-checked="' + it.choice.includes(o) + '" data-act="mk-pick" data-b="0" data-o="' + esc(o) + '"><span class="num">' + (k + 1) + '</span><span>' + esc(o) + '</span><span class="mark"></span></button>').join('') + '</div>' +
      '<div class="se-count">Đã chọn ' + it.choice.length + '/2</div>';
  } else {
    let base = 0;
    h += '<div class="blank-cols n' + nB + '">' + it.order.map((opts, b) => {
      const col = '<div class="blank-col">' + (nB > 1 ? '<h4>Chỗ trống (' + ROMAN[b] + ')</h4>' : '') + '<div class="options" role="radiogroup" aria-label="Chỗ trống ' + (b + 1) + '">' +
        opts.map((o, k) => '<button class="opt" role="radio" aria-checked="' + (it.choice[b] === o) + '" data-act="mk-pick" data-b="' + b + '" data-o="' + esc(o) + '"><span class="num">' + (base + k + 1) + '</span><span>' + esc(o) + '</span><span class="mark"></span></button>').join('') + '</div></div>';
      base += opts.length;
      return col;
    }).join('') + '</div>';
  }
  h += '</article>';
  const last = run.cur === s.items.length - 1;
  h += '<div class="exam-nav" role="toolbar" aria-label="Điều hướng bài thi">' +
    '<button class="btn" data-act="mk-prev"' + (run.cur === 0 ? ' disabled' : '') + '>‹ Trước</button>' +
    '<button class="btn" data-act="mk-mark" aria-pressed="' + !!it.marked + '">' + (it.marked ? '⚑ Bỏ đánh dấu' : '⚐ Đánh dấu') + '</button>' +
    '<button class="btn" data-act="mk-review">Xem lại</button>' +
    '<button class="btn primary" data-act="mk-next">' + (last ? 'Xem lại để nộp' : 'Tiếp ›') + '</button></div>';
  App.keyHandler = (ev) => {
    if (isTyping(ev)) return;
    const k = parseInt(ev.key, 10);
    if (k >= 1) {
      const flat = [];
      it.order.forEach((opts, b) => opts.forEach((o) => flat.push([b, o])));
      if (k <= flat.length) { ev.preventDefault(); pick(flat[k - 1][0], flat[k - 1][1]); }
    } else if (ev.key === 'ArrowRight' || ev.key === 'Enter') { ev.preventDefault(); nextQ(); } else if (ev.key === 'ArrowLeft') { ev.preventDefault(); prevQ(); }
  };
  return h;
}

function reviewScreen() {
  const s = curSec();
  const nAns = s.items.filter((it) => isAnswered(ex(it.ex), it.choice)).length;
  let h = '<div class="page-head"><h1>Xem lại Section ' + s.no + '</h1><p>' + nAns + '/' + s.items.length + ' câu đã trả lời. Bấm vào một câu để quay lại câu đó.</p></div>';
  h += '<div class="table-wrap"><table class="mock-table review-table"><thead><tr><th>Câu</th><th>Dạng</th><th>Trạng thái</th><th>Đánh dấu</th></tr></thead><tbody>' + s.items.map((it, k) => {
    const e = ex(it.ex);
    const st = isAnswered(e, it.choice) ? '<span class="st-ans">✓ Đã trả lời</span>' : isTouched(it.choice) ? '<span class="st-part">◐ Chưa trả lời hết</span>' : '<span class="st-no">○ Chưa trả lời</span>';
    return '<tr><td><button class="linkish" data-act="mk-goto" data-k="' + k + '">Câu ' + (k + 1) + '</button></td><td>' + esc(KIND_LABEL[exKind(e)]) + '</td><td>' + st + '</td><td>' + (it.marked ? '<span class="mark-on">⚑ Đã đánh dấu</span>' : '') + '</td></tr>';
  }).join('') + '</tbody></table></div>';
  const left = s.items.length - nAns;
  h += '<div class="card-actions">';
  if (!M.confirm) {
    h += '<button class="btn" data-act="mk-back">Quay lại câu ' + (run.cur + 1) + '</button><button class="btn primary" data-act="mk-submit">Nộp Section ' + s.no + '</button>';
  } else {
    h += '<div class="confirm-box" role="alertdialog" aria-label="Xác nhận nộp bài"><p><b>Nộp Section ' + s.no + '?</b> ' + (left ? 'Còn ' + left + ' câu chưa trả lời. ' : '') + 'Sau khi nộp không quay lại section này được.</p>' +
      '<div class="row"><button class="btn" data-act="mk-cancel">Làm tiếp</button><button class="btn primary" data-act="mk-submit-yes">Nộp bài</button></div></div>';
  }
  h += '</div><p class="muted small" style="margin-top:18px">Cần rời trang? <button class="linkish" data-act="mk-leave">Tạm rời bài thi</button>. Đồng hồ vẫn chạy như đề thật; mở lại mục Thi thử để làm tiếp.</p>';
  App.keyHandler = null;
  return h;
}

function breakScreen() {
  const s = curSec();
  App.keyHandler = (ev) => { if (ev.key === 'Enter' && !isTyping(ev)) { ev.preventDefault(); beginSection(); render(); } };
  return '<div class="break-screen"><div class="page-head"><h1>Hết Section ' + run.sections[run.sec - 1].no + '</h1>' +
    '<p>Section ' + run.sections[run.sec - 1].no + ' đã được nộp, không quay lại được nữa (như đề thật).</p></div>' +
    '<div class="notice">Section tiếp theo: <b>Section ' + s.no + '</b> · ' + s.items.length + ' câu · ' + s.min + ' phút. Đồng hồ mới bắt đầu khi bạn bấm nút bên dưới.</div>' +
    '<button class="btn primary big" data-act="mk-begin2">Bắt đầu Section ' + s.no + ' <kbd>Enter</kbd></button></div>';
}

function startClock() {
  const s = curSec();
  const tick = () => {
    if (!run || App.view !== 'mock') { stopTimer(); return; }
    const left = Math.ceil((s.deadline - now()) / 1000);
    const el = document.getElementById('mtimer');
    if (el) { el.textContent = '⏱ ' + mmss(Math.max(0, left)); el.classList.toggle('late', left <= 60); }
    if (left <= 0) { stopTimer(); toast('Hết giờ. Bài đã được nộp tự động.'); submitSection(); }
  };
  tick();
  if (run && run.phase !== 'break') App.timer = setInterval(tick, 500);
}

/* ---------------- Thao tác khi làm bài ---------------- */

function pick(b, o) {
  const it = curItem(), e = ex(it.ex);
  if (e.type === 'se') {
    const i = it.choice.indexOf(o);
    if (i >= 0) it.choice.splice(i, 1);
    else if (it.choice.length < 2) it.choice.push(o);
    else { toast('Chỉ chọn 2 từ. Bỏ một từ trước khi chọn từ khác.'); return; }
  } else {
    it.choice[b] = o;
  }
  saveRun();
  renderKeepFocus('[data-act="mk-pick"][data-b="' + b + '"][data-o="' + CSS.escape(o) + '"]');
}

function renderKeepFocus(sel) {
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
  const el = sel && document.querySelector(sel);
  if (el) el.focus({ preventScroll: true });
}

function gotoQ(k) {
  leaveQ();
  run.cur = Math.max(0, Math.min(curSec().items.length - 1, k));
  run.phase = 'q';
  run.qEnter = now();
  M.confirm = false;
  saveRun();
  render();
  window.scrollTo(0, 0);
}
function nextQ() { if (run.cur >= curSec().items.length - 1) toReview(); else gotoQ(run.cur + 1); }
function prevQ() { if (run.cur > 0) gotoQ(run.cur - 1); }
function toReview() { leaveQ(); run.phase = 'review'; M.confirm = false; saveRun(); render(); window.scrollTo(0, 0); }

Object.assign(actions, {
  'mk-cluster': (t) => {
    const id = t.dataset.id;
    if (id === 'all') M.clusters = [];
    else if (M.clusters.includes(id)) M.clusters = M.clusters.filter((x) => x !== id);
    else M.clusters = M.clusters.concat([id]);
    if (M.clusters.length === App.idx.clusters.filter((c) => !c.custom).length) M.clusters = [];
    renderKeepFocus('[data-act="mk-cluster"][data-id="' + id + '"]');
  },
  'mk-start': () => requestStart(prepRandom()),
  'mk-fixed': (t) => requestStart(prepFixed(t.dataset.id)),
  'mk-launch': () => { if (M.prep) launch(M.prep); },
  'mk-pick': (t) => pick(Number(t.dataset.b), t.dataset.o),
  'mk-next': () => nextQ(),
  'mk-prev': () => prevQ(),
  'mk-mark': () => { const it = curItem(); it.marked = !it.marked; saveRun(); renderKeepFocus('[data-act="mk-mark"]'); },
  'mk-review': () => toReview(),
  'mk-goto': (t) => gotoQ(Number(t.dataset.k)),
  'mk-back': () => gotoQ(run.cur),
  'mk-submit': () => { M.confirm = true; renderKeepFocus('[data-act="mk-submit-yes"]'); },
  'mk-cancel': () => { M.confirm = false; renderKeepFocus('[data-act="mk-submit"]'); },
  'mk-submit-yes': () => submitSection(),
  'mk-begin2': () => { beginSection(); render(); window.scrollTo(0, 0); },
  'mk-timer': () => { run.hideTimer = !run.hideTimer; saveRun(); renderKeepFocus('[data-act="mk-timer"]'); },
  'mk-leave': () => { leaveQ(); saveRun(); go('today'); },
  'mk-resume': () => go('mock', []),
  'mk-retry-ex': (t) => {
    const ids = t.dataset.ids.split(',').filter((id) => ex(id));
    startSession('practice', ids.map((id) => ({ type: 'gre', exId: id })), { from: 'mock', title: 'Ôn lại các câu sai' });
  },
  'mk-retry-words': (t) => {
    const ids = t.dataset.ids.split(',').filter((id) => word(id));
    startWordsSession('retry', ids, 'Ôn các từ sai trong bài thi thử', 'mock');
  },
  'mk-new': () => { M.screen = 'start'; M.resultId = null; M.prep = null; go('mock', []); }
});

document.addEventListener('change', (e) => {
  if (App.view === 'mock' && e.target.name === 'mkmode') { M.mode = e.target.value; render(); }
});

/* ---------------- Kết quả ---------------- */

function resultScreen() {
  const m = (App.mocks || []).find((x) => entryKey(x) === M.resultId) || (App.mocks || []).find((x) => x.mockId === M.resultId);
  if (!m) {
    return '<div class="page-head"><h1>Kết quả thi thử</h1></div>' + (App.mocks == null ? '<p class="muted">Đang tải…</p>' : '<p class="muted">Không tìm thấy bài thi thử này.</p>') +
      '<button class="btn" data-act="mk-new">Về trang Thi thử</button>';
  }
  const sum = summarize(m.sections, App.idx);
  const fm = m.mode === 'fixed' ? fixedById(m.mockId) : null;
  let h = '<div class="page-head"><h1>Kết quả thi thử</h1><p>' + esc(modeLabel(m)) + ' · ' + esc(shortDate(m.startedAt)) +
    (m.pending ? ' · <span title="Sẽ tự gửi lại khi có mạng">chưa lưu lên máy chủ</span>' : '') + '</p></div>';
  h += '<div class="summary-score">' + sum.score + '<small> / ' + sum.total + ' câu đúng</small></div>';
  h += '<div class="table-wrap"><table class="mock-table"><thead><tr><th>Section</th><th>Đúng</th><th>Thời gian đã dùng</th></tr></thead><tbody>' +
    m.sections.map((s) => {
      const lim = fm && fm.sections[s.section - 1] ? fm.sections[s.section - 1].minutes : (SECTION_SPEC[s.section] && s.total === SECTION_SPEC[s.section].n ? SECTION_SPEC[s.section].min : null);
      return '<tr><td>Section ' + s.section + '</td><td class="num">' + s.score + '/' + s.total + '</td><td class="num">' + mmss(s.durationSec) +
        ' <span class="muted small">/ ' + (lim ? lim + ':00' : '—') + '</span></td></tr>';
    }).join('') +
    (m.sections.length > 1 ? '<tr class="total"><td>Tổng</td><td class="num">' + sum.score + '/' + sum.total + '</td><td class="num">' + mmss(sum.durationSec) + '</td></tr>' : '') + '</tbody></table></div>';
  if (fm) {
    const prev = attemptsOf(fm.id).filter((x) => x.startedMs < m.startedMs)[0];
    if (prev) {
      const a = sumOf(m), b = sumOf(prev), d = a.sc - b.sc;
      h += '<p class="notice">So với lần làm trước (' + esc(shortDate(prev.startedAt)) + ': ' + b.sc + '/' + b.t + '): ' + (d > 0 ? '<b>tăng ' + d + ' câu</b>' : d < 0 ? '<b>giảm ' + (-d) + ' câu</b>' : 'bằng nhau') + '.</p>';
    }
  }
  h += '<h2 class="section">Thời gian trung bình mỗi câu, theo dạng câu</h2><div class="table-wrap"><table class="mock-table"><thead><tr><th>Dạng câu</th><th>Số câu</th><th>Đúng</th><th>TB mỗi câu</th></tr></thead><tbody>' +
    ['tc1', 'tc2', 'tc3', 'se'].filter((k) => sum.byKind[k]).map((k) => {
      const b = sum.byKind[k];
      return '<tr><td>' + KIND_LABEL[k] + '</td><td class="num">' + b.n + '</td><td class="num">' + b.ok + '</td><td class="num">' + mmss(b.t / b.n) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  h += skillTable(m);
  if (m.mode === 'full' && m.sections.length > 1) {
    const s1 = m.sections[0];
    const hard = s1.total && s1.score / s1.total >= ADAPT_THRESHOLD;
    h += '<p class="notice">Section 2 được chọn theo kết quả Section 1 (' + s1.score + '/' + s1.total + (hard ? ', từ 70% trở lên: ưu tiên câu TC nhiều chỗ trống và câu bạn từng làm sai' : ', dưới 70%: ưu tiên câu TC một chỗ trống') +
      '). Đây chỉ là mô phỏng gần đúng cách đề thật thích ứng theo section, không phải cách chấm điểm của ETS.</p>';
  }
  const items = m.sections.flatMap((s) => s.items.map((it) => Object.assign({ sec: s.section }, it))).filter((it) => ex(it.i));
  const wrong = items.filter((it) => !it.ok);
  const wrongWords = [];
  wrong.forEach((it) => {
    const e = ex(it.i);
    (e.answerIds || []).concat(e.targets || []).forEach((id) => { if (word(id) && !wrongWords.includes(id)) wrongWords.push(id); });
  });
  if (wrong.length) {
    h += '<div class="form-grid" style="margin-top:18px"><button class="btn primary big" data-act="mk-retry-ex" data-ids="' + wrong.map((x) => x.i).join(',') + '">Ôn lại các câu sai (' + wrong.length + ')</button>' +
      '<button class="btn big" data-act="mk-retry-words" data-ids="' + wrongWords.join(',') + '">Đưa các từ sai vào phiên ôn (' + wrongWords.length + ' từ)</button></div>';
  }
  h += '<h2 class="section">Từng câu</h2><ol class="review-list mock-items">' + items.map((it, k) => {
    const e = ex(it.i);
    const isSE = e.type === 'se';
    const choice = decodeChoice(it.c, e);
    const ans = isSE ? e.answers.join(', ') : e.blanks.map((b) => b.answer).join(' · ');
    const mine = isSE ? choice.join(', ') : choice.map((x) => x || '—').join(' · ');
    const sent = esc(e.sentence).replace(/\{(\d+)\}/g, (_, n) => '<span class="gap">' + (e.blanks && e.blanks.length > 1 ? '(' + ROMAN[+n] + ')' : '&nbsp;') + '</span>');
    const rel = (e.targets || []).filter((id) => word(id));
    return '<li><div class="row"><b>Câu ' + (k + 1) + '</b><span class="muted small">' + (m.sections.length > 1 ? 'Section ' + it.sec + ' · ' : '') + KIND_LABEL[exKind(e)] + ' · ' + mmss(it.t) + '</span>' + difficultyHtml(e) +
      (it.ok ? '<span class="tag known">✓ Đúng</span>' : (isTouched(choice) ? '<span class="tag leech">✗ Sai</span>' : '<span class="tag leech">○ Bỏ trống</span>')) + '</div>' +
      '<p class="example" style="margin:6px 0">' + sent + '</p>' +
      '<div class="small">Bạn chọn: <b>' + esc(isTouched(choice) ? mine : '(bỏ trống)') + '</b> · Đáp án: <b>' + esc(ans) + '</b></div>' +
      '<div class="explain small">' + esc(e.explanation || '') + '</div>' + skillsHtml(e) + wordsInQuestionHtml(e, { collapsed: true }) +
      (rel.length ? '<div class="small rel-words">Từ liên quan: ' + rel.map((id) => '<button class="linkish" data-act="v-jump" data-id="' + id + '">' + esc(word(id).word) + '</button>').join(', ') + '</div>' : '') + exTools(e) + '</li>';
  }).join('') + '</ol>';
  h += '<div class="form-grid" style="margin-top:20px"><button class="btn big" data-act="mk-new">Về trang Thi thử</button></div>';
  return h;
}

/** Tỉ lệ đúng theo kỹ năng và theo độ khó: biết nên luyện thêm kỹ năng nào (lọc theo kỹ năng ở mục Luyện tập). */
function skillTable(m) {
  const by = {}, byD = {};
  m.sections.forEach((s) => s.items.forEach((it) => {
    const e = ex(it.i);
    if (!e) return;
    (e.skills || []).forEach((k) => { const b = by[k] || (by[k] = { n: 0, ok: 0 }); b.n++; b.ok += it.ok ? 1 : 0; });
    if (e.difficulty) { const b = byD[e.difficulty] || (byD[e.difficulty] = { n: 0, ok: 0 }); b.n++; b.ok += it.ok ? 1 : 0; }
  }));
  const keys = Object.keys(SKILLS).filter((k) => by[k]);
  if (!keys.length) return '';
  const row = (label, b) => '<tr><td>' + label + '</td><td class="num">' + b.n + '</td><td class="num">' + b.ok + '</td><td class="num">' + Math.round(100 * b.ok / b.n) + '%</td></tr>';
  keys.sort((a, b) => by[a].ok / by[a].n - by[b].ok / by[b].n || by[b].n - by[a].n);
  return '<h2 class="section">Theo kỹ năng và độ khó</h2><p class="muted small" style="margin-top:0">Kỹ năng yếu nhất ở trên cùng. Mỗi câu có thể có nhiều kỹ năng. Luyện thêm bằng bộ lọc Kỹ năng ở mục <a href="#practice">Luyện tập</a>.</p>' +
    '<div class="table-wrap"><table class="mock-table"><thead><tr><th>Kỹ năng</th><th>Số câu</th><th>Đúng</th><th>Tỉ lệ</th></tr></thead><tbody>' +
    keys.map((k) => row(esc(SKILLS[k].label), by[k])).join('') +
    [1, 2, 3].filter((d) => byD[d]).map((d, i) => (i === 0 ? '<tr class="total"><td colspan="4">Độ khó</td></tr>' : '') + row(DIFFICULTY[d], byD[d])).join('') +
    '</tbody></table></div>';
}

/** Dòng tóm tắt lần thi thử gần nhất cho trang Hôm nay. */
export function lastMockLine() {
  const r = activeRun();
  if (r) {
    return '<div class="mock-last"><div><b>Bài thi thử đang làm dở</b><span class="muted small">' + esc(r.fixedId ? (fixedById(r.fixedId) || { title: r.fixedId }).title : (MODES[r.mode] || {}).label || '') + ', đồng hồ vẫn chạy</span></div>' +
      '<button class="btn" data-act="mk-resume">Làm tiếp</button></div>';
  }
  const m = (App.mocks || []).slice().sort((a, b) => b.startedMs - a.startedMs)[0];
  if (!m) return '';
  const sc = m.sections.reduce((a, s) => a + s.score, 0), tot = m.sections.reduce((a, s) => a + s.total, 0);
  const d = m.sections.reduce((a, s) => a + s.durationSec, 0);
  return '<a class="mock-last" href="#mock/result/' + encodeURIComponent(entryKey(m)) + '"><div><b>Thi thử gần nhất: ' + sc + '/' + tot + '</b>' +
    '<span class="muted small">' + esc(modeLabel(m)) + ' · ' + esc(shortDate(m.startedAt)) + ' · ' + mmss(d) + '</span></div><span aria-hidden="true">›</span></a>';
}

