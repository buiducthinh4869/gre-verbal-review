// Trang Tài khoản: đổi tên hiển thị, tên đăng nhập, mật khẩu (không cần mật khẩu cũ), đăng xuất.
import { App, esc, views, toast, render } from '../state.js';
import { call } from '../api.js';
import { updateProfile } from '../auth.js';
import { checkNewPassword } from './login.js';

views.account = {
  title: 'Tài khoản',
  render() {
    const u = App.user || {};
    return '<div class="page-head"><h1>Tài khoản</h1><p>Đăng nhập là <b>' + esc(u.username) + '</b>' + (u.role === 'admin' ? ' · người quản lý' : '') + '.</p></div>' +
      '<form id="nameForm" class="form-grid panel" novalidate><h2 class="section" style="margin-top:0">Tên hiển thị</h2>' +
      '<div class="field"><label for="a-display" class="sr-only">Tên hiển thị</label><input class="input" id="a-display" maxlength="40" value="' + esc(u.displayName || '') + '"><div class="help">1–40 ký tự, hiện ở trang Hôm nay.</div></div>' +
      '<p class="form-error" id="a-display-err" role="alert" hidden></p><button class="btn" type="submit">Lưu tên hiển thị</button></form>' +
      '<form id="userForm" class="form-grid panel" novalidate><h2 class="section" style="margin-top:0">Tên đăng nhập</h2>' +
      '<div class="field"><label for="a-user" class="sr-only">Tên đăng nhập</label><input class="input" id="a-user" maxlength="20" autocapitalize="none" spellcheck="false" value="' + esc(u.username || '') + '"><div class="help">3–20 ký tự: chữ thường a–z, số, dấu chấm, gạch dưới, gạch ngang. Tiến độ ôn giữ nguyên khi đổi tên.</div></div>' +
      '<p class="form-error" id="a-user-err" role="alert" hidden></p><button class="btn" type="submit">Đổi tên đăng nhập</button></form>' +
      '<form id="passForm" class="form-grid panel" novalidate><h2 class="section" style="margin-top:0">Mật khẩu</h2>' +
      '<input type="text" name="username" autocomplete="username" value="' + esc(u.username || '') + '" hidden>' +
      '<div class="field"><label for="a-pass">Mật khẩu mới</label><input class="input" id="a-pass" type="password" autocomplete="new-password" minlength="6"></div>' +
      '<div class="field"><label for="a-pass2">Nhập lại mật khẩu mới</label><input class="input" id="a-pass2" type="password" autocomplete="new-password" minlength="6"></div>' +
      '<p class="form-error" id="a-pass-err" role="alert" hidden></p><button class="btn" type="submit">Đổi mật khẩu</button></form>' +
      '<button class="btn big" data-act="logout" style="margin-top:18px">Đăng xuất khỏi thiết bị này</button>';
  }
};

function showErr(id, msg) { const el = document.getElementById(id); if (el) { el.textContent = msg; el.hidden = !msg; } }

async function submit(form, errId, fn) {
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  showErr(errId, '');
  try { await fn(); } catch (err) { showErr(errId, err.message); } finally { if (btn.isConnected) btn.disabled = false; }
}

document.addEventListener('submit', (e) => {
  const f = e.target;
  if (f.id === 'nameForm') {
    e.preventDefault();
    const v = document.getElementById('a-display').value.trim();
    if (!v || v.length > 40) { showErr('a-display-err', 'Tên hiển thị cần 1–40 ký tự.'); return; }
    submit(f, 'a-display-err', async () => { await updateProfile({ displayName: v }); toast('Đã lưu tên hiển thị.'); render(); });
  } else if (f.id === 'userForm') {
    e.preventDefault();
    const v = document.getElementById('a-user').value.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,20}$/.test(v)) { showErr('a-user-err', 'Tên đăng nhập cần 3–20 ký tự, chỉ gồm chữ thường a–z, số và . _ -'); return; }
    if (v === App.user.username) { showErr('a-user-err', 'Đây đã là tên đăng nhập hiện tại.'); return; }
    submit(f, 'a-user-err', async () => { await updateProfile({ username: v }); toast('Đã đổi tên đăng nhập thành ' + v + '.'); render(); });
  } else if (f.id === 'passForm') {
    e.preventDefault();
    const a = document.getElementById('a-pass').value, b = document.getElementById('a-pass2').value;
    const msg = checkNewPassword(a, b);
    if (msg) { showErr('a-pass-err', msg); return; }
    submit(f, 'a-pass-err', async () => { await call('setPassword', { password: a }, App.token); toast('Đã đổi mật khẩu.'); render(); });
  }
});
