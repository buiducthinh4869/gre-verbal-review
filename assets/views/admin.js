// Trang Quản lý (chỉ role = admin; server cũng kiểm tra). Không có chức năng xem chi tiết câu trả lời của người khác.
import { App, esc, views, actions, toast } from '../state.js';
import { call } from '../api.js';
import { sessionLost } from '../auth.js';
import { isAuthError } from '../api.js';
import { adminContentHtml, reloadQueue } from './content.js';

const A = { users: null, loading: false, error: '', reveal: null, renaming: null };

async function load() {
  A.loading = true;
  A.error = '';
  paint();
  try {
    A.users = (await call('adminListUsers', {}, App.token)).users;
  } catch (err) {
    if (isAuthError(err)) { sessionLost(err); return; }
    A.error = err.message;
  }
  A.loading = false;
  paint();
}

function paint() {
  const el = document.getElementById('adminList');
  if (el && App.view === 'admin') el.innerHTML = list();
}

function list() {
  if (A.error) return '<div class="empty">' + esc(A.error) + ' <button class="btn quiet" data-act="adm-reload">Thử lại</button></div>';
  if (!A.users) return '<div class="loading">Đang tải danh sách tài khoản…</div>';
  return A.users.map((u) => {
    const me = App.user && u.userId === App.user.userId;
    const state = u.active ? '<span class="tag known">✓ Đang dùng</span>' : '<span class="tag">🔒 Đang khóa</span>';
    let h = '<div class="acct' + (u.active ? '' : ' off') + '"><div class="acct-head"><div><div class="acct-name">' + esc(u.username) +
      (u.displayName && u.displayName !== u.username ? ' <span class="muted">· ' + esc(u.displayName) + '</span>' : '') + '</div>' +
      '<div class="muted small">' + u.userId + (u.role === 'admin' ? ' · quản lý' : '') + ' · đăng nhập gần nhất: ' + esc(u.lastLoginAt || 'chưa') +
      (u.mustChangePassword ? ' · chưa đặt mật khẩu riêng' : '') + '</div></div>' + state + '</div>' +
      '<div class="acct-stats"><span><b>' + u.learned + '</b> từ đã học</span><span><b>' + u.due + '</b> đến hạn</span><span' + (u.leech ? ' class="bad"' : '') + '><b>' + u.leech + '</b> hay quên</span></div>';
    if (A.reveal && A.reveal.userId === u.userId) {
      h += '<div class="reveal" role="status"><div>Mật khẩu tạm của <b>' + esc(A.reveal.username) + '</b> (chỉ hiện một lần, gửi cho người đó):</div>' +
        '<code class="pw">' + esc(A.reveal.password) + '</code><div class="muted small">Người đó phải đặt mật khẩu mới ở lần đăng nhập sau.</div>' +
        '<button class="btn quiet" data-act="adm-hide">Tôi đã ghi lại, ẩn đi</button></div>';
    }
    if (A.renaming === u.userId) {
      h += '<form class="rename" data-user="' + u.userId + '" novalidate><label class="sr-only" for="rn-' + u.userId + '">Tên đăng nhập mới</label>' +
        '<input class="input" id="rn-' + u.userId + '" maxlength="20" autocapitalize="none" spellcheck="false" value="' + esc(u.username) + '">' +
        '<button class="btn primary" type="submit">Lưu</button><button class="btn" type="button" data-act="adm-rename-cancel">Hủy</button></form>';
    }
    h += '<div class="acct-actions">' +
      (me ? '' : '<button class="btn" data-act="adm-active" data-id="' + u.userId + '" data-on="' + (u.active ? '0' : '1') + '">' + (u.active ? 'Khóa' : 'Mở khóa') + '</button>') +
      (me ? '' : '<button class="btn" data-act="adm-reset" data-id="' + u.userId + '">Đặt lại mật khẩu</button>') +
      '<button class="btn" data-act="adm-rename" data-id="' + u.userId + '">Đổi tên đăng nhập</button>' +
      (me ? '<span class="muted small">Tài khoản của bạn (đổi mật khẩu ở trang Tài khoản)</span>' : '') + '</div></div>';
    return h;
  }).join('');
}

views.admin = {
  title: 'Quản lý',
  render() {
    if (!App.user || App.user.role !== 'admin') return '<div class="empty">Chỉ người quản lý mới xem được trang này.</div>';
    return '<div class="page-head"><h1>Quản lý</h1><p>Duyệt đề xuất sửa nội dung; mở tài khoản khi giao cho bạn bè, đặt lại mật khẩu khi họ quên. Tiến độ gắn với mã người dùng (u01…u10), không đổi khi đổi tên.</p></div>' +
      '<div id="ceAdmin">' + adminContentHtml() + '</div><h2 class="section">Tài khoản</h2><div id="adminList">' + list() + '</div>';
  },
  after() { if (App.user && App.user.role === 'admin') { if (!A.loading) load(); reloadQueue(); } }
};

async function act(fn, okMsg) {
  try { await fn(); if (okMsg) toast(okMsg); } catch (err) { if (isAuthError(err)) { sessionLost(err); return; } toast(err.message); }
  await load();
}

Object.assign(actions, {
  'adm-reload': () => load(),
  'adm-hide': () => { A.reveal = null; paint(); },
  'adm-active': (t) => {
    const on = t.dataset.on === '1';
    act(() => call('adminSetActive', { userId: t.dataset.id, active: on }, App.token), on ? 'Đã mở khóa tài khoản.' : 'Đã khóa tài khoản.');
  },
  'adm-reset': (t) => {
    if (t.dataset.armed !== '1') {
      t.dataset.armed = '1';
      t.textContent = 'Bấm lần nữa để đặt lại';
      setTimeout(() => { if (t.isConnected) { t.dataset.armed = ''; t.textContent = 'Đặt lại mật khẩu'; } }, 3500);
      return;
    }
    act(async () => { A.reveal = await call('adminResetPassword', { userId: t.dataset.id }, App.token); });
  },
  'adm-rename': (t) => { A.renaming = t.dataset.id; paint(); const el = document.getElementById('rn-' + t.dataset.id); if (el) el.focus(); },
  'adm-rename-cancel': () => { A.renaming = null; paint(); }
});

document.addEventListener('submit', (e) => {
  const f = e.target;
  if (!f.classList.contains('rename')) return;
  e.preventDefault();
  const userId = f.dataset.user;
  const name = f.querySelector('input').value.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,20}$/.test(name)) { toast('Tên đăng nhập cần 3–20 ký tự, chỉ gồm chữ thường a–z, số và . _ -'); return; }
  A.renaming = null;
  act(async () => {
    await call('adminRenameUser', { userId, username: name }, App.token);
    if (App.user.userId === userId) { App.user.username = name; }
  }, 'Đã đổi tên đăng nhập thành ' + name + '.');
});
