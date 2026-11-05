// Menu tài khoản (góc trên) và ngăn Cài đặt (lưu trong tab settings, theo từng người).
import { App, esc, actions, render, setSetting } from '../state.js';
import { logout } from '../auth.js';

export function openMenu() {
  const m = document.getElementById('meMenu');
  const u = App.user || {};
  m.innerHTML = '<div class="menu-who"><b>' + esc(u.displayName || u.username || '') + '</b><span class="muted small">' + esc(u.username || '') + '</span></div>' +
    '<button role="menuitem" data-act="menu-go" data-id="account">Tài khoản</button>' +
    '<button role="menuitem" data-act="open-settings">Cài đặt</button>' +
    (u.role === 'admin' ? '<button role="menuitem" data-act="menu-go" data-id="admin">Quản lý</button>' : '') +
    '<button role="menuitem" data-act="logout">Đăng xuất</button>';
  m.hidden = false;
  document.getElementById('meBtn').setAttribute('aria-expanded', 'true');
  const first = m.querySelector('button');
  if (first) first.focus();
}

export function closeMenu() {
  const m = document.getElementById('meMenu');
  if (m.hidden) return;
  m.hidden = true;
  document.getElementById('meBtn').setAttribute('aria-expanded', 'false');
}

export function openSettings() {
  closeMenu();
  const el = document.getElementById('settings');
  const st = App.settings;
  const row = (k, title, desc) => '<div class="switch-row"><div class="t"><b>' + title + '</b><span>' + desc + '</span></div>' +
    '<span class="switch"><input type="checkbox" data-setting="' + k + '"' + (st[k] ? ' checked' : '') + ' role="switch" aria-label="' + title + '"><span class="track"></span></span></div>';
  el.innerHTML = '<div class="settings-head"><h2>Cài đặt</h2><button class="icon-btn" data-act="close-settings" aria-label="Đóng">' +
    '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path stroke="currentColor" stroke-width="2" d="m6 6 12 12M18 6 6 18"/></svg></button></div>' +
    '<div class="switch-row"><div class="t"><b>Số từ mới mỗi ngày</b><span>Áp dụng từ phiên ôn tiếp theo</span></div>' +
    '<div class="num-input"><button data-act="s-new" data-d="-1" aria-label="Bớt">−</button><output id="s-new-val">' + st.newPerDay + '</output><button data-act="s-new" data-d="1" aria-label="Thêm">+</button></div></div>' +
    row('autoStart', 'Tự bắt đầu ôn khi mở web', 'Mở web là vào phiên ôn hôm nay luôn') +
    row('thinkFirst', 'Tự nghĩ trước', 'Ẩn phương án cho tới khi bấm Hiện lựa chọn') +
    row('examMode', 'Chế độ thi', 'Không gợi ý, ~1 phút mỗi câu GRE, giải thích ở cuối phiên') +
    '<p class="muted small" style="margin-top:16px">Cài đặt và tiến độ được lưu theo tài khoản, dùng được trên mọi thiết bị.</p>';
  el.hidden = false;
  document.getElementById('settingsBackdrop').hidden = false;
}

export function closeSettings() {
  const el = document.getElementById('settings');
  if (el.hidden) return;
  el.hidden = true;
  document.getElementById('settingsBackdrop').hidden = true;
  if (App.view !== 'session') render();
}

Object.assign(actions, {
  'open-settings': () => openSettings(),
  'close-settings': () => closeSettings(),
  'logout': () => { closeMenu(); logout(); },
  's-new': (t) => {
    const v = Math.max(0, Math.min(50, (Number(App.settings.newPerDay) || 0) + Number(t.dataset.d)));
    setSetting('newPerDay', v);
    document.getElementById('s-new-val').textContent = v;
  }
});

document.addEventListener('change', (e) => {
  if (e.target.dataset && e.target.dataset.setting) setSetting(e.target.dataset.setting, e.target.checked);
});
