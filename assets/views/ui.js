// Thành phần giao diện dùng chung: mục lục dính bên trái (tự sáng mục đang đọc), thanh điều hướng con của tab Luyện tập,
// ô mẹo / bẫy nổi bật có biểu tượng.
import { esc } from '../state.js';

/* ---------------- Ô mẹo và bẫy ---------------- */
const CALLOUT = { tip: '💡', trap: '⚠️', note: '📌' };
/** kind: 'tip' | 'trap' | 'note'. body là HTML đã escape (hoặc dùng calloutList cho danh sách chữ thuần). */
export function callout(kind, title, body) {
  return '<div class="callout ' + kind + '"><span class="ci" aria-hidden="true">' + (CALLOUT[kind] || '💡') + '</span><div class="cb">' +
    (title ? '<b class="ct">' + esc(title) + '</b>' : '') + body + '</div></div>';
}
export const calloutList = (kind, title, items, ordered) =>
  callout(kind, title, '<' + (ordered ? 'ol' : 'ul') + ' class="tips-list">' + items.map((x) => '<li>' + esc(x) + '</li>').join('') + '</' + (ordered ? 'ol' : 'ul') + '>');

/* ---------------- Mục lục dính bên trái ---------------- */
let spy = null;
/** items: [[id phần, nhãn]]; main: HTML các phần (mỗi phần có id tương ứng, class toc-sec). */
export function tocLayout(items, main, title) {
  return '<div class="tips-layout"><nav class="tips-toc" aria-label="Mục lục"><div class="tips-toc-title">' + esc(title || 'Mục lục') + '</div><ol>' +
    items.map(([id, l], k) => '<li><a href="#" data-jump="' + id + '"><span class="tips-toc-n">' + (k + 1) + '</span><span>' + esc(l) + '</span></a></li>').join('') +
    '</ol><div class="tips-progress" aria-hidden="true"><i></i></div></nav><div class="tips-main">' + main + '</div></div>';
}
/** Gọi trong after(): bấm mục để cuộn tới, cuộn trang thì sáng mục đang đọc và chạy thanh tiến độ. */
export function bindToc() {
  if (spy) spy();
  const links = [...document.querySelectorAll('.tips-toc [data-jump]')];
  if (!links.length) { spy = null; return; }
  const ids = links.map((a) => a.dataset.jump);
  const setActive = (id) => links.forEach((a) => {
    const on = a.dataset.jump === id;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    const ol = a.closest('ol');
    if (on && ol && ol.scrollWidth > ol.clientWidth) ol.scrollLeft = a.parentElement.offsetLeft - (ol.clientWidth - a.parentElement.offsetWidth) / 2;
  });
  links.forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    const el = document.getElementById(a.dataset.jump);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); setActive(a.dataset.jump); }
  }));
  const bar = document.querySelector('.tips-progress i');
  const update = () => {
    if (!document.querySelector('.tips-layout')) { window.removeEventListener('scroll', update); return; }
    let cur = ids[0];
    ids.forEach((id) => { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top < 140) cur = id; });
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max > 0 && window.scrollY >= max - 2) cur = ids[ids.length - 1];
    setActive(cur);
    if (bar) bar.style.width = (max > 0 ? Math.min(100, Math.round(100 * window.scrollY / max)) : 100) + '%';
  };
  window.addEventListener('scroll', update, { passive: true });
  spy = () => window.removeEventListener('scroll', update);
  update();
}

/* ---------------- Thanh điều hướng con của tab Luyện tập ---------------- */
const PX = [
  { id: 'practice', icon: '📚', label: 'Verbal', desc: 'Từ vựng, TC và SE' },
  { id: 'reading', icon: '📖', label: 'Reading', desc: 'Đoạn văn như đề thật' },
  { id: 'quant', icon: '🧮', label: 'Quant', desc: '4 câu bẫy mỗi ngày' }
];
/** Bọc nội dung một mục luyện tập bằng thanh điều hướng con (dọc bên trái trên màn rộng, hàng nút trên điện thoại). */
export function practiceShell(active, main) {
  return '<div class="px-layout"><nav class="px-nav" aria-label="Các mục luyện tập"><div class="tips-toc-title">Luyện tập</div>' +
    PX.map((p) => '<button class="px-item' + (p.id === active ? ' on' : '') + '" data-nav="' + p.id + '"' + (p.id === active ? ' aria-current="page"' : '') + '>' +
      '<span class="px-ic" aria-hidden="true">' + p.icon + '</span><span class="px-tx"><b>' + p.label + '</b><small>' + p.desc + '</small></span></button>').join('') +
    '</nav><div class="px-main">' + main + '</div></div>';
}
