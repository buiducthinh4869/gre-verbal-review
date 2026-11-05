// Đăng nhập và Đặt mật khẩu mới (bắt buộc ở lần đăng nhập đầu hoặc sau khi được đặt lại).
import { App, esc, views } from '../state.js';
import { login, setNewPassword, logout } from '../auth.js';

const brand = '';

views.login = {
  auth: true,
  title: 'Đăng nhập',
  render() {
    const notice = App.loginNotice ? '<p class="auth-notice" role="status">' + esc(App.loginNotice) + '</p>' : '';
    return '<div class="auth">' + brand + '<h1>Đăng nhập</h1><p class="muted">Mỗi người một lộ trình ôn riêng. Tài khoản do người quản lý cấp.</p>' + notice +
      '<form id="loginForm" class="form-grid" autocomplete="on" novalidate>' +
      '<div class="field"><label for="l-user">Tên đăng nhập</label><input class="input" id="l-user" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required value="' + esc((App.user && App.user.username) || '') + '"></div>' +
      '<div class="field"><label for="l-pass">Mật khẩu</label><input class="input" id="l-pass" name="password" type="password" autocomplete="current-password" required></div>' +
      '<p class="form-error" id="l-err" role="alert" hidden></p>' +
      '<button class="btn primary big" type="submit" id="l-btn">Đăng nhập</button></form></div>';
  },
  after() { const u = document.getElementById(App.user && App.user.username ? 'l-pass' : 'l-user'); if (u) u.focus(); }
};

views.setpw = {
  auth: true,
  title: 'Đặt mật khẩu mới',
  render() {
    const name = App.user ? App.user.displayName || App.user.username : '';
    return '<div class="auth">' + brand + '<h1>Đặt mật khẩu mới</h1><p class="muted">Chào ' + esc(name) + '. Trước khi bắt đầu ôn, hãy đặt mật khẩu của riêng bạn (ít nhất 6 ký tự).</p>' +
      '<form id="setpwForm" class="form-grid" novalidate>' +
      '<input type="text" name="username" autocomplete="username" value="' + esc(App.user ? App.user.username : '') + '" hidden>' +
      '<div class="field"><label for="p-new">Mật khẩu mới</label><input class="input" id="p-new" type="password" autocomplete="new-password" minlength="6" required></div>' +
      '<div class="field"><label for="p-again">Nhập lại mật khẩu mới</label><input class="input" id="p-again" type="password" autocomplete="new-password" minlength="6" required></div>' +
      '<p class="form-error" id="p-err" role="alert" hidden></p>' +
      '<button class="btn primary big" type="submit" id="p-btn">Lưu mật khẩu và bắt đầu</button>' +
      '<button class="btn quiet" type="button" data-act="logout">Đăng xuất</button></form></div>';
  },
  after() { const el = document.getElementById('p-new'); if (el) el.focus(); }
};

/** Kiểm tra hai ô mật khẩu; trả về chuỗi lỗi hoặc ''. Dùng chung cho trang Tài khoản. */
export function checkNewPassword(a, b) {
  if (a.length < 6) return 'Mật khẩu cần ít nhất 6 ký tự.';
  if (a.length > 100) return 'Mật khẩu quá dài (tối đa 100 ký tự).';
  if (a !== b) return 'Hai lần nhập mật khẩu chưa khớp.';
  return '';
}

function showErr(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.hidden = !msg; }

async function busy(btnId, label, fn) {
  const btn = document.getElementById(btnId);
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = label;
  try { await fn(); } finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = old; } }
}

document.addEventListener('submit', (e) => {
  if (e.target.id === 'loginForm') {
    e.preventDefault();
    const u = document.getElementById('l-user').value.trim();
    const p = document.getElementById('l-pass').value;
    if (!u || !p) { showErr('l-err', 'Nhập tên đăng nhập và mật khẩu.'); return; }
    showErr('l-err', '');
    busy('l-btn', 'Đang đăng nhập…', async () => {
      try { await login(u, p); } catch (err) { if (document.getElementById('l-err')) showErr('l-err', err.message); }
    });
  }
  if (e.target.id === 'setpwForm') {
    e.preventDefault();
    const a = document.getElementById('p-new').value, b = document.getElementById('p-again').value;
    const msg = checkNewPassword(a, b);
    showErr('p-err', msg);
    if (msg) return;
    busy('p-btn', 'Đang lưu…', async () => {
      try { await setNewPassword(a); } catch (err) { if (document.getElementById('p-err')) showErr('p-err', err.message); }
    });
  }
});

export { logout };
