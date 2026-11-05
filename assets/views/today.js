// Trang Hôm nay (mặc định sau khi đăng nhập).
import { App, S, esc, EXAM_DATE, views, actions, today, weekday, fmtDate, newToday, activeDays, leechWords, dailyQueue, isTyping } from '../state.js';
import { startDaily, startSession, cardsForDaily } from './session.js';
import { lastMockLine } from './mock.js';

function stat(n, suffix, label, alert) {
  return '<div class="stat' + (alert ? ' alert' : '') + '"><div class="stat-num">' + n + (suffix ? '<small>' + suffix + '</small>' : '') + '</div><div class="stat-label">' + label + '</div></div>';
}

views.today = {
  title: 'Hôm nay',
  render() {
    const t = today();
    const q = dailyQueue();
    const leeches = leechWords().length;
    const limit = Number(App.settings.newPerDay) || 0;
    const streak = S.streakDays(activeDays(), t);
    const left = S.daysBetween(t, EXAM_DATE);
    const name = App.user ? App.user.displayName || App.user.username : '';
    let h = '<div class="today-date">' + weekday(t) + ', ' + fmtDate(t) + (name ? ' · ' + esc(name) : '') + '</div>';
    h += '<h1 class="hero-title">' + (q.total ? 'Hôm nay có ' + q.total + ' thẻ cần ôn' : 'Hôm nay đã ôn xong') + '</h1>';
    h += '<div class="stats">' + stat(q.dueCount, '', 'từ đến hạn ôn') + stat(newToday(), '/' + limit, 'từ mới hôm nay') +
      stat(leeches, '', 'từ trong sổ hay quên', leeches > 0) + stat(streak, '', 'ngày ôn liên tục') + '</div>';
    if (q.total) {
      const label = q.items.length < q.total ? 'Bắt đầu ôn (' + q.items.length + ' / ' + q.total + ' thẻ)' : 'Bắt đầu ôn';
      h += '<button class="btn primary big" data-act="start-daily">' + label + ' <kbd>Enter</kbd></button>';
      const parts = [];
      if (q.dueCount) parts.push(q.dueCount + ' từ đến hạn');
      if (q.newCount) parts.push(q.newCount + ' từ mới');
      h += '<p class="muted small" style="margin:8px 0 0">Gồm ' + parts.join(' và ') + '. Tiến độ tự lưu sau mỗi thẻ.</p>';
    } else {
      const more = S.unlearnedWords(App.idx, App.progress).length;
      h += '<div class="done-note"><h3>Không còn thẻ nào đến hạn.</h3><p class="muted">Bạn có thể học thêm từ mới hoặc làm vài câu GRE.</p><div class="done-actions">' +
        (more ? '<button class="btn" data-act="more-new">Học thêm 5 từ mới</button>' : '') +
        '<button class="btn" data-act="quick-gre">Làm 10 câu GRE</button></div></div>';
    }
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
    App.keyHandler = (e) => { if (e.key === 'Enter' && q.total && !isTyping(e)) { e.preventDefault(); startDaily(); } };
    return h;
  }
};

Object.assign(actions, {
  'start-daily': () => startDaily(),
  'more-new': () => {
    const ws = S.unlearnedWords(App.idx, App.progress).slice(0, 5);
    startSession('daily', cardsForDaily(ws.map((w) => ({ wordId: w.id, isNew: true }))), { from: 'today', title: 'Học thêm từ mới' });
  },
  'quick-gre': () => {
    const cards = S.shuffle(App.idx.exercises).slice(0, 10).map((ex) => ({ type: 'gre', exId: ex.id }));
    startSession('practice', cards, { from: 'today', title: 'GRE' });
  }
});
