// Trang Hôm nay (mặc định sau khi đăng nhập): ba bước Đọc → Ôn → Câu hỏi nhanh, chủ đề hôm nay kèm từ, sổ từ hay quên,
// câu hỏi nhanh ngay trên trang (Nghĩa → Từ và GRE TC/SE), tiến độ theo cụm.
import {
  App, S, TL, esc, EXAM_DATE, views, actions, today, weekday, fmtDate, activeDays, dailyQueue, isTyping, render, go,
  todayLists, reviewedToday, stateOf, word, readToday, markRead, record, touch, practiceExercises, toast
} from '../state.js';
import { startDaily, startSession, startWordsSession, cardsForDaily } from './session.js';
import { lastMockLine } from './mock.js';
import { pickDistractors } from '../distractors.js';
import { gradeExercise } from '../vocab.js';
import { resultLine } from './common.js';

const ROMAN = ['i', 'ii', 'iii'];

/* ---------------- Ba bước trong ngày ---------------- */

function step(n, title, num, total, body, state) {
  return '<li class="step ' + state + '"><div class="step-n" aria-hidden="true">' + (state === 'done' ? '✓' : n) + '</div><div class="step-body">' +
    '<div class="step-title">' + title + '</div>' +
    '<div class="step-num">' + num + (total != null ? '<small>/' + total + '</small>' : '') + '</div>' + body + '</div></li>';
}

function stepsBlock(L, done, read, q) {
  const nRead = L.new.filter((id) => read.has(id) || (stateOf(id) && stateOf(id).box)).length;
  const k = TL.todayKpi(L, done);
  const firstUnread = L.new.find((id) => !read.has(id) && !(stateOf(id) && stateOf(id).box));
  const Q = App.quick;
  const s1 = !L.new.length || nRead === L.new.length ? 'done' : 'active';
  const s2 = !q.total ? 'done' : s1 === 'done' ? 'active' : 'todo';
  let h = '<ol class="steps">';
  h += step(1, 'Đọc từ mới', nRead, L.new.length,
    '<p class="step-note">Mở từ trong Từ vựng, hoặc bấm Đã đọc ở nhóm bên dưới.</p>' +
    (firstUnread ? '<button class="btn sm" data-act="v-jump" data-id="' + firstUnread + '">Đọc tiếp trong Từ vựng</button>' : ''), s1);
  h += step(2, 'Ôn hôm nay', k.all.done, k.all.total,
    '<p class="step-note">' + (q.total ? q.total + ' thẻ còn lại. Từ đã đọc vào thẳng câu hỏi.' : 'Không còn thẻ đến hạn.') + '</p>' +
    (q.total ? '<button class="btn primary sm" data-act="start-daily">Bắt đầu ôn <kbd>Enter</kbd></button>' : ''), s2);
  const qa = Q && Q.day === today() ? Q.answered : 0;
  h += step(3, 'Câu hỏi nhanh', Q && Q.day === today() ? Q.right : 0, qa || null,
    '<p class="step-note">Nghĩa và câu GRE trên các từ hôm nay.</p><button class="btn sm" data-act="q-focus">Làm ngay</button>',
    qa && Q.i >= Q.qs.length ? 'done' : s2 === 'done' ? 'active' : 'todo');
  return h + '</ol>';
}

/* ---------------- Chủ đề hôm nay ---------------- */

function wordStatus(id, card, done, read, t) {
  const s = stateOf(id);
  if (done.has(id)) return '<span class="pill good">✓ Đã ôn</span>';
  if (card === 'new') return read.has(id) ? '<span class="pill info">Đã đọc</span>' : '<span class="pill">Mới</span>';
  const late = TL.overdueDays(s, t);
  return '<span class="pill' + (late ? ' warn' : '') + '">Hộp ' + (s ? s.box : 0) + (late ? ' · trễ ' + late + ' ngày' : '') + '</span>';
}

function topicsBlock(L, done, read, t) {
  const cardOf = {};
  L.due.forEach((id) => { cardOf[id] = 'due'; });
  L.new.forEach((id) => { cardOf[id] = 'new'; });
  const ids = L.due.concat(L.new.filter((id) => cardOf[id] === 'new' && !L.due.includes(id)));
  let h = '<section class="t-section"><div class="t-head"><h2>Chủ đề hôm nay</h2><span class="t-sub">' + L.new.length + ' từ mới · ' + L.due.length + ' từ đến hạn</span></div>';
  if (!ids.length) return h + '<p class="muted">Hôm nay không có từ mới hay từ đến hạn.</p></section>';
  h += '<div class="topics">';
  TL.groupByClusterGroup(ids, App.idx).forEach((c) => c.groups.forEach((g) => {
    const unread = g.ids.filter((id) => cardOf[id] === 'new' && !read.has(id) && !done.has(id));
    const ndone = g.ids.filter((id) => done.has(id)).length;
    h += '<article class="topic"><header class="topic-head"><div><div class="topic-cluster">' + esc(c.title) + '</div>' +
      '<h3>' + esc(g.title) + '</h3></div><span class="topic-count">' + ndone + '/' + g.ids.length + '</span></header><ul class="topic-words">';
    g.ids.forEach((id) => {
      const w = word(id);
      const s = stateOf(id);
      h += '<li><button class="tw" data-act="v-jump" data-id="' + id + '"><span class="tw-word">' + esc(w.word) + '</span>' +
        '<span class="tw-mean">' + esc(w.meaning) + '</span>' + (s && s.lapses ? '<span class="tw-lapse" title="Số lần quên">quên ' + s.lapses + '</span>' : '') +
        wordStatus(id, cardOf[id], done, read, t) + '</button></li>';
    });
    h += '</ul><footer class="topic-foot"><a class="btn sm quiet" href="#vocab/' + encodeURIComponent(c.clusterId) + '/' + encodeURIComponent(g.groupId) + '">Mở nhóm</a>' +
      (unread.length ? '<button class="btn sm" data-act="t-read" data-ids="' + unread.join(',') + '">Đã đọc ' + unread.length + ' từ mới</button>' : '') + '</footer></article>';
  }));
  h += '</div><div class="t-actions"><button class="btn" data-act="tl-practice" data-card="all" data-mode="gre">Luyện câu GRE với từ hôm nay</button>' +
    '<button class="btn" data-act="tl-practice" data-card="all" data-mode="w2m">Ôn nghĩa toàn bộ danh sách</button></div>';
  return h + '</section>';
}

/* ---------------- Từ hay quên ---------------- */

function leechBlock(L) {
  let h = '<section class="t-section"><div class="t-head"><h2>Từ hay quên</h2><span class="t-sub">' + L.leech.length + ' từ</span></div>';
  if (!L.leech.length) return h + '<p class="muted">Sổ từ hay quên đang trống.</p></section>';
  h += '<ul class="leeches">' + L.leech.slice(0, 12).map((id) => {
    const w = word(id), s = stateOf(id);
    const conf = (s.confusedWith || []).map(word).filter(Boolean).slice(0, 2);
    return '<li><button class="lc" data-act="v-jump" data-id="' + id + '"><span class="lc-top"><span class="tw-word">' + esc(w.word) + '</span>' +
      '<span class="lc-n">quên ' + s.lapses + ' lần</span></span><span class="tw-mean">' + esc(w.meaning) + '</span>' +
      (conf.length ? '<span class="lc-conf">Hay nhầm với ' + conf.map((x) => '<b>' + esc(x.word) + '</b>').join(', ') + '</span>' : '') + '</button></li>';
  }).join('') + '</ul>';
  if (L.leech.length > 12) h += '<p class="muted small">Và ' + (L.leech.length - 12) + ' từ khác trong Sổ từ hay quên.</p>';
  return h + '<div class="t-actions"><button class="btn" data-act="t-leech">Ôn sổ hay quên (' + L.leech.length + ' từ)</button></div></section>';
}

/* ---------------- Câu hỏi nhanh ---------------- */

/** Từ dùng cho câu hỏi nhanh: hay quên trước, rồi đến hạn, rồi từ mới đã đọc / đã học. Bỏ từ mới chưa đọc. */
function quickPool(L, read) {
  const seen = new Set(), out = [];
  const ok = (id) => { const s = stateOf(id); return (s && s.box) || read.has(id); };
  L.leech.concat(L.due, L.new).forEach((id) => { if (!seen.has(id) && word(id) && ok(id)) { seen.add(id); out.push(id); } });
  return out;
}

function buildQuick(L, read) {
  const pool = S.shuffle(quickPool(L, read).slice(0, 20));
  const leech = new Set(L.leech);
  pool.sort((a, b) => (leech.has(b) ? 1 : 0) - (leech.has(a) ? 1 : 0));
  App.quick = { day: today(), qs: TL.quickPlan(pool, practiceExercises(), 9), i: 0, right: 0, answered: 0, poolSize: pool.length };
}

function quickBlock(L, read) {
  const Q = App.quick;
  let h = '<section class="t-section" id="quick"><div class="t-head"><h2>Câu hỏi nhanh</h2>';
  if (Q && Q.qs.length) h += '<span class="t-sub">Câu ' + Math.min(Q.i + 1, Q.qs.length) + '/' + Q.qs.length + ' · đúng ' + Q.right + '</span>';
  h += '</div>';
  if (!Q || !Q.qs.length) {
    return h + '<div class="quick empty-q"><p class="muted">Chưa có từ nào để hỏi. Đọc từ mới hoặc ôn vài từ trước, câu hỏi nhanh dùng các từ đã gặp.</p></div></section>';
  }
  if (Q.i >= Q.qs.length) {
    return h + '<div class="quick"><p class="quick-score">Đúng <b>' + Q.right + '/' + Q.qs.length + '</b> câu.</p>' +
      '<div class="t-actions"><button class="btn primary" data-act="q-new">Làm lượt mới</button></div></div></section>';
  }
  const c = Q.qs[Q.i];
  h += '<div class="quick">' + (c.type === 'm2w' ? quickM2W(c) : quickGRE(c)) + '</div>';
  return h + '<p class="muted small">Kết quả được tính vào tiến độ ôn như trong phiên ôn.</p></section>';
}

function quickM2W(c) {
  const w = word(c.wordId);
  if (!c.options) c.options = S.shuffle([w.id].concat(pickDistractors(w, App.idx, 3)));
  let h = '<div class="q-kind">Nghĩa → Từ</div><div class="q-prompt">' + esc(w.meaning) + '</div>';
  h += '<div class="options q-opts">' + c.options.map((id, k) => {
    let cls = '', mark = '';
    if (c.picked) { if (id === w.id) { cls = ' correct'; mark = '✓'; } else if (id === c.picked) { cls = ' wrong'; mark = '✗'; } }
    return '<button class="opt' + cls + '" data-act="q-pick" data-id="' + id + '"' + (c.picked ? ' disabled' : '') + '><span class="num">' + (k + 1) + '</span><span>' +
      esc(word(id).word) + '</span><span class="mark">' + mark + '</span></button>';
  }).join('') + '</div>';
  if (c.picked) {
    const ok = c.picked === w.id;
    h += resultLine(ok, ok ? 'Chính xác' : 'Đáp án: ' + esc(w.word));
    if (!ok) { const p = word(c.picked); h += '<div class="explain"><b>' + esc(p.word) + '</b>: ' + esc(p.meaning) + '</div>'; }
    h += nextBtn();
  }
  return h;
}

function quickGRE(c) {
  const ex = App.idx.exById[c.exId];
  const isSE = ex.type === 'se';
  if (!c.order) { c.order = isSE ? [S.shuffle(ex.options)] : ex.blanks.map((b) => S.shuffle(b.options)); c.choice = isSE ? [] : ex.blanks.map(() => null); }
  const nB = isSE ? 1 : ex.blanks.length;
  let h = '<div class="q-kind">GRE · ' + (isSE ? 'Sentence Equivalence (chọn 2)' : 'Text Completion' + (nB > 1 ? ' · ' + nB + ' chỗ trống' : '')) + '</div>';
  h += '<p class="gre-sentence">' + esc(ex.sentence).replace(/\{(\d+)\}/g, (_, n) => {
    const f = isSE ? c.choice.join(' / ') : c.choice[+n];
    return '<span class="gap' + (f ? ' filled' : '') + '">' + (f ? esc(f) : '&nbsp;') + (nB > 1 ? '<small>(' + ROMAN[+n] + ')</small>' : '') + '</span>';
  }) + '</p>';
  h += '<div class="blank-cols n' + nB + '">' + c.order.map((opts, b) => '<div class="blank-col">' + (nB > 1 ? '<h4>Chỗ trống (' + ROMAN[b] + ')</h4>' : '') +
    '<div class="options">' + opts.map((o, k) => {
      const on = isSE ? c.choice.includes(o) : c.choice[b] === o;
      let cls = on ? ' on' : '', mark = '';
      if (c.checked) {
        const right = isSE ? ex.answers.includes(o) : o === ex.blanks[b].answer;
        if (right) { cls = ' correct'; mark = '✓'; } else if (on) { cls = ' wrong'; mark = '✗'; }
      }
      return '<button class="opt' + cls + '" aria-pressed="' + on + '" data-act="q-gre" data-b="' + b + '" data-o="' + esc(o) + '"' + (c.checked ? ' disabled' : '') + '>' +
        '<span class="num">' + (k + 1) + '</span><span>' + esc(o) + '</span><span class="mark">' + mark + '</span></button>';
    }).join('') + '</div></div>').join('') + '</div>';
  if (!c.checked) {
    const full = isSE ? c.choice.length === 2 : c.choice.every(Boolean);
    h += '<div class="t-actions"><button class="btn primary" data-act="q-check"' + (full ? '' : ' disabled') + '>Kiểm tra</button></div>';
  } else {
    h += resultLine(c.correct, c.correct ? 'Chính xác' : 'Đáp án: ' + esc(isSE ? ex.answers.join(', ') : ex.blanks.map((b) => b.answer).join(' · ')));
    if (ex.explanation) h += '<div class="explain">' + esc(ex.explanation) + '</div>';
    h += nextBtn();
  }
  return h;
}

const nextBtn = () => '<div class="t-actions"><button class="btn primary" data-act="q-next">Câu tiếp</button></div>';

/* ---------------- Trang ---------------- */

views.today = {
  title: 'Hôm nay',
  wide: () => true,
  render() {
    const t = today();
    const L = todayLists();
    const q = dailyQueue();
    const done = reviewedToday();
    const read = readToday();
    if (!App.quick || App.quick.day !== t || (!App.quick.qs.length && quickPool(L, read).length)) buildQuick(L, read);
    const streak = S.streakDays(activeDays(), t);
    const left = Math.max(0, S.daysBetween(t, EXAM_DATE));
    const name = App.user ? App.user.displayName || App.user.username : '';
    let h = '<header class="t-hero"><div><div class="today-date">' + weekday(t) + ', ' + fmtDate(t) + (name ? ' · ' + esc(name) : '') + '</div>' +
      '<h1 class="hero-title">' + (q.total ? 'Hôm nay: ' + L.new.length + ' từ mới, ' + L.due.length + ' từ đến hạn' : 'Hôm nay đã ôn xong') + '</h1></div>' +
      '<div class="t-badges"><span class="badge-big"><b>' + left + '</b> ngày đến GRE</span><span class="badge-big"><b>' + streak + '</b> ngày liên tục</span></div></header>';
    h += stepsBlock(L, done, read, q);
    if (!q.total) {
      const more = moreNewWords(L).length;
      h += '<div class="done-note"><p class="muted">Không còn thẻ nào đến hạn. Có thể học thêm từ mới hoặc làm vài câu GRE.</p><div class="done-actions">' +
        (more ? '<button class="btn" data-act="more-new">Học thêm 5 từ mới</button>' : '') + '<button class="btn" data-act="quick-gre">Làm 10 câu GRE</button></div></div>';
    }
    h += '<div class="t-grid"><div class="t-main">' + topicsBlock(L, done, read, t) + '</div><div class="t-side">' + quickBlock(L, read) + leechBlock(L) + '</div></div>';
    h += lastMockLine();
    h += '<details class="t-section t-progress"><summary><h2>Tiến độ theo cụm</h2></summary>';
    App.idx.clusters.forEach((c) => {
      const ws = App.idx.words.filter((w) => w.clusterId === c.id);
      if (!ws.length) return;
      const counts = [0, 0, 0, 0, 0, 0];
      ws.forEach((w) => { const s = App.progress[w.id]; counts[s ? s.box : 0]++; });
      h += '<div class="cluster-progress"><div class="cp-head"><span class="cp-title">' + esc(c.title) + '</span>' +
        '<span class="muted small">' + (ws.length - counts[0]) + '/' + ws.length + ' từ đã học</span></div>' +
        '<div class="bar" role="img" aria-label="' + counts.map((n, b) => 'hộp ' + b + ': ' + n).join(', ') + '">' +
        counts.map((n, b) => (n ? '<span class="b' + b + '" style="width:' + (100 * n / ws.length) + '%" title="Hộp ' + b + ': ' + n + ' từ"></span>' : '')).join('') +
        '</div></div>';
    });
    h += '<div class="legend">' + ['Chưa học', 'Hộp 1', 'Hộp 2', 'Hộp 3', 'Hộp 4', 'Hộp 5'].map((l, b) => '<span><i class="b' + b + '"></i>' + l + '</span>').join('') + '</div></details>';
    App.keyHandler = (e) => { if (e.key === 'Enter' && q.total && !isTyping(e) && !(e.target && e.target.closest && e.target.closest('button, summary, a'))) { e.preventDefault(); startDaily(); } };
    return h;
  }
};

/** Từ chưa học ngoài danh sách từ mới hôm nay (cho nút "Học thêm 5 từ mới"). */
function moreNewWords(L) {
  const inList = new Set(L.new);
  return S.unlearnedWords(App.idx, App.progress).filter((w) => !inList.has(w.id));
}

/** Mở Luyện tập với phạm vi Danh sách hôm nay (cả danh sách hoặc một thẻ) và dạng bài chọn sẵn. */
export function practiceToday(card, mode) {
  const P = App.practice;
  P.today = card;
  P.mode = mode;
  P.count = mode === 'gre' ? '20' : 'all';
  P.kinds = []; P.diffs = []; P.skills = []; P.onlyNew = false; P.useGroup = 'all';
  go('practice');
}

/** Vẽ lại mà giữ khối câu hỏi nhanh trong tầm nhìn. */
function rerenderQuick() {
  const el = document.getElementById('quick');
  const top = el ? el.getBoundingClientRect().top : null;
  render();
  const el2 = document.getElementById('quick');
  if (el2 && top != null) window.scrollBy(0, el2.getBoundingClientRect().top - top);
}

const qcur = () => App.quick && App.quick.qs[App.quick.i];

Object.assign(actions, {
  'start-daily': () => startDaily(),
  'more-new': () => {
    const ws = moreNewWords(todayLists()).slice(0, 5);
    startSession('daily', cardsForDaily(ws.map((w) => ({ wordId: w.id, isNew: true }))), { from: 'today', title: 'Học thêm từ mới' });
  },
  'quick-gre': () => {
    const cards = S.shuffle(practiceExercises()).slice(0, 10).map((ex) => ({ type: 'gre', exId: ex.id }));
    startSession('practice', cards, { from: 'today', title: 'GRE' });
  },
  'tl-practice': (t) => practiceToday(t.dataset.card, t.dataset.mode),
  't-read': (t) => {
    if (markRead((t.dataset.ids || '').split(',').filter(Boolean))) toast('Đã đánh dấu đã đọc. Phiên ôn sẽ hỏi thẳng các từ này.');
    App.quick = null;
    render();
  },
  't-leech': () => startWordsSession('book', todayLists().leech, 'Ôn sổ từ hay quên', 'today'),
  'q-focus': () => { const el = document.getElementById('quick'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  'q-pick': (t) => {
    const c = qcur();
    if (!c || c.picked) return;
    c.picked = t.dataset.id;
    const ok = c.picked === c.wordId;
    record(c.wordId, ok ? 'good' : 'again', { mode: 'm2w', chosen: c.picked }, ok ? [] : [c.picked]);
    App.quick.answered++; if (ok) App.quick.right++;
    rerenderQuick();
  },
  'q-gre': (t) => {
    const c = qcur();
    if (!c || c.checked) return;
    const ex = App.idx.exById[c.exId], o = t.dataset.o;
    if (ex.type === 'se') {
      const i = c.choice.indexOf(o);
      if (i >= 0) c.choice.splice(i, 1); else if (c.choice.length < 2) c.choice.push(o); else { toast('Chỉ chọn 2 từ.'); return; }
    } else c.choice[+t.dataset.b] = o;
    rerenderQuick();
  },
  'q-check': () => {
    const c = qcur();
    if (!c || c.checked) return;
    const ex = App.idx.exById[c.exId];
    const g = gradeExercise(ex, c.choice, App.idx);
    c.checked = true; c.correct = g.correct;
    const info = { mode: 'gre', exerciseId: ex.id, chosen: c.choice.filter(Boolean).join(' | ') };
    g.answerIds.forEach((id) => record(id, g.correct ? 'good' : 'again', info, g.confusions.filter((x) => x.wordId === id).map((x) => x.confusedWith)));
    g.otherTargetIds.forEach((id) => { if (!g.answerIds.includes(id)) touch(id, info); });
    App.quick.answered++; if (g.correct) App.quick.right++;
    rerenderQuick();
  },
  'q-next': () => { if (App.quick) App.quick.i++; rerenderQuick(); },
  'q-new': () => { App.quick = null; render(); const el = document.getElementById('quick'); if (el) el.scrollIntoView({ block: 'start' }); }
});
