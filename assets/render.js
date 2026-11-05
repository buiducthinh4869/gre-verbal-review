/**
 * render.js: render an toàn. Escape HTML trước, rồi mới chuyển *...* (từ đang học) và **...** (collocation).
 */

export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** blankWord = true: thay từ đang học bằng _____ (dùng cho câu hỏi Nghĩa → Từ). */
export function renderMarkup(s, blankWord) {
  let h = escapeHtml(s);
  h = h.replace(/\*\*([^*]+)\*\*/g, '<b class="coll">$1</b>');
  h = h.replace(/\*([^*]+)\*/g, blankWord ? '<span class="blank">_____</span>' : '<em class="target">$1</em>');
  return h;
}

/** Che các dạng của từ (≥ 4 ký tự) trong đoạn HTML đã escape, để câu hỏi Nghĩa → Từ không lộ đáp án. */
export function maskForms(html, w) {
  const forms = (w.forms || []).filter((f) => f.length >= 4).map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!forms.length) return html;
  const re = new RegExp('(^|[^A-Za-z-])(' + forms.join('|') + ')[a-z]*', 'gi');
  return html.replace(re, '$1_____');
}

/** Bỏ dấu tiếng Việt và hạ chữ thường để tìm kiếm. */
export function fold(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}
