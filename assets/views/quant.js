// Tab Quant hằng ngày: mỗi ngày 4 câu sinh ngẫu nhiên (cố định theo ngày và tài khoản), nhắm các bẫy hay sai;
// làm xong xem lời giải và mẹo tránh bẫy; thống kê theo bẫy; xuất dữ liệu lỗi để Claude dựng đề Quant đầy đủ.
// Lịch sử và bài đang làm lưu trên trình duyệt này (localStorage, theo tài khoản).
import { App, esc, views, actions, render, toast, now, today, isTyping } from '../state.js';
import { LS } from '../api.js';
import { practiceShell, callout, calloutList } from './ui.js';
import { dailySet, makeItem, TEMPLATES, grade, answerText, trapStats, exportSummary, QC_CHOICES, FMT_LABEL, TOPICS, TRAPS } from '../quant.js';

const histKey = () => 'gre.quantHist.' + App.user.userId;
const runKey = () => 'gre.quantRun.' + App.user.userId;
const hist = () => LS.get(histKey(), []);
const LETTERS = 'ABCDE';
const Q_MARK = 150; // mốc 2 phút 30 giây mỗi câu (theo sổ lỗi: quá mốc thì đánh dấu, bỏ qua)

const pad2 = (n) => ('0' + n).slice(-2);
const mmss = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + pad2(s % 60); };
const dayLabel = (d) => { const p = d.split('-'); return p[2] + '/' + p[1]; };

const Z = { screen: 'home', last: null, showExport: false };
let run = null;

const setsToday = () => hist().filter((s) => s.day === today() && s.no !== 'w');
const seedFor = (no) => today() + '|' + App.user.userId + '|' + no;

/** Bài đang làm lưu dưới dạng [{tpl, seed}] để tải lại trang (kể cả sau khi web cập nhật mẫu) vẫn ra đúng các câu cũ. */
function loadRun() {
  const r = LS.get(runKey(), null);
  if (r && Array.isArray(r.spec) && r.spec.every((x) => TEMPLATES[x.tpl])) { run = r; run.items = r.spec.map((x) => makeItem(x.tpl, x.seed)); return run; }
  run = null; LS.del(runKey()); return null;
}
function saveRun() { if (run) LS.set(runKey(), { day: run.day, no: run.no, spec: run.items.map((it) => ({ tpl: it.tpl, seed: it.seed })), choices: run.choices, cur: run.cur, start: run.start, qsec: run.qsec, qEnter: run.qEnter }); else LS.del(runKey()); }
const hasAns = (c) => c != null && c !== '' && !(Array.isArray(c) && !c.length);

function start(no) {
  const h = hist();
  const snap = h.slice(-60).map((s) => ({ day: s.day, items: s.items.map((x) => ({ tpl: x.tpl, trap: x.trap, ok: x.ok })) }));
  const seedStr = seedFor(no);
  run = { day: today(), no, items: dailySet(seedStr, snap), choices: {}, cur: 0, start: now(), qsec: {}, qEnter: now() };
  saveRun(); Z.screen = 'do'; render(); window.scrollTo(0, 0);
}
function leaveQ() { if (!run) return; const k = run.cur; run.qsec[k] = (run.qsec[k] || 0) + (now() - run.qEnter) / 1000; run.qEnter = now(); }
function go(k) { if (!run || k < 0 || k >= run.items.length) return; leaveQ(); run.cur = k; saveRun(); render(); }

function finish() {
  leaveQ();
  const items = run.items.map((it, k) => {
    const c = run.choices[k];
    return { tpl: it.tpl, trap: it.trap, fmt: it.fmt, topic: it.topic, ok: grade(it, c), sec: Math.min(600, Math.round(run.qsec[k] || 0)),
      c: c == null ? '' : Array.isArray(c) ? c.join('; ') : String(c), a: answerText(it), stem: it.stem + (it.qa ? ' | A: ' + it.qa + ' | B: ' + it.qb : '') };
  });
  // Thời gian: cộng thời gian từng câu (mỗi câu tối đa 10 phút) để bài bỏ dở rồi làm tiếp không làm sai số liệu
  const rec = { day: run.day, no: run.no, at: now(), sec: items.reduce((t, x) => t + x.sec, 0), items };
  const h = hist(); h.push(rec); LS.set(histKey(), h.slice(-400));
  Z.last = { rec, items: run.items, choices: run.choices };
  run = null; saveRun(); Z.screen = 'result'; render(); window.scrollTo(0, 0);
}

function streak(h) {
  const days = new Set(h.map((s) => s.day));
  let d = new Date(today() + 'T00:00:00Z');
  if (!days.has(today())) d = new Date(d.getTime() - 864e5);
  let n = 0;
  while (days.has(d.toISOString().slice(0, 10))) { n++; d = new Date(d.getTime() - 864e5); }
  return n;
}

/* ---------------- Màn chính ---------------- */
function homeScreen() {
  const h = hist();
  const done = setsToday();
  const st = trapStats(h);
  const tot = h.reduce((a, s) => ({ n: a.n + s.items.length, ok: a.ok + s.items.filter((x) => x.ok).length }), { n: 0, ok: 0 });
  let html = '<div class="page-head"><h1>Quant hằng ngày</h1><p>Mỗi ngày 4 câu sinh ngẫu nhiên, cố tình gài bẫy. Câu nhắm vào các bẫy bạn hay sai: lúc đầu theo sổ lỗi bài thi thử 26/11, sau đó theo kết quả bạn làm ở đây.</p></div>';
  html += '<div class="stats"><div class="stat"><div class="stat-num">' + streak(h) + '</div><div class="stat-label">Ngày liên tiếp</div></div>' +
    '<div class="stat"><div class="stat-num">' + h.filter((s) => s.no !== 'w').length + '</div><div class="stat-label">Bộ 4 câu đã làm</div></div>' +
    '<div class="stat"><div class="stat-num">' + (tot.n ? Math.round(100 * tot.ok / tot.n) + '%' : '—') + '</div><div class="stat-label">Đúng (' + tot.n + ' câu)</div></div>' +
    '<div class="stat"><div class="stat-num">' + done.length + '</div><div class="stat-label">Bộ hôm nay</div></div></div>';

  html += '<section class="card qz-today">';
  if (run) {
    html += '<h2 class="section" style="margin-top:0">Bài ' + dayLabel(run.day) + ' đang làm dở</h2><p>Đã chọn ' + Object.values(run.choices).filter(hasAns).length + '/' + run.items.length + ' câu.</p>' +
      '<div class="form-grid"><button class="btn primary big" data-act="qz-resume">Làm tiếp</button></div>';
  } else if (!done.length) {
    html += '<h2 class="section" style="margin-top:0">Bài hôm nay ' + dayLabel(today()) + '</h2><p>4 câu, gợi ý khoảng 7 phút (mốc 2:30 mỗi câu). Mọi câu đều có bẫy: đọc kỹ đề, thử trường hợp biên trước khi chọn.</p>' +
      '<div class="form-grid"><button class="btn primary big" data-act="qz-start" data-no="0">Bắt đầu bài hôm nay</button></div>';
  } else {
    const s = done[0];
    html += '<h2 class="section" style="margin-top:0">Đã xong bài hôm nay: ' + s.items.filter((x) => x.ok).length + '/' + s.items.length + ' câu đúng, ' + mmss(s.sec) + '</h2>' +
      '<p class="muted small">Bài mới sẽ có vào ngày mai. Muốn luyện thêm thì làm thêm một bộ 4 câu khác.</p>' +
      '<div class="form-grid"><button class="btn primary big" data-act="qz-start" data-no="' + done.length + '">Làm thêm 4 câu</button></div>';
  }
  html += '</section>';


  const keys = Object.keys(st).sort((a, b) => (st[a].ok / st[a].n) - (st[b].ok / st[b].n));
  if (keys.length) {
    html += '<h2 class="section">Theo kiểu bẫy</h2><div class="table-wrap"><table class="mock-table"><thead><tr><th>Bẫy</th><th>Câu</th><th>Đúng</th><th>Sai trong 5 lần gần nhất</th></tr></thead><tbody>' +
      keys.map((k) => { const s = st[k]; const r = s.ok / s.n; return '<tr title="' + esc(TRAPS[k] ? TRAPS[k].tip : '') + '"><td>' + esc(TRAPS[k] ? TRAPS[k].label : k) + '</td><td>' + s.n + '</td><td class="' + (r < 0.6 ? 'bad' : r >= 0.85 ? 'good' : '') + '">' + Math.round(100 * r) + '%</td><td>' + s.recentWrong + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
    const wrong = [];
    h.slice().reverse().forEach((s) => s.items.forEach((x) => { if (!x.ok && wrong.length < 8) wrong.push(Object.assign({ day: s.day }, x)); }));
    if (wrong.length) {
      html += '<h2 class="section">Sổ lỗi gần đây</h2><ul class="review-list">' + wrong.map((x) => '<li><div class="row"><b>' + esc(TRAPS[x.trap] ? TRAPS[x.trap].label : x.trap) + '</b><span class="muted small">' + dayLabel(x.day) + ' · ' + esc(FMT_LABEL[x.fmt] || x.fmt) + '</span></div>' +
        '<div class="small">' + esc(x.stem) + '</div><div class="small">Bạn chọn: <b>' + esc(x.c || '(bỏ trống)') + '</b> · Đáp án: <b>' + esc(x.a) + '</b></div>' +
        '<div class="small muted">' + esc(TRAPS[x.trap] ? TRAPS[x.trap].tip : '') + '</div></li>').join('') + '</ul>';
    }
  }

  html += '<h2 class="section">Dữ liệu cho đề Quant chuyên sâu</h2><p class="small muted">Khi cần luyện Quant đầy đủ, sao chép dữ liệu này gửi cho Claude kèm yêu cầu dựng đề tập trung vào các bẫy hay sai.</p>' +
    '<div class="form-grid"><button class="btn" data-act="qz-export"' + (h.length ? '' : ' disabled') + '>Sao chép dữ liệu lỗi</button></div>';
  if (Z.showExport) html += '<textarea class="input qz-export" readonly rows="8">' + esc(JSON.stringify(exportSummary(h, App.user.displayName || App.user.username), null, 1)) + '</textarea>';
  html += '<p class="small muted" style="margin-top:14px">Lịch sử Quant lưu trên trình duyệt này.</p>';
  return html;
}

/* ---------------- Màn làm bài ---------------- */
function questionHtml(it, k) {
  const c = run.choices[k];
  let h = '<article class="card exam-q qz-q"><div class="card-kind"><span>Câu ' + (k + 1) + '/' + run.items.length + '</span><span class="dotsep">' + esc(FMT_LABEL[it.fmt]) + '</span><span class="dotsep">' + esc(TOPICS[it.topic]) + '</span></div>';
  if (it.fmt === 'qc') {
    h += '<div class="qz-given">' + esc(it.stem) + '</div><div class="qz-qty"><div><span class="muted small">Quantity A</span><b>' + esc(it.qa) + '</b></div><div><span class="muted small">Quantity B</span><b>' + esc(it.qb) + '</b></div></div>';
    h += '<div class="options" role="radiogroup">' + ['A', 'B', 'C', 'D'].map((o, i) => '<button class="opt" role="radio" aria-checked="' + (c === o) + '" data-act="qz-pick" data-o="' + o + '"><span class="num">' + o + '</span><span>' + esc(QC_CHOICES[o]) + '</span><span class="mark"></span></button>').join('') + '</div>';
  } else if (it.fmt === 'num') {
    h += '<p class="rc-stem">' + esc(it.stem) + '</p><label class="field"><span class="label small">Đáp án (số nguyên, thập phân, hoặc phân số dạng a/b)</span><input class="input qz-num" id="qzNum" inputmode="decimal" autocomplete="off" value="' + esc(c || '') + '"></label>';
  } else {
    const multi = it.fmt === 'multi';
    const cs = multi ? (c || []) : [c];
    h += '<p class="rc-stem">' + esc(it.stem) + '</p>' + (multi ? '<p class="muted small rc-dir">Chọn mọi đáp án đúng.</p>' : '') +
      '<div class="options" role="' + (multi ? 'group' : 'radiogroup') + '">' + it.options.map((o, i) => '<button class="opt' + (multi ? ' se-box' : '') + '" role="' + (multi ? 'checkbox' : 'radio') + '" aria-checked="' + cs.includes(o) + '" data-act="qz-pick" data-o="' + esc(o) + '"><span class="num">' + (multi ? i + 1 : LETTERS[i]) + '</span><span>' + esc(o) + '</span><span class="mark"></span></button>').join('') + '</div>';
  }
  return h + '</article>';
}

function doScreen() {
  const k = run.cur;
  let h = '<div class="rcp-bar"><button class="btn" data-act="qz-home">← Quant</button><div class="rcp-title"><b>Quant ' + dayLabel(run.day) + (run.no ? ' · bộ thêm ' + run.no : '') + '</b><span class="muted small">Mốc 2:30 mỗi câu</span></div>' +
    '<span class="rcp-timer" id="qzTimer"></span></div>';
  h += '<div class="rcp-dots">' + run.items.map((_, i) => {
    const ans = hasAns(run.choices[i]);
    return '<button class="rcp-dot' + (ans ? ' ans' : '') + (i === k ? ' cur' : '') + '" data-act="qz-go" data-k="' + i + '">Câu ' + (i + 1) + '</button>';
  }).join('') + '</div>';
  h += questionHtml(run.items[k], k);
  h += '<div class="form-grid rcp-actions">' + (k > 0 ? '<button class="btn" data-act="qz-prev">← Câu trước</button>' : '') +
    (k < run.items.length - 1 ? '<button class="btn primary" data-act="qz-next">Câu tiếp →</button>' : '') +
    '<button class="btn' + (k === run.items.length - 1 ? ' primary' : '') + '" data-act="qz-finish">Nộp bài</button></div>' +
    '<p class="muted small">Phím tắt: A–D hoặc 1–5 chọn phương án, ← → đổi câu.</p>';
  return h;
}

function tick() {
  const el = document.getElementById('qzTimer');
  if (!el || !run) return;
  const q = (run.qsec[run.cur] || 0) + (now() - run.qEnter) / 1000;
  el.textContent = '⏱ ' + mmss((now() - run.start) / 1000) + ' · câu này ' + mmss(q);
  el.classList.toggle('over', q > Q_MARK);
}

/* ---------------- Màn kết quả ---------------- */
function resultScreen() {
  const { rec, items, choices } = Z.last;
  const ok = rec.items.filter((x) => x.ok).length;
  let h = '<div class="page-head"><h1>Quant ' + dayLabel(rec.day) + ': ' + ok + '/' + rec.items.length + ' câu đúng</h1><p>Thời gian ' + mmss(rec.sec) + '. ' +
    (ok === rec.items.length ? 'Không mắc bẫy nào.' : 'Đọc kỹ lời giải các câu sai; bẫy của chúng sẽ được ưu tiên ở các bài sau.') + '</p></div>';
  h += '<ol class="review-list qz-res">' + items.map((it, k) => {
    const x = rec.items[k];
    const c = choices[k];
    const mine = c == null || c === '' || (Array.isArray(c) && !c.length) ? '(bỏ trống)' : Array.isArray(c) ? c.join('; ') : it.fmt === 'qc' ? c + '. ' + QC_CHOICES[c] : String(c);
    return '<li><div class="row"><b>Câu ' + (k + 1) + '</b><span class="muted small">' + esc(FMT_LABEL[it.fmt]) + ' · ' + mmss(x.sec) + (x.sec > Q_MARK ? ' (quá mốc 2:30)' : '') + '</span><span class="spacer"></span>' +
      (x.ok ? '<span class="tag known">✓ Đúng</span>' : '<span class="tag leech">✗ Sai</span>') + '</div>' +
      '<div class="small">' + esc(it.stem) + '</div>' + (it.fmt === 'qc' ? '<div class="small">Quantity A: <b>' + esc(it.qa) + '</b> · Quantity B: <b>' + esc(it.qb) + '</b></div>' : '') +
      '<div class="small">Bạn chọn: <b>' + esc(mine) + '</b><br>Đáp án: <b>' + esc(answerText(it)) + '</b></div>' +
      '<div class="explain small">' + esc(it.explain) + '</div>' +
      callout('trap', 'Bẫy: ' + TRAPS[it.trap].label, '<div class="small">' + esc(it.tip) + '</div>') + '</li>';
  }).join('') + '</ol>';
  h += '<div class="form-grid" style="margin-top:20px"><button class="btn primary big" data-act="qz-home">Về trang Quant</button></div>';
  return h;
}

/* ---------------- View và hành động ---------------- */
views.quant = {
  title: 'Quant hằng ngày',
  enter() { if (Z.screen === 'do' && !run) Z.screen = 'home'; if (run) run.qEnter = now(); },
  render() {
    if (!run) loadRun();
    if (Z.screen === 'do' && run) return doScreen();
    if (Z.screen === 'result' && Z.last) return resultScreen();
    Z.screen = 'home';
    return practiceShell('quant', homeScreen());
  },
  after() {
    if (Z.screen === 'do' && run) {
      tick(); App.timer = setInterval(tick, 1000); App.keyHandler = keys;
      const inp = document.getElementById('qzNum');
      if (inp) inp.addEventListener('input', () => { run.choices[run.cur] = inp.value; saveRun(); });
    }
  }
};

function pick(o) {
  const it = run.items[run.cur];
  if (it.fmt === 'multi') { const c = run.choices[run.cur] || []; run.choices[run.cur] = c.includes(o) ? c.filter((x) => x !== o) : c.concat([o]); }
  else run.choices[run.cur] = o;
  saveRun(); render();
}

function keys(ev) {
  if (!run || isTyping(ev)) return;
  const it = run.items[run.cur];
  const k = ev.key;
  if (k === 'ArrowRight') { ev.preventDefault(); return go(run.cur + 1); }
  if (k === 'ArrowLeft') { ev.preventDefault(); return go(run.cur - 1); }
  if (it.fmt === 'num') return;
  let i = -1;
  if (/^[1-5]$/.test(k)) i = +k - 1;
  else if (/^[a-eA-E]$/.test(k)) i = 'abcde'.indexOf(k.toLowerCase());
  const opts = it.options;
  if (i >= 0 && i < opts.length) { ev.preventDefault(); pick(opts[i]); }
}

Object.assign(actions, {
  'qz-start': (t) => start(+t.dataset.no || 0),
  'qz-resume': () => { if (run) { run.qEnter = now(); Z.screen = 'do'; render(); } },
  'qz-home': () => { if (run) { leaveQ(); saveRun(); } Z.screen = 'home'; render(); window.scrollTo(0, 0); },
  'qz-go': (t) => go(+t.dataset.k),
  'qz-prev': () => go(run.cur - 1),
  'qz-next': () => go(run.cur + 1),
  'qz-pick': (t) => pick(t.dataset.o),
  'qz-finish': () => finish(),
  'qz-export': async () => {
    const txt = JSON.stringify(exportSummary(hist(), App.user.displayName || App.user.username), null, 1);
    Z.showExport = true;
    try { await navigator.clipboard.writeText(txt); toast('Đã sao chép dữ liệu lỗi.'); } catch (e) { toast('Không sao chép tự động được; hãy chọn và sao chép trong ô bên dưới.'); }
    render();
  }
});

/* ---------------- 2 bài khởi động (hiện ở trang Hôm nay) ---------------- */
// Làm ngay trên trang, chấm từng câu; xong cả hai thì ghi vào lịch sử Quant (no: 'w') để tính vào thống kê bẫy.
const warmKey = () => 'gre.qWarm.' + App.user.userId;
// Giữ chữ đang gõ ở ô điền số khi trang vẽ lại (vd trả lời câu kia)
document.addEventListener('input', (e) => {
  const t = e.target;
  if (!t || !t.dataset || t.dataset.qw == null || !App.user) return;
  const w = LS.get(warmKey(), null);
  if (!w || w.day !== t.dataset.day || (w.checked || {})[t.dataset.qw]) return;
  w.choices = w.choices || {}; w.choices[t.dataset.qw] = t.value; LS.set(warmKey(), w);
});
function warmState(day) {
  let w = LS.get(warmKey(), null);
  if (!w || w.day !== day || !Array.isArray(w.spec) || !w.spec.every((x) => TEMPLATES[x.tpl])) {
    const snap = hist().slice(-60).map((s) => ({ day: s.day, items: s.items.map((x) => ({ tpl: x.tpl, trap: x.trap, ok: x.ok })) }));
    const items = dailySet(day + '|' + App.user.userId + '|warm', snap, 2);
    w = { day, spec: items.map((it) => ({ tpl: it.tpl, seed: it.seed })), choices: {}, checked: {}, saved: false, t0: now() };
    LS.set(warmKey(), w);
  }
  w.items = w.spec.map((x) => makeItem(x.tpl, x.seed));
  return w;
}
const saveWarm = (w) => LS.set(warmKey(), { day: w.day, spec: w.spec, choices: w.choices, checked: w.checked, saved: w.saved, t0: w.t0 });

function warmItemHtml(w, it, k) {
  const c = w.choices[k];
  const done = !!w.checked[k];
  const ok = done && grade(it, c);
  let h = '<div class="card warm-card warm-q"><div class="warm-meta">🧮 Câu ' + (k + 1) + ' · ' + esc(FMT_LABEL[it.fmt]) + ' · ' + esc(TOPICS[it.topic]) + (done ? ' · ' + (ok ? '✓ đúng' : '✗ sai') : '') + '</div>';
  const optBtn = (o, label, i, multi) => {
    const on = multi ? (c || []).includes(o) : c === o;
    let cls = '', mark = '';
    if (done) { const right = it.fmt === 'multi' ? it.answer.includes(o) : o === it.answer; if (right) { cls = ' correct'; mark = '✓'; } else if (on) { cls = ' wrong'; mark = '✗'; } }
    return '<button class="opt' + (multi ? ' se-box' : '') + cls + '" role="' + (multi ? 'checkbox' : 'radio') + '" aria-checked="' + on + '"' + (done ? ' disabled' : '') +
      ' data-act="qw-pick" data-day="' + w.day + '" data-k="' + k + '" data-o="' + esc(o) + '"><span class="num">' + label + '</span><span>' + esc(it.fmt === 'qc' ? QC_CHOICES[o] : o) + '</span><span class="mark">' + mark + '</span></button>';
  };
  if (it.fmt === 'qc') {
    h += '<div class="qz-given">' + esc(it.stem) + '</div><div class="qz-qty"><div><span class="muted small">Quantity A</span><b>' + esc(it.qa) + '</b></div><div><span class="muted small">Quantity B</span><b>' + esc(it.qb) + '</b></div></div>' +
      '<div class="options">' + ['A', 'B', 'C', 'D'].map((o) => optBtn(o, o, 0, false)).join('') + '</div>';
  } else if (it.fmt === 'num') {
    h += '<p class="rc-stem">' + esc(it.stem) + '</p><div class="warm-num"><input class="input qz-num" data-qw="' + k + '" data-day="' + w.day + '" inputmode="decimal" autocomplete="off" value="' + esc(c || '') + '"' + (done ? ' disabled' : '') + '>' +
      (done ? '' : '<button class="btn primary" data-act="qw-check" data-day="' + w.day + '" data-k="' + k + '">Kiểm tra</button>') + '</div>';
  } else {
    const multi = it.fmt === 'multi';
    h += '<p class="rc-stem">' + esc(it.stem) + '</p><div class="options">' + it.options.map((o, i) => optBtn(o, multi ? i + 1 : LETTERS[i], i, multi)).join('') + '</div>' +
      (multi && !done ? '<div class="form-grid" style="margin-top:8px"><button class="btn primary" data-act="qw-check" data-day="' + w.day + '" data-k="' + k + '"' + ((c || []).length ? '' : ' disabled') + '>Kiểm tra</button></div>' : '');
  }
  if (done) {
    h += '<div class="rcp-verdict ' + (ok ? 'good' : 'bad') + '">' + (ok ? '✓ Đúng' : '✗ Sai. Đáp án: ' + esc(answerText(it))) + '</div><div class="explain small">' + esc(it.explain) + '</div>' +
      callout('trap', 'Bẫy: ' + TRAPS[it.trap].label, '<div class="small">' + esc(it.tip) + '</div>');
  }
  return h + '</div>';
}

/** Thẻ 2 bài Quant khởi động cho trang Hôm nay. */
export function warmQuantCard(day) {
  if (!App.user) return '';
  const w = warmState(day);
  const n = Object.keys(w.checked).length;
  const nOk = w.items.filter((it, k) => w.checked[k] && grade(it, w.choices[k])).length;
  return '<div id="warmQuant"><p class="small muted warm-sub">' + (n === 2 ? 'Đã xong: ' + nOk + '/2 câu đúng.' : n + '/2 câu đã làm. Chọn đáp án là chấm ngay.') + ' Bộ 4 câu đầy đủ ở <a href="#quant" data-nav="quant">Luyện tập › Quant</a>.</p>' +
    w.items.map((it, k) => warmItemHtml(w, it, k)).join('') + '</div>';
}

function warmUpdate(day, k, fn) {
  const w = warmState(day);
  fn(w, w.items[k]);
  if (!w.saved && w.items.every((_, i) => w.checked[i])) {
    const items = w.items.map((it, i) => {
      const c = w.choices[i];
      return { tpl: it.tpl, trap: it.trap, fmt: it.fmt, topic: it.topic, ok: grade(it, c), sec: Math.min(600, Math.round((now() - w.t0) / 2000)),
        c: c == null ? '' : Array.isArray(c) ? c.join('; ') : String(c), a: answerText(it), stem: it.stem + (it.qa ? ' | A: ' + it.qa + ' | B: ' + it.qb : '') };
    });
    const h = hist(); h.push({ day: w.day, no: 'w', at: now(), sec: items.reduce((t, x) => t + x.sec, 0), items }); LS.set(histKey(), h.slice(-400));
    w.saved = true;
  }
  saveWarm(w);
  const y = window.scrollY; render(); window.scrollTo(0, y);
}
Object.assign(actions, {
  'qw-pick': (t) => warmUpdate(t.dataset.day || today(), +t.dataset.k, (w, it) => {
    const k = +t.dataset.k, o = t.dataset.o;
    if (w.checked[k]) return;
    if (it.fmt === 'multi') { const c = w.choices[k] || []; w.choices[k] = c.includes(o) ? c.filter((x) => x !== o) : c.concat([o]); }
    else { w.choices[k] = o; w.checked[k] = true; }
  }),
  'qw-check': (t) => warmUpdate(t.dataset.day || today(), +t.dataset.k, (w) => {
    const k = +t.dataset.k;
    const inp = document.querySelector('[data-qw="' + k + '"]');
    if (inp) w.choices[k] = inp.value;
    const c = w.choices[k];
    if (c != null && c !== '' && !(Array.isArray(c) && !c.length)) w.checked[k] = true;
  })
});
