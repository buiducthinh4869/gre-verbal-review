/**
 * auth.js: đăng nhập, đăng xuất, khởi động phiên người dùng, làm mới trạng thái từ server.
 * Token lưu trong localStorage (mỗi thiết bị đăng nhập một lần, hạn 180 ngày kể từ lần dùng gần nhất).
 */
import { call, isAuthError, LS, SyncQueue } from './api.js';
import { App, applyState, loadCache, mergeServerStates, setServerClock, saveCache, render, go, toast, ROUTES, DEFAULT_SETTINGS, parseHash, views } from './state.js';

const TOKEN_KEY = 'gre.token';
const USER_KEY = 'gre.user';

function setSyncStatus(s) {
  const el = document.getElementById('sync');
  if (!el) return;
  el.setAttribute('data-s', s);
  const text = { saved: 'Đã lưu', pending: 'Đang lưu', saving: 'Đang lưu', error: 'Chưa lưu được, sẽ thử lại' }[s];
  el.querySelector('.sync-text').textContent = text;
  el.title = text;
}

/** Bắt đầu làm việc với một người dùng: hàng đợi riêng, bộ nhớ đệm riêng. */
function startUser(user, token) {
  if (App.sync && App.user && App.user.userId !== user.userId) App.sync.stop();
  App.token = token;
  App.user = user;
  LS.set(TOKEN_KEY, token);
  LS.set(USER_KEY, user);
  if (!App.sync || App.sync.o.userId !== user.userId) {
    App.sync = new SyncQueue({
      userId: user.userId,
      getToken: () => App.token,
      onStatus: setSyncStatus,
      onSaved: (data) => { setServerClock(data.nowMs); mergeServerStates(data.states); },
      onAuthError: (err) => sessionLost(err)
    });
  } else {
    App.sync.resume();
  }
}

function resetData() {
  App.progress = {}; App.customWords = []; App.daily = {}; App.exLast = {}; App.exRes = {}; App.mocks = null;
  App.settings = Object.assign({}, DEFAULT_SETTINGS);
}

/** Phiên hết hạn hoặc bị xóa: giữ hàng đợi, đưa về trang đăng nhập. */
export function sessionLost(err) {
  if (err && err.code === 'must_change_password') {
    if (App.user) { App.user.mustChangePassword = true; LS.set(USER_KEY, App.user); }
    if (App.sync) App.sync.paused = false;
    go('setpw');
    return;
  }
  App.token = null;
  LS.del(TOKEN_KEY);
  App.session = null;
  App.loginNotice = err && err.message ? err.message : '';
  go('login');
}

export async function login(username, password) {
  const data = await call('login', { username, password });
  const sameUser = App.user && App.user.userId === data.user.userId;
  if (!sameUser) resetData();
  startUser(data.user, data.token);
  App.loginNotice = '';
  if (data.user.mustChangePassword) { go('setpw'); return; }
  await enterApp();
}

/** Sau khi có phiên hợp lệ và không cần đổi mật khẩu: nạp đệm, hiện trang, làm mới ở nền. */
export async function enterApp(opts = {}) {
  const hadCache = loadCache();
  const ph = parseHash(location.hash);
  const target = ROUTES.includes(ph.view) ? ph.view : 'today';
  const sub = ROUTES.includes(ph.view) && ph.sub.length ? ph.sub : undefined;
  const open = () => (opts.view ? go(opts.view) : go(target, sub));
  if (hadCache) open();
  else document.getElementById('view').innerHTML = '<div class="loading">Đang tải tiến độ của bạn…</div>';
  App.sync.resume();
  const ok = await refresh();
  if (ok && !hadCache) open();
  if (ok) loadMocks();
  if (ok && App.view === 'today' && App.settings.autoStart && opts.autoStart !== false) {
    const { startDaily } = await import('./views/session.js');
    startDaily();
  }
}

/** Lịch sử thi thử (tab mocks) ở nền; gửi lại các bài thi thử chưa lưu được. Lỗi thì bỏ qua (không chặn trang khác). */
export async function loadMocks() {
  if (!App.token) return;
  try {
    const { flushMockQueue } = await import('./views/mock.js');
    await flushMockQueue();
    const data = await call('getMocks', { limit: 20 }, App.token);
    App.mocks = data.mocks || [];
    saveCache();
    if (App.view === 'today' || (App.view === 'mock' && !(views.mock && views.mock.immersive && views.mock.immersive()))) render();
  } catch (err) {
    if (isAuthError(err)) sessionLost(err);
  }
}

/** getState ở nền; trả về true nếu thành công. */
export async function refresh() {
  if (!App.token) return false;
  try {
    const st = await call('getState', {}, App.token);
    if (st.user) { App.user = Object.assign(App.user || {}, st.user); LS.set(USER_KEY, App.user); }
    applyState(st);
    App.lastRefresh = Date.now();
    if (App.view !== 'session' && App.view !== 'login' && App.view !== 'setpw') render();
    return true;
  } catch (err) {
    if (isAuthError(err)) { sessionLost(err); return false; }
    if (!App.idx || !Object.keys(App.progress).length) toast(err.message);
    return false;
  }
}

export async function logout() {
  if (App.sync) await App.sync.flush();
  if (App.sync && App.sync.queue.length) {
    toast('Còn ' + App.sync.queue.length + ' thao tác chưa lưu được. Kiểm tra mạng rồi thử đăng xuất lại.');
    return;
  }
  try { await call('logout', {}, App.token); } catch (e) { /* phiên có thể đã hết hạn */ }
  if (App.sync) App.sync.stop();
  App.sync = null;
  App.token = null;
  App.user = null;
  resetData();
  LS.del(TOKEN_KEY);
  LS.del(USER_KEY);
  go('login');
}

export async function setNewPassword(password) {
  const data = await call('setPassword', { password }, App.token);
  App.user = Object.assign(App.user, data.user);
  LS.set(USER_KEY, App.user);
  toast('Đã đặt mật khẩu mới.');
  await enterApp({ view: 'today' });
}

export async function updateProfile(patch) {
  const data = await call('updateProfile', patch, App.token);
  App.user = Object.assign(App.user, data.user);
  LS.set(USER_KEY, App.user);
  return data.user;
}

/** Khởi động khi mở trang: có token thì vào thẳng (đăng nhập một lần mỗi thiết bị). */
export async function boot() {
  const token = LS.get(TOKEN_KEY, null);
  const user = LS.get(USER_KEY, null);
  if (!token || !user || !user.userId) { go('login'); return; }
  startUser(user, token);
  if (user.mustChangePassword) { go('setpw'); return; }
  await enterApp();
}

export { saveCache };
