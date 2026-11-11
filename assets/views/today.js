// Trang Hôm nay (mặc định sau khi đăng nhập): số liệu trong ngày, nút Bắt đầu ôn, khối Danh sách hôm nay, tiến độ theo cụm.
import {
  App, S, TL, esc, EXAM_DATE, views, actions, today, weekday, fmtDate, activeDays, dailyQueue, isTyping, render, go,
  todayLists, reviewedToday, stateOf, word
} from '../state.js';
import { startDaily, startSession, cardsForDaily } from './session.js';
import { lastMockLine } from './mock.js';

const PHONE = '(max-width: 640px)';
const isPhone = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia(PHONE).matches;

function stat(card, done, total, label, alert) {
  const inner = '<div class="stat-num">' + (total == null ? done : done + '<small>/' + total + '</small>') + '</div><div class="stat-label">' + label + '</div>';
  return '<button class="stat' + (alert ? ' alert' : '') + '" data-act="tl-open" data-card="' + card + '" aria-controls="tlist">' + inner + '</button>';
}

/** Thẻ đang hiện: người dùng đã chọn, hoặc thẻ đầu tiên còn từ chưa ôn. */
function currentTab(L, done) {
  const t = App.todayList.tab;
  return TL.CARDS.includes(t) ? t : TL.firstOpenCard(L, done);
}

function wordRow(id, done, t) {
  const w = word(id);
  const s = stateOf(id);
  const ok = done.has(id);
  const late = TL.overdueDays(s, t);
  const meta = [];
  meta.push(s && s.box ? 'Hộp ' + s.box : 'Chưa học');
  if (late) meta.push('<span class="late">quá hạn ' + late + ' ngày</span>');
  if (s && s.lapses) meta.push('quên ' + s.lapses + ' lần');
  return '<li><button class="tl-row' + (ok ? ' done' : '') + '" data-act="v-jump" data-id="' + id + '">' +
    '<span class="tl-check" aria-hidden="true">' + (ok ? '✓' : '') + '</span>' +
    '<span class="tl-main"><span class="tl-word">' + esc(w.word) + '</span><span class="tl-mean">' + esc(w.meaning) + '</span></span>' +
    '<span class="tl-meta">' + meta.join(' · ') + '</span>' +
    '<span class="sr-only">' + (ok ? 'Đã ôn hôm nay' : 'Chưa ôn hôm nay') + '</span></button></li>';
}

const EMPTY = {
  due: 'Hôm nay không có từ nào đến hạn.',
  new: 'Hôm nay không có từ mới (đã học hết, hoặc số từ mới mỗi ngày đang là 0 trong Cài đặt).',
  leech: 'Sổ từ hay quên đang trống.'
};

function cardPanel(card, ids, done, t) {
  let h = '<div class="tl-panel" role="tabpanel" id="tl-panel" aria-labelledby="tl-tab-' + card + '">';
  if (!ids.length) return h + '<p class="muted">' + EMPTY[card] + '</p></div>';
  TL.groupByClusterGroup(ids, App.idx).forEach((c) => {
    c.groups.forEach((g) => {
      h += '<h3 class="tl-group">' + esc(c.title) + ' <span aria-hidden="true">›</span> ' + esc(g.title) + ' <span class="muted">' + g.ids.length + '</span></h3>';
      h += '<ul class="tl-list">' + g.ids.map((id) => wordRow(id, done, t)).join('') + '</ul>';
    });
  });
  h += '<div class="tl-actions"><button class="btn" data-act="tl-practice" data-card="' + card + '" data-mode="gre">Luyện tập GRE với các từ này</button>' +
    '<button class="btn" data-act="tl-practice" data-card="' + card + '" data-mode="w2m">Ôn nghĩa các từ này</button></div>';
  return h + '</div>';
}

function todayBlock(L, done, t) {
  const k = TL.todayKpi(L, done);
  const all = TL.unionIds(L);
  const tab = currentTab(L, done);
  const open = App.todayList.open == null ? !isPhone() : App.todayList.open;
  const pct = k.all.total ? Math.round(100 * k.all.done / k.all.total) : 0;
  let h = '<details class="tlist" id="tlist"' + (open ? ' open' : '') + '><summary>' +
    '<span class="tl-head"><span class="tl-title">Danh sách hôm nay</span><span class="tl-count">Hoàn thành hôm nay: <b>' + k.all.done + '/' + k.all.total + '</b></span></span>' +
    '<span class="tl-bar" role="progressbar" aria-label="Hoàn thành hôm nay" aria-valuemin="0" aria-valuemax="' + k.all.total + '" aria-valuenow="' + k.all.done + '"><span style="width:' + pct + '%"></span></span>' +
    '</summary>';
  if (all.length) h += '<p class="tl-topics"><b>Hôm nay:</b> ' + esc(TL.topicLine(all, App.idx)) + '</p>';
  h += '<div class="tl-tabs" role="tablist" aria-label="Thẻ của danh sách hôm nay">' + TL.CARDS.map((c) =>
    '<button class="chip" role="tab" id="tl-tab-' + c + '" data-act="tl-tab" data-card="' + c + '" aria-selected="' + (c === tab) + '" aria-pressed="' + (c === tab) + '" aria-controls="tl-panel">' +
    TL.CARD_LABEL[c] + ' <span class="tl-n">' + k[c].done + '/' + k[c].total + '</span></button>').join('') + '</div>';
  h += cardPanel(tab, L[tab], done, t);
  if (all.length) h += '<button class="btn primary tl-all" data-act="tl-practice" data-card="all" data-mode="gre">Luyện tập toàn bộ danh sách hôm nay (' + all.length + ' từ)</button>';
  return h + '</details>';
}

views.today = {
  title: 'Hôm nay',
  render() {
    const t = today();
    const L = todayLists();
    const q = dailyQueue();
    const done = reviewedToday();
    const k = TL.todayKpi(L, done);
    const streak = S.streakDays(activeDays(), t);
    const left = S.daysBetween(t, EXAM_DATE);
    const name = App.user ? App.user.displayName || App.user.username : '';
    let h = '<div class="today-date">' + weekday(t) + ', ' + fmtDate(t) + (name ? ' · ' + esc(name) : '') + '</div>';
    h += '<h1 class="hero-title">' + (q.total ? 'Hôm nay có ' + q.total + ' thẻ cần ôn' : 'Hôm nay đã ôn xong') + '</h1>';
    h += '<div class="stats">' + stat('due', k.due.done, k.due.total, 'từ đến hạn đã ôn') + stat('new', k.new.done, k.new.total, 'từ mới đã ôn') +
      stat('leech', k.leech.done, k.leech.total, 'từ hay quên đã ôn', k.leech.total > k.leech.done) + stat('first', streak, null, 'ngày ôn liên tục') + '</div>';
    if (q.total) {
      const label = q.items.length < q.total ? 'Bắt đầu ôn (' + q.items.length + ' / ' + q.total + ' thẻ)' : 'Bắt đầu ôn';
      h += '<button class="btn primary big" data-act="start-daily">' + label + ' <kbd>Enter</kbd></button>';
      const parts = [];
      if (q.dueCount) parts.push(q.dueCount + ' từ đến hạn');
      if (q.newCount) parts.push(q.newCount + ' từ mới');
      h += '<p class="muted small" style="margin:8px 0 0">Gồm ' + parts.join(' và ') + '. Tiến độ tự lưu sau mỗi thẻ.</p>';
    } else {
      const more = moreNewWords(L).length;
      h += '<div class="done-note"><h3>Không còn thẻ nào đến hạn.</h3><p class="muted">Bạn có thể học thêm từ mới hoặc làm vài câu GRE.</p><div class="done-actions">' +
        (more ? '<button class="btn" data-act="more-new">Học thêm 5 từ mới</button>' : '') +
        '<button class="btn" data-act="quick-gre">Làm 10 câu GRE</button></div></div>';
    }
    h += todayBlock(L, done, t);
    h += lastMockLine();
    h += '<div class="countdown" style="margin-top:22px"><b>' + Math.max(0, left) + '</b><span>ngày đến kỳ thi GRE (' + fmtDate(EXAM_DATE) + ')</span></div>';
    h += '<h2 class="section">Tiến độ theo cụm</h2>';
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
    h += '<div class="legend">' + ['Chưa học', 'Hộp 1', 'Hộp 2', 'Hộp 3', 'Hộp 4', 'Hộp 5'].map((l, b) => '<span><i class="b' + b + '"></i>' + l + '</span>').join('') + '</div>';
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
  // bỏ bộ lọc GRE cũ để số câu tìm được đúng là số câu có từ của danh sách làm đáp án
  P.kinds = []; P.diffs = []; P.skills = []; P.onlyNew = false; P.useGroup = 'all';
  go('practice');
}

Object.assign(actions, {
  'start-daily': () => startDaily(),
  'more-new': () => {
    const ws = moreNewWords(todayLists()).slice(0, 5);
    startSession('daily', cardsForDaily(ws.map((w) => ({ wordId: w.id, isNew: true }))), { from: 'today', title: 'Học thêm từ mới' });
  },
  'quick-gre': () => {
    const cards = S.shuffle(App.idx.exercises).slice(0, 10).map((ex) => ({ type: 'gre', exId: ex.id }));
    startSession('practice', cards, { from: 'today', title: 'GRE' });
  },
  'tl-tab': (t) => {
    App.todayList.tab = t.dataset.card;
    render();
    const b = document.getElementById('tl-tab-' + t.dataset.card);
    if (b) b.focus({ preventScroll: true });
  },
  'tl-open': (t) => {
    const card = t.dataset.card;
    App.todayList.tab = TL.CARDS.includes(card) ? card : null;
    App.todayList.open = true;
    render();
    const el = document.getElementById('tlist');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  'tl-practice': (t) => practiceToday(t.dataset.card, t.dataset.mode)
});

document.addEventListener('toggle', (e) => {
  if (e.target && e.target.id === 'tlist' && App.view === 'today') App.todayList.open = e.target.open;
}, true);
