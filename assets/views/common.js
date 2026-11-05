// Thành phần hiển thị dùng chung giữa các trang.
import { App, esc, word, stateOf, fmtDate, fmtIsoDate } from '../state.js';
import { renderMarkup } from '../render.js';
import { contentBar, editableRows, wordExercises } from './content.js';
import { isAdmin } from '../state.js';

/** Chi tiết một từ: sắc thái, mức, ví dụ, collocation, gốc từ, từ dễ nhầm; withStatus: kèm trạng thái của tôi. */
export function wordDetail(w, withStatus) {
  const g = App.idx.groupById[w.group];
  const content = withStatus && !w.custom; // từ trong dữ liệu chung: có đề xuất sửa / chế độ sửa
  const editing = content && App.editMode && isAdmin();
  let h = (content ? contentBar(w) : '') + '<dl class="dl">';
  if (editing) h += editableRows(w);
  else {
  if (w.nuance) h += '<dt>Sắc thái</dt><dd>' + esc(w.nuance) + '</dd>';
  if (w.level) h += '<dt>Mức</dt><dd>' + w.level + '/4 trên “' + esc(g ? g.title : '') + '”</dd>';
  if (w.example) h += '<dt>Ví dụ</dt><dd class="example">' + renderMarkup(w.example) + '</dd>';
  if (w.collocations && w.collocations.length) h += '<dt>Collocation</dt><dd><ul class="colls">' + w.collocations.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></dd>';
  if (w.root) h += '<dt>Gốc từ</dt><dd>' + esc(w.root) + '</dd>';
  const conf = (w.confusables || []).filter((id) => word(id));
  if (conf.length) {
    h += '<dt>Dễ nhầm với</dt><dd>' + conf.map((id) => (withStatus
      ? '<button class="linkish" data-act="v-jump" data-id="' + id + '">' + esc(word(id).word) + '</button>'
      : '<b>' + esc(word(id).word) + '</b>')).join(', ') + '</dd>';
  }
  }
  if (withStatus) {
    const s = stateOf(w.id);
    h += '<dt>Của tôi</dt><dd>' + (s && s.box
      ? '<div class="mystat"><span>Hộp <b>' + s.box + '</b>/5</span><span>Quên <b>' + s.lapses + '</b> lần</span>' +
        '<span>Ôn gần nhất <b>' + fmtIsoDate(s.lastReviewed) + '</b></span><span>Đến hạn <b>' + fmtDate(s.dueDate) + '</b></span>' +
        (s.confusedWith.length ? '<span>Hay nhầm với <b>' + s.confusedWith.map((id) => esc(word(id) ? word(id).word : id)).join(', ') + '</b></span>' : '') +
        '</div>'
      : '<span class="muted">Chưa học</span>') + '</dd>';
  }
  h += '</dl>';
  if (content) h += wordExercises(w);
  return h;
}

export function resultLine(ok, text) {
  return '<div class="result-line ' + (ok ? 'ok' : 'no') + '" role="status"><span class="ico" aria-hidden="true">' + (ok ? '✓' : '✗') + '</span><span>' + text + '</span></div>';
}
