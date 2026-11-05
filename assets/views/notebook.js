// Sổ từ hay quên.
import { esc, views, actions, word, stateOf, leechWords } from '../state.js';
import { startWordsSession } from './session.js';

views.book = {
  title: 'Sổ từ hay quên',
  render() {
    const list = leechWords();
    let h = '<div class="page-head"><h1>Sổ từ hay quên</h1><p>Từ quên từ 2 lần trở lên, hoặc vừa quên. Rời sổ sau 3 lần đúng liên tiếp ở các ngày khác nhau.</p></div>';
    if (!list.length) return h + '<div class="empty">Sổ đang trống. Từ nào bạn hay quên sẽ tự xuất hiện ở đây.</div>';
    h += '<button class="btn primary big" data-act="start-book">Ôn sổ này ngay (' + list.length + ' từ)</button>';
    h += '<ul class="review-list" style="margin-top:14px">' + list.map((w) => {
      const s = stateOf(w.id);
      const conf = s.confusedWith.filter((id) => word(id)).map((id) => esc(word(id).word));
      return '<li><div class="row"><span class="w-word">' + esc(w.word) + '</span><span class="pos">' + esc(w.pos) + '</span><span class="spacer"></span>' +
        '<span class="tag leech">! Quên ' + s.lapses + ' lần</span></div><div>' + esc(w.meaning) + '</div>' +
        (conf.length ? '<div class="muted small">Hay nhầm với: ' + conf.join(', ') + '</div>' : '') + '</li>';
    }).join('') + '</ul>';
    return h;
  }
};

actions['start-book'] = () => startWordsSession('book', leechWords().map((w) => w.id), 'Ôn sổ từ hay quên', 'book');
