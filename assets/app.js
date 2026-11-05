/**
 * app.js: khởi động, tải dữ liệu từ vựng, định tuyến bằng hash (#today, #vocab, ...), sự kiện chung.
 */
import { App, views, actions, go, render, rebuildIndex, ROUTES, parseHash, lastHash, setLastHash } from './state.js';
import { boot, refresh } from './auth.js';
import { openMenu, closeMenu, closeSettings } from './views/settings.js';
import './views/today.js';
import './views/vocab.js';
import './views/practice.js';
import './views/mock.js';
import './views/session.js';
import './views/notebook.js';
import './views/addword.js';
import './views/account.js';
import './views/admin.js';
import './views/content.js';
import './views/login.js';

/** Tải data/index.json rồi từng cụm trong data/clusters/ (thứ tự theo index). */
async function loadVocab() {
  const get = async (p) => {
    const r = await fetch(p, { cache: 'no-cache' });
    if (!r.ok) throw new Error(p + ': ' + r.status);
    return r.json();
  };
  const index = await get('data/index.json');
  const clusters = await Promise.all(index.clusters.map((id) => get('data/clusters/' + id + '.json')));
  return { clusters };
}

/** Nút Quay lại / Tiến của trình duyệt, hoặc bấm link #...: dựng lại đúng trang và cấp đang xem. */
function routeFromHash() {
  if (!App.token || !App.idx) return;
  if (App.view === 'login' || App.view === 'setpw') return;
  if (location.hash === lastHash) return; // popstate và hashchange cùng bắn cho một lần đổi
  setLastHash(location.hash);
  const { view, sub } = parseHash(location.hash);
  if (!ROUTES.includes(view)) return;
  const v = views[view];
  if (view === App.view && !(v && v.enter)) return;
  App.session = null;
  App.view = view;
  if (v && v.enter) v.enter(sub);
  render();
  window.scrollTo(0, 0);
}

/* ---------------- Sự kiện chung ---------------- */
Object.assign(actions, {
  'menu-go': (t) => { closeMenu(); go(t.dataset.id); }
});

document.addEventListener('click', (e) => {
  const menu = document.getElementById('meMenu');
  if (!menu.hidden && !e.target.closest('#meMenu') && !e.target.closest('#meBtn')) closeMenu();
  if (e.target.closest('#meBtn')) { if (menu.hidden) openMenu(); else closeMenu(); return; }
  const nav = e.target.closest('[data-nav]');
  if (nav) { e.preventDefault(); if (App.token && App.idx) go(nav.dataset.nav); return; }
  const t = e.target.closest('[data-act]');
  if (!t || t.disabled) return;
  const fn = actions[t.dataset.act];
  if (fn) {
    if (t.tagName !== 'INPUT') e.preventDefault();
    fn(t, e);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Escape') { closeMenu(); closeSettings(); }
  if (!document.getElementById('settings').hidden || !document.getElementById('meMenu').hidden) return;
  const tag = (e.target && e.target.tagName) || '';
  if ((e.key === 'Enter' || e.key === ' ') && (tag === 'BUTTON' || tag === 'A')) return; // để nút tự xử lý
  if (App.keyHandler) App.keyHandler(e);
});

document.getElementById('settingsBackdrop').addEventListener('click', closeSettings);
window.addEventListener('popstate', routeFromHash);
window.addEventListener('hashchange', routeFromHash);

/* Lưu khi trang bị ẩn; quay lại sau hơn 10 phút thì lấy dữ liệu mới từ thiết bị khác. */
let hiddenAt = null;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    if (App.sync) App.sync.flush({ keepalive: true });
  } else {
    if (hiddenAt && Date.now() - hiddenAt > 10 * 60 * 1000 && App.token && App.view !== 'login') {
      if (App.sync) App.sync.flush();
      refresh();
    }
    hiddenAt = null;
  }
});
window.addEventListener('pagehide', () => { if (App.sync) App.sync.flushOnExit(); });
window.addEventListener('online', () => { if (App.sync && App.sync.queue.length) App.sync.flush(); });

/* ---------------- Khởi động ---------------- */
(async function start() {
  try {
    App.vocabData = await loadVocab();
  } catch (err) {
    document.getElementById('view').innerHTML = '<div class="empty">Không tải được dữ liệu từ vựng (' + String(err.message || err) + '). Tải lại trang để thử lại.</div>';
    return;
  }
  rebuildIndex();
  await boot();
})();

window.__app = App; // để soát lỗi trong DevTools
void views;
