// Phiên ôn: thẻ giới thiệu, Từ → Nghĩa, Nghĩa → Từ, GRE (TC/SE), Xếp thang, tổng kết.
import { exTools } from './content.js';
import {
  App, S, esc, views, actions, word, stateOf, posLabel, stars, record, touch, pushReview,
  dailyQueue, toast, isTyping, render, go, stopTimer, now
} from '../state.js';
import { renderMarkup, maskForms } from '../render.js';
import { pickDistractors } from '../distractors.js';
import { gradeExercise, pickExerciseForWord } from '../vocab.js';
import { wordDetail, resultLine } from './common.js';

const shuffle = (a) => S.shuffle(a);
const ROMAN = ['i', 'ii', 'iii'];
const FROM_LABEL = { today: 'Hôm nay', practice: 'Luyện tập', mock: 'Thi thử', book: 'Sổ từ hay quên' };

/* ---------------- Bắt đầu phiên ---------------- */

export function startSession(kind, cards, opts = {}) {
  App.session = {
    kind, cards, i: 0, from: opts.from || App.view, title: opts.title || '',
    exam: !!App.settings.examMode, thinkFirst: !!App.settings.thinkFirst && !App.settings.examMode,
    answered: 0, right: 0, wrong: {}, examLog: [], requeued: {}
  };
  go('session');
}

const qType = (i) => (i % 2 ? 'm2w' : 'w2m');

/** Từ mới và hộp 1–2: xen kẽ Từ → Nghĩa / Nghĩa → Từ; hộp ≥ 3: bài GRE có từ trong targets (làm ít gần đây nhất). */
export function cardsForDaily(items) {
  const out = [], usedEx = {};
  let alt = 0;
  const news = items.filter((x) => x.isNew);
  items.filter((x) => !x.isNew).forEach((it) => {
    const s = stateOf(it.wordId);
    if (s && s.box >= 3) {
      const ex = pickExerciseForWord(it.wordId, App.idx, Object.assign({}, App.exLast, usedEx));
      if (ex && !usedEx[ex.id]) {
        usedEx[ex.id] = '9999';
        out.push({ type: 'gre', exId: ex.id, focus: it.wordId });
        return;
      }
      out.push({ type: 'w2m', wordId: it.wordId });
      return;
    }
    out.push({ type: qType(alt++), wordId: it.wordId });
  });
  // từ mới: thẻ giới thiệu đầy đủ trước; câu hỏi chậm một thẻ để không hỏi ngay sau khi vừa đọc
  news.forEach((it, k) => {
    out.push({ type: 'intro', wordId: it.wordId });
    if (k > 0) out.push({ type: qType(alt++), wordId: news[k - 1].wordId, isNew: true });
  });
  if (news.length) out.push({ type: qType(alt++), wordId: news[news.length - 1].wordId, isNew: true });
  return out;
}

export function startDaily() {
  const q = dailyQueue();
  if (!q.items.length) { toast('Hôm nay không còn thẻ nào.'); return; }
  startSession('daily', cardsForDaily(q.items), { from: 'today', title: 'Ôn hôm nay' });
}

export function startWordsSession(kind, ids, title, from) {
  startSession(kind, shuffle(ids).map((id, i) => ({ type: qType(i), wordId: id })), { from, title });
}

/** Từ vừa sai quay lại sau 3–5 thẻ, đổi sang dạng bài còn lại (tối đa 3 lần mỗi phiên). */
function requeue(wordId, failedType) {
  const se = App.session;
  se.requeued[wordId] = (se.requeued[wordId] || 0) + 1;
  if (se.requeued[wordId] > 3) return;
  const pos = Math.min(se.cards.length, se.i + 1 + 3 + Math.floor(Math.random() * 3));
  se.cards.splice(pos, 0, { type: failedType === 'w2m' ? 'm2w' : 'w2m', wordId, requeue: true });
}

function noteResult(ok, wordIds) {
  const se = App.session;
  se.answered++;
  if (ok) se.right++;
  else (wordIds || []).forEach((id) => { se.wrong[id] = true; });
}

function nextCard() {
  if (!App.session) return;
  App.session.i++;
  render();
  window.scrollTo(0, 0);
}

const card = () => App.session.cards[App.session.i];

/* ---------------- Khung phiên ---------------- */

views.session = {
  title: 'Phiên ôn',
  render() {
    const se = App.session;
    if (!se) { setTimeout(() => go('today'), 0); return ''; }
    if (se.i >= se.cards.length) return summary();
    const c = card();
    const pct = Math.round(100 * se.i / se.cards.length);
    const head = '<div class="session-top"><button class="btn quiet" data-act="end-session" aria-label="Dừng phiên">✕ Dừng</button>' +
      '<div class="progress" aria-hidden="true"><span style="width:' + pct + '%"></span></div>' +
      '<span class="session-count">' + (se.i + 1) + ' / ' + se.cards.length + '</span></div>';
    const body = { intro: cardIntro, w2m: cardW2M, m2w: cardM2W, gre: cardGRE, scale: cardScale }[c.type](c);
    return head + body;
  },
  after() {
    const se = App.session;
    if (!se || se.i >= se.cards.length) return;
    const c = card();
    if (c.type === 'w2m') { const ta = document.getElementById('typed'); if (ta) ta.value = c.typed || ''; }
    if (c.type === 'gre') startGreTimer(c);
    if (c.type === 'scale') bindScaleDnD(c);
  }
};

function kindLine(c, label, extra) {
  const bits = ['<span>' + label + '</span>'];
  const id = c.wordId || c.focus;
  if (id && c.type !== 'intro') {
    const s = stateOf(id);
    bits.push('<span class="dotsep">' + (s && s.box ? 'Hộp ' + s.box : 'Từ mới') + '</span>');
    if (S.isLeech(s)) bits.push('<span class="tag leech">! Hay quên</span>');
  }
  if (c.requeue) bits.push('<span class="dotsep">Ôn lại</span>');
  if (extra) bits.push(extra);
  return '<div class="card-kind">' + bits.join('') + '</div>';
}

function skipCard() { setTimeout(nextCard, 0); return ''; }

/* ---------------- Thẻ giới thiệu từ mới ---------------- */
function cardIntro(c) {
  const w = word(c.wordId);
  if (!w) return skipCard();
  App.keyHandler = (e) => { if ((e.key === 'Enter' || e.key === ' ') && !isTyping(e)) { e.preventDefault(); nextCard(); } };
  return '<article class="card">' + kindLine(c, 'Từ mới · ' + esc(App.idx.clusterById[w.clusterId].title)) +
    '<h2 class="word-big">' + esc(w.word) + '</h2><div class="word-sub"><span class="pos">' + esc(posLabel(w.pos)) + '</span>' + stars(w.priority) + '</div>' +
    '<div class="meaning-big">' + esc(w.meaning) + '</div>' + wordDetail(w, false) +
    '<div class="card-actions"><button class="btn primary" data-act="next">Đã đọc, sang câu tiếp <kbd>Enter</kbd></button></div></article>';
}

/* ---------------- Từ → Nghĩa (tự chấm) ---------------- */
function gradeBtn(r, label, key, suggest) {
  return '<button class="btn grade ' + r + (suggest === r ? ' suggest' : '') + '" data-act="w2m-grade" data-r="' + r + '">' +
    '<span class="g-label">' + { again: '✗ ', hard: '~ ', good: '✓ ' }[r] + label + '</span><kbd>' + key + '</kbd></button>';
}

function cardW2M(c) {
  const w = word(c.wordId);
  if (!w) return skipCard();
  let h = '<article class="card">' + kindLine(c, 'Từ → Nghĩa') +
    '<h2 class="word-big">' + esc(w.word) + '</h2><div class="word-sub"><span class="pos">' + esc(posLabel(w.pos)) + '</span>' + stars(w.priority) + '</div>';
  if (!c.revealed) {
    h += '<label class="sr-only" for="typed">Nghĩa bạn nhớ</label><textarea class="input" id="typed" rows="2" placeholder="Viết nghĩa bạn nhớ (không bắt buộc)"></textarea>' +
      '<div class="card-actions"><button class="btn primary" data-act="w2m-reveal">Xem đáp án <kbd>Space</kbd></button></div>';
    App.keyHandler = (e) => {
      if (e.key === 'Enter' && e.target.id === 'typed' && !e.shiftKey) { e.preventDefault(); revealW2M(); return; }
      if ((e.key === ' ' || e.key === 'Enter') && !isTyping(e)) { e.preventDefault(); revealW2M(); }
    };
  } else {
    if (c.typed) h += '<div class="muted small">Bạn viết: <span style="color:var(--ink)">' + esc(c.typed) + '</span></div>';
    h += '<div class="answer"><div class="meaning-big">' + esc(w.meaning) + '</div>' + wordDetail(w, false);
    const checks = c.checks || [false, false, false];
    h += '<ul class="checklist" aria-label="Tự kiểm tra">' + ['Hướng (khen hay chê)', 'Mức độ (nhẹ hay mạnh)', 'Điều kiện hoặc sắc thái riêng'].map((t, k) =>
      '<li><label><input type="checkbox" data-act="w2m-check" data-k="' + k + '"' + (checks[k] ? ' checked' : '') + '><span>' + t + '</span></label></li>').join('') + '</ul>';
    const n = checks.filter(Boolean).length;
    const suggest = c.checksTouched ? (n === 3 ? 'good' : n === 2 ? 'hard' : 'again') : '';
    h += '<p class="grade-hint">Đủ ba ý thì chấm Thuộc. Thiếu một ý thì chấm Tạm.</p><div class="grades">' +
      gradeBtn('again', 'Chưa nhớ', '1', suggest) + gradeBtn('hard', 'Tạm', '2', suggest) + gradeBtn('good', 'Thuộc', '3', suggest) + '</div></div>';
    App.keyHandler = (e) => {
      if (isTyping(e)) return;
      const m = { '1': 'again', '2': 'hard', '3': 'good' }[e.key];
      if (m) { e.preventDefault(); gradeW2M(m); } else if (e.key === 'Enter' && suggest) { e.preventDefault(); gradeW2M(suggest); }
    };
  }
  return h + '</article>';
}

function revealW2M() {
  const c = card();
  const ta = document.getElementById('typed');
  c.typed = ta ? ta.value.trim() : '';
  c.revealed = true;
  if (document.activeElement) document.activeElement.blur();
  render();
}

function gradeW2M(r) {
  const c = card();
  if (c.done) return;
  c.done = true;
  record(c.wordId, r, { mode: 'w2m', chosen: (c.typed || '').slice(0, 200) });
  noteResult(r !== 'again', [c.wordId]);
  if (r === 'again') requeue(c.wordId, 'w2m');
  nextCard();
}

/* ---------------- Nghĩa → Từ (trắc nghiệm 4 phương án) ---------------- */
function cardM2W(c) {
  const w = word(c.wordId);
  if (!w) return skipCard();
  const se = App.session;
  if (!c.options) c.options = shuffle([w.id].concat(pickDistractors(w, App.idx, 3)));
  let h = '<article class="card">' + kindLine(c, 'Nghĩa → Từ') + '<div class="meaning-big">' + esc(w.meaning) + '</div>' +
    (w.nuance ? '<p class="nuance">' + maskForms(esc(w.nuance), w) + '</p>' : '') +
    (w.example ? '<div class="prompt-example example">' + maskForms(renderMarkup(w.example, true), w) + '</div>' : '');
  if (!(c.revealed || !se.thinkFirst)) {
    h += '<div class="think"><p>Tự nghĩ ra từ trước, rồi mới xem lựa chọn.</p><button class="btn primary" data-act="show-options">Hiện lựa chọn <kbd>Space</kbd></button></div>';
    App.keyHandler = (e) => { if ((e.key === ' ' || e.key === 'Enter') && !isTyping(e)) { e.preventDefault(); c.revealed = true; render(); } };
    return h + '</article>';
  }
  h += '<div class="options" role="group" aria-label="Chọn từ đúng">' + c.options.map((id, k) => {
    let cls = '', mark = '';
    if (c.picked) {
      if (id === w.id) { cls = ' correct'; mark = '✓ Đúng'; } else if (id === c.picked) { cls = ' wrong'; mark = '✗ Bạn chọn'; }
    }
    return '<button class="opt' + cls + '" data-act="m2w-pick" data-id="' + id + '"' + (c.picked ? ' disabled' : '') + '>' +
      '<span class="num">' + (k + 1) + '</span><span>' + esc(word(id).word) + '</span><span class="mark">' + mark + '</span></button>';
  }).join('') + '</div>';
  if (c.picked) {
    const ok = c.picked === w.id;
    h += resultLine(ok, ok ? 'Chính xác' : 'Chưa đúng. Đáp án: ' + esc(w.word));
    if (!ok) { const p = word(c.picked); h += '<div class="explain"><b>' + esc(p.word) + '</b>: ' + esc(p.meaning) + (p.nuance ? '. ' + esc(p.nuance) : '') + '</div>'; }
    if (w.example) h += '<div class="example" style="margin-top:12px">' + renderMarkup(w.example) + '</div>';
    h += '<div class="card-actions"><button class="btn primary" data-act="next">Câu tiếp <kbd>Enter</kbd></button></div>';
    App.keyHandler = (e) => { if (e.key === 'Enter' && !isTyping(e)) { e.preventDefault(); nextCard(); } };
  } else {
    App.keyHandler = (e) => {
      if (isTyping(e)) return;
      const k = parseInt(e.key, 10);
      if (k >= 1 && k <= c.options.length) { e.preventDefault(); pickM2W(c.options[k - 1]); }
    };
  }
  return h + '</article>';
}

function pickM2W(id) {
  const c = card();
  if (c.picked) return;
  c.picked = id;
  const ok = id === c.wordId;
  record(c.wordId, ok ? 'good' : 'again', { mode: 'm2w', chosen: id }, ok ? [] : [id]);
  noteResult(ok, [c.wordId]);
  if (!ok) requeue(c.wordId, 'm2w');
  render();
}

/* ---------------- GRE: Text Completion / Sentence Equivalence ---------------- */
function hintArea(c, ex) {
  if (!ex.hint) return '';
  return c.hint ? '<div class="hintbox"><b>Gợi ý:</b> ' + esc(ex.hint) + '</div>' : '<div style="margin-top:10px"><button class="btn quiet" data-act="gre-hint">Gợi ý</button></div>';
}

function cardGRE(c) {
  const ex = App.idx.exById[c.exId];
  if (!ex) return skipCard();
  const se = App.session;
  const isSE = ex.type === 'se';
  if (!c.order) {
    c.order = isSE ? [shuffle(ex.options)] : ex.blanks.map((b) => shuffle(b.options));
    c.choice = isSE ? [] : ex.blanks.map(() => null);
    if (se.exam) c.deadline = now() + 60000;
  }
  const nBlanks = isSE ? 1 : ex.blanks.length;
  const label = isSE ? 'Sentence Equivalence' : 'Text Completion' + (nBlanks > 1 ? ' · ' + nBlanks + ' chỗ trống' : '');
  let h = '<article class="card">' + kindLine(c, 'GRE · ' + label, se.exam && !c.checked ? '<span class="dotsep timer" id="timer"></span>' : '');
  const sent = esc(ex.sentence).replace(/\{(\d+)\}/g, (_, n) => {
    n = +n;
    const filled = isSE ? (c.choice.length ? c.choice.join(' / ') : '') : c.choice[n];
    return '<span class="gap' + (filled ? ' filled' : '') + '">' + (filled ? esc(filled) : '&nbsp;') + (nBlanks > 1 ? '<small>(' + ROMAN[n] + ')</small>' : '') + '</span>';
  });
  h += '<p class="gre-sentence">' + sent + '</p>';
  if (isSE && !c.checked) h += '<p class="muted small" style="margin:0">Chọn <b>đúng 2</b> từ cho câu cùng nghĩa.</p>';
  if (!(c.revealed || !se.thinkFirst)) {
    h += '<div class="think"><p>Đọc câu, tự đoán từ cho chỗ trống trước.</p><button class="btn primary" data-act="show-options">Hiện lựa chọn <kbd>Space</kbd></button></div>';
    if (!se.exam) h += hintArea(c, ex);
    App.keyHandler = (e) => { if ((e.key === ' ' || e.key === 'Enter') && !isTyping(e)) { e.preventDefault(); c.revealed = true; render(); } };
    return h + '</article>';
  }
  const showResult = c.checked && !se.exam;
  if (isSE) {
    h += '<div class="options" role="group" aria-label="Chọn 2 phương án">' + c.order[0].map((o, k) => {
      const on = c.choice.includes(o);
      let cls = '', mark = '';
      if (showResult) { if (ex.answers.includes(o)) { cls = ' correct'; mark = '✓'; } else if (on) { cls = ' wrong'; mark = '✗'; } }
      return '<button class="opt se-box' + cls + '" role="checkbox" aria-checked="' + on + '" data-act="gre-pick" data-b="0" data-o="' + esc(o) + '"' + (c.checked ? ' disabled' : '') + '>' +
        '<span class="num">' + (k + 1) + '</span><span>' + esc(o) + '</span><span class="mark">' + mark + '</span></button>';
    }).join('') + '</div>';
    if (!c.checked) h += '<div class="se-count">Đã chọn ' + c.choice.length + '/2</div>';
  } else {
    let keyBase = 0;
    h += '<div class="blank-cols n' + nBlanks + '">' + c.order.map((opts, b) => {
      let col = '<div class="blank-col">' + (nBlanks > 1 ? '<h4>Chỗ trống (' + ROMAN[b] + ')</h4>' : '') + '<div class="options" role="radiogroup">';
      col += opts.map((o, k) => {
        const on = c.choice[b] === o;
        let cls = '', mark = '';
        if (showResult) { if (o === ex.blanks[b].answer) { cls = ' correct'; mark = '✓'; } else if (on) { cls = ' wrong'; mark = '✗'; } }
        return '<button class="opt' + cls + '" role="radio" aria-checked="' + on + '" data-act="gre-pick" data-b="' + b + '" data-o="' + esc(o) + '"' + (c.checked ? ' disabled' : '') + '>' +
          '<span class="num">' + (keyBase + k + 1) + '</span><span>' + esc(o) + '</span><span class="mark">' + mark + '</span></button>';
      }).join('');
      keyBase += opts.length;
      return col + '</div></div>';
    }).join('') + '</div>';
  }
  if (!c.checked) {
    const complete = isSE ? c.choice.length === 2 : c.choice.every(Boolean);
    if (!se.exam) h += hintArea(c, ex);
    h += '<div class="card-actions"><button class="btn primary" data-act="gre-check"' + (complete ? '' : ' disabled') + '>' + (se.exam ? 'Trả lời và sang câu tiếp' : 'Kiểm tra') + ' <kbd>Enter</kbd></button></div>';
    App.keyHandler = (e) => {
      if (isTyping(e)) return;
      const k = parseInt(e.key, 10);
      if (k >= 1) {
        const flat = [];
        c.order.forEach((opts, b) => opts.forEach((o) => flat.push([b, o])));
        if (k <= flat.length) { e.preventDefault(); pickGRE(flat[k - 1][0], flat[k - 1][1]); }
      } else if (e.key === 'Enter' && complete) { e.preventDefault(); checkGRE(); }
    };
  } else {
    const answerText = isSE ? ex.answers.join(', ') : ex.blanks.map((b) => b.answer).join(' · ');
    h += resultLine(c.correct, c.correct ? 'Chính xác' : 'Chưa đúng. Đáp án: ' + esc(answerText));
    h += '<div class="explain">' + esc(ex.explanation || '') + '</div>' + exTools(ex);
    h += '<div class="card-actions"><button class="btn primary" data-act="next">Câu tiếp <kbd>Enter</kbd></button></div>';
    App.keyHandler = (e) => { if (e.key === 'Enter' && !isTyping(e)) { e.preventDefault(); nextCard(); } };
  }
  return h + '</article>';
}

function pickGRE(b, o) {
  const c = card();
  if (c.checked) return;
  const ex = App.idx.exById[c.exId];
  if (ex.type === 'se') {
    const i = c.choice.indexOf(o);
    if (i >= 0) c.choice.splice(i, 1);
    else if (c.choice.length < 2) c.choice.push(o);
    else { toast('Chỉ chọn 2 từ. Bỏ một từ trước khi chọn từ khác.'); return; }
  } else {
    c.choice[b] = o;
  }
  render();
}

function checkGRE(force) {
  const se = App.session;
  const c = card();
  if (c.checked) return;
  const ex = App.idx.exById[c.exId];
  const complete = ex.type === 'se' ? c.choice.length === 2 : c.choice.every(Boolean);
  if (!complete && !force) return;
  c.checked = true;
  stopTimer();
  const g = gradeExercise(ex, c.choice, App.idx);
  c.correct = g.correct;
  const result = g.correct ? 'good' : 'again';
  const info = { mode: 'gre', exerciseId: ex.id, chosen: c.choice.filter(Boolean).join(' | ') };
  const graded = {};
  g.answerIds.forEach((id) => {
    record(id, result, info, g.confusions.filter((x) => x.wordId === id).map((x) => x.confusedWith));
    graded[id] = true;
  });
  if (c.focus && !graded[c.focus] && word(c.focus)) { record(c.focus, result, info); graded[c.focus] = true; }
  g.otherTargetIds.forEach((id) => { if (!graded[id]) touch(id, info); });
  noteResult(g.correct, Object.keys(graded));
  if (!g.correct && se.kind !== 'practice' && c.focus) requeue(c.focus, 'gre');
  if (se.exam) { se.examLog.push({ exId: ex.id, correct: g.correct, choice: c.choice.slice() }); nextCard(); } else render();
}

function startGreTimer(c) {
  if (!App.session.exam || c.checked || !c.deadline) return;
  const tick = () => {
    const el = document.getElementById('timer');
    const left = Math.max(0, Math.ceil((c.deadline - now()) / 1000));
    if (el) { el.textContent = '⏱ ' + Math.floor(left / 60) + ':' + ('0' + (left % 60)).slice(-2); el.classList.toggle('late', left <= 10); }
    if (left <= 0) { stopTimer(); checkGRE(true); }
  };
  tick();
  App.timer = setInterval(tick, 500);
}

/* ---------------- Xếp thang mức độ ---------------- */
function isSorted(ids) {
  for (let i = 1; i < ids.length; i++) if (word(ids[i]).level < word(ids[i - 1]).level) return false;
  return true;
}

function cardScale(c) {
  const g = App.idx.groupById[c.groupId];
  const ws = App.idx.words.filter((w) => w.group === g.id);
  if (!c.order) {
    const ids = ws.map((w) => w.id);
    let sh = shuffle(ids), tries = 0;
    while (isSorted(sh) && tries++ < 10) sh = shuffle(ids);
    c.order = sh;
  }
  let h = '<article class="card">' + kindLine(c, 'Xếp thang · ' + esc(g.title)) +
    '<p style="margin:0">Sắp các từ từ <b>nhẹ nhất</b> (trên cùng) đến <b>mạnh nhất</b> (dưới cùng). Từ cùng mức đổi chỗ cho nhau vẫn tính đúng.</p>';
  const levelsSorted = c.order.map((id) => word(id).level).sort((a, b) => a - b);
  h += '<div class="scale-axis"><span>↑ Nhẹ nhất</span></div><ol class="scale-list" id="scaleList">' + c.order.map((id, k) => {
    const w = word(id);
    const okPos = w.level === levelsSorted[k];
    const cls = c.checked ? (okPos ? ' correct' : ' wrong') : '';
    return '<li class="scale-item' + cls + '" data-id="' + id + '"' + (c.checked ? '' : ' draggable="true"') + '>' +
      '<span class="pos-n">' + (k + 1) + '</span><span>' + esc(w.word) + (c.checked ? ' <span class="muted small">· mức ' + w.level + (okPos ? ' ✓' : ' ✗') + '</span>' : '') + '</span>' +
      (c.checked ? '<span></span>' : '<span class="moves"><button data-act="sc-move" data-id="' + id + '" data-d="-1" aria-label="Đưa ' + esc(w.word) + ' lên"' + (k === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button data-act="sc-move" data-id="' + id + '" data-d="1" aria-label="Đưa ' + esc(w.word) + ' xuống"' + (k === c.order.length - 1 ? ' disabled' : '') + '>↓</button></span>') + '</li>';
  }).join('') + '</ol><div class="scale-axis"><span>↓ Mạnh nhất</span></div>';
  if (!c.checked) {
    h += '<div class="card-actions"><button class="btn primary" data-act="sc-check">Kiểm tra <kbd>Enter</kbd></button></div>';
    App.keyHandler = (e) => { if (e.key === 'Enter' && !isTyping(e)) { e.preventDefault(); checkScale(); } };
  } else {
    h += resultLine(c.correct, c.correct ? 'Đúng thứ tự' : 'Chưa đúng thứ tự');
    const right = ws.slice().sort((a, b) => a.level - b.level || a.fileIndex - b.fileIndex);
    h += '<h2 class="section" style="margin-top:14px">Thứ tự đúng</h2><ol class="scale-answer review-list">' + right.map((w) =>
      '<li><span class="muted small">Mức ' + w.level + '</span> · <b class="w-word" style="font-size:17px">' + esc(w.word) + '</b>: ' + esc(w.meaning) + '</li>').join('') + '</ol>';
    h += '<div class="card-actions"><button class="btn primary" data-act="next">Câu tiếp <kbd>Enter</kbd></button></div>';
    App.keyHandler = (e) => { if (e.key === 'Enter' && !isTyping(e)) { e.preventDefault(); nextCard(); } };
  }
  return h + '</article>';
}

function checkScale() {
  const c = card();
  if (c.checked) return;
  c.checked = true;
  c.correct = isSorted(c.order);
  noteResult(c.correct, []);
  pushReview('', null, { mode: 'scale', result: c.correct ? 'good' : 'again', exerciseId: 'scale:' + c.groupId, chosen: c.order.join(' < ') }, false);
  render();
}

function bindScaleDnD(c) {
  const list = document.getElementById('scaleList');
  if (!list || c.checked) return;
  let dragId = null;
  list.addEventListener('dragstart', (e) => {
    const li = e.target.closest('.scale-item');
    if (!li) return;
    dragId = li.dataset.id;
    li.classList.add('dragging');
    try { e.dataTransfer.setData('text/plain', dragId); e.dataTransfer.effectAllowed = 'move'; } catch (err) { /* bỏ qua */ }
  });
  list.addEventListener('dragover', (e) => {
    e.preventDefault();
    const li = e.target.closest('.scale-item');
    list.querySelectorAll('.over').forEach((x) => x.classList.remove('over'));
    if (li && li.dataset.id !== dragId) li.classList.add('over');
  });
  list.addEventListener('drop', (e) => {
    e.preventDefault();
    const li = e.target.closest('.scale-item');
    if (!li || !dragId || li.dataset.id === dragId) return;
    const from = c.order.indexOf(dragId);
    c.order.splice(from, 1);
    let to = c.order.indexOf(li.dataset.id);
    if (from <= to) to += 1;
    c.order.splice(to, 0, dragId);
    render();
  });
  list.addEventListener('dragend', () => { dragId = null; render(); });
}

/* ---------------- Tổng kết ---------------- */
function summary() {
  const se = App.session;
  const wrongIds = Object.keys(se.wrong).filter((id) => word(id));
  let h = '<div class="page-head"><h1>' + (se.kind === 'daily' ? 'Xong phiên ôn' : 'Tổng kết') + '</h1></div>';
  h += '<div class="summary-score">' + se.right + '<small> / ' + se.answered + ' câu đúng</small></div>';
  if (se.examLog.length) {
    h += '<h2 class="section">Các câu GRE</h2><ul class="review-list">' + se.examLog.map((x, k) => {
      const ex = App.idx.exById[x.exId];
      const ans = ex.type === 'se' ? ex.answers.join(', ') : ex.blanks.map((b) => b.answer).join(' · ');
      const sent = esc(ex.sentence).replace(/\{(\d+)\}/g, (_, n) => '<span class="gap">' + (ex.blanks && ex.blanks.length > 1 ? '(' + ROMAN[+n] + ')' : '&nbsp;') + '</span>');
      return '<li><div class="row"><b>Câu ' + (k + 1) + '</b>' + (x.correct ? '<span class="tag known">✓ Đúng</span>' : '<span class="tag leech">✗ Sai</span>') + '</div>' +
        '<p class="example" style="margin:6px 0">' + sent + '</p>' +
        '<div class="small">Bạn chọn: <b>' + esc(x.choice.filter(Boolean).join(', ') || '(bỏ trống)') + '</b> · Đáp án: <b>' + esc(ans) + '</b></div>' +
        '<div class="explain small">' + esc(ex.explanation || '') + '</div>' + exTools(ex) + '</li>';
    }).join('') + '</ul>';
  }
  if (wrongIds.length) {
    h += '<h2 class="section">Từ cần xem lại (' + wrongIds.length + ')</h2><ul class="review-list">' + wrongIds.map((id) => {
      const w = word(id);
      return '<li><span class="w-word">' + esc(w.word) + '</span> <span class="pos">' + esc(w.pos) + '</span><div>' + esc(w.meaning) + '</div></li>';
    }).join('') + '</ul>';
  } else if (se.answered) {
    h += '<p class="muted">Không sai từ nào trong phiên này.</p>';
  }
  h += '<div class="form-grid" style="margin-top:20px">';
  if (wrongIds.length) h += '<button class="btn primary big" data-act="retry-wrong">Ôn lại các từ sai <kbd>Enter</kbd></button>';
  if (se.kind === 'daily') {
    const q = dailyQueue();
    if (q.total) h += '<button class="btn big' + (wrongIds.length ? '' : ' primary') + '" data-act="start-daily">Ôn tiếp (' + q.total + ' thẻ còn lại)</button>';
  }
  h += '<button class="btn big" data-act="nav-from">Về ' + (FROM_LABEL[se.from] || 'Hôm nay') + '</button></div>';
  App.keyHandler = (e) => {
    if (e.key !== 'Enter' || isTyping(e)) return;
    e.preventDefault();
    if (wrongIds.length) retryWrong(); else go(se.from || 'today');
  };
  return h;
}

function retryWrong() {
  const se = App.session;
  startWordsSession('retry', Object.keys(se.wrong).filter((id) => word(id)), 'Ôn lại các từ sai', se.from);
}

Object.assign(actions, {
  'end-session': () => go((App.session && App.session.from) || 'today'),
  'next': () => nextCard(),
  'w2m-reveal': () => revealW2M(),
  'w2m-grade': (t) => gradeW2M(t.dataset.r),
  'show-options': () => { card().revealed = true; render(); },
  'm2w-pick': (t) => pickM2W(t.dataset.id),
  'gre-hint': () => { card().hint = true; render(); },
  'gre-pick': (t) => pickGRE(Number(t.dataset.b), t.dataset.o),
  'gre-check': () => checkGRE(),
  'sc-move': (t) => {
    const c = card();
    const i = c.order.indexOf(t.dataset.id), j = i + Number(t.dataset.d);
    if (j < 0 || j >= c.order.length) return;
    [c.order[i], c.order[j]] = [c.order[j], c.order[i]];
    render();
    const btn = document.querySelector('[data-act="sc-move"][data-id="' + t.dataset.id + '"][data-d="' + t.dataset.d + '"]');
    if (btn && !btn.disabled) btn.focus();
  },
  'sc-check': () => checkScale(),
  'retry-wrong': () => retryWrong(),
  'nav-from': () => go((App.session && App.session.from) || 'today')
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (App.view === 'session' && t.matches('[data-act="w2m-check"]')) {
    const c = card();
    c.checks = c.checks || [false, false, false];
    c.checks[Number(t.dataset.k)] = t.checked;
    c.checksTouched = true;
    render();
  }
});
document.addEventListener('input', (e) => {
  if (App.view === 'session' && e.target.id === 'typed' && App.session) card().typed = e.target.value;
});
