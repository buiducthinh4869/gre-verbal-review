// Test phía server (apps-script/*.js) chạy trong giả lập Apps Script: chuyển dữ liệu cũ, tài khoản, phiên, lưu tiến độ.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const { makeEnv, loadServer, post, Sheet } = require('./gas_mock.cjs');

const ADMIN_KEY = 'test-admin-key-0123456789';
const ADMIN_KEY_HASH = crypto.createHash('sha256').update(ADMIN_KEY).digest('base64');

// Dữ liệu giống hệt cấu trúc Sheet bản cũ (không có userId; có cột lastMoved, eventId)
const LEGACY = {
  progress: [
    ['wordId', 'box', 'dueDate', 'lapses', 'correctStreak', 'totalReviews', 'lastResult', 'lastReviewed', 'confusedWith', 'updatedAt', 'lastMoved'],
    ['laud', '1', '2026-11-05', '0', '0', '1', 'hard', '2026-11-04T12:27:16.623Z', '', '2026-11-04T12:27:16.623Z', '2026-11-04'],
    ['lionize', '1', '2026-11-05', '1', '0', '3', 'good', '2026-11-04T12:50:28.362Z', 'venerate', '2026-11-04T12:50:28.362Z', '2026-11-04'],
    ['eulogize', '1', '2026-11-04', '0', '0', '1', 'again', '2026-11-04T12:48:49.244Z', '', '2026-11-04T12:48:49.244Z', '2026-11-04'],
  ],
  log: [
    ['timestamp', 'wordId', 'mode', 'result', 'exerciseId', 'chosen', 'device', 'eventId'],
    ['04/11/2026 19:27:16', 'laud', 'w2m', 'hard', '', '', 'desktop-q0azzq', 'desktop-q0azzq-a-0'],
    ['04/11/2026 19:48:49', 'lionize', 'gre', 'again', 'tc19', 'x | y', 'desktop-q0azzq', 'desktop-q0azzq-b-1'],
  ],
  custom_words: [['id', 'word', 'pos', 'priority', 'meaning', 'nuance', 'example', 'collocations', 'root', 'createdAt', 'updatedAt']],
  settings: [
    ['key', 'value'],
    ['examMode', 'true'],
    ['_daily', '{"2026-11-04":{"r":16,"n":12}}'],
    ['_exLast', '{"tc19":"2026-11-04T12:48:49.244Z"}'],
  ],
};

function setup({ legacy = true } = {}) {
  const env = makeEnv();
  if (legacy) Object.entries(LEGACY).forEach(([name, rows]) => env.store.sheets.push(new Sheet(name, rows.map((r) => r.slice()))));
  loadServer(env);
  env.ctx.ADMIN_KEY_HASH = ADMIN_KEY_HASH;
  const call = (action, payload, token) => post(env, { action, payload, token });
  const cli = (action, payload) => post(env, { action: 'cli.' + action, adminKey: ADMIN_KEY, payload });
  return { env, call, cli, sheet: (n) => env.store.sheets.find((s) => s.name === n) };
}

function ready() {
  const t = setup();
  assert.equal(t.cli('migrate').ok, true);
  const acc = t.cli('createAccounts');
  t.pw = {};
  acc.data.created.forEach((c) => { t.pw[c.username] = c.password; });
  t.login = (u, p) => t.call('login', { username: u, password: p });
  t.loginReady = (u) => {
    const r = t.login(u, t.pw[u]);
    assert.equal(r.ok, true, JSON.stringify(r));
    const token = r.data.token;
    t.pw[u] = 'matkhau-' + u;
    assert.equal(t.call('setPassword', { password: t.pw[u] }, token).ok, true);
    return token;
  };
  return t;
}

const ev = (id, wordId, state, extra = {}) => Object.assign({ id, type: 'review', ts: state.updatedAt, day: '2026-11-04', wordId, mode: 'w2m', result: state.lastResult, device: 'test', state }, extra);

/* ---------------- Chuyển dữ liệu cũ ---------------- */

test('trước khi chuyển dữ liệu: API từ chối, không đụng vào Sheet', () => {
  const t = setup();
  const r = t.call('login', { username: 'user01', password: 'x' });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'not_ready');
  assert.deepEqual(t.sheet('progress').data, LEGACY.progress);
  assert.equal(t.sheet('users'), undefined);
});

test('lệnh cli cần đúng khóa quản trị', () => {
  const t = setup();
  const r = post(t.env, { action: 'cli.migrate', adminKey: 'sai' });
  assert.equal(r.error.code, 'forbidden');
  assert.equal(t.sheet('progress').data[0][0], 'wordId', 'chưa bị sửa');
});

test('migrate: chèn userId vào đầu, điền u01, giữ nguyên mọi cột và dòng cũ; chạy lại vô hại', () => {
  const t = setup();
  const r = t.cli('migrate');
  assert.equal(r.ok, true, JSON.stringify(r));
  const rep = r.data;
  assert.deepEqual(rep.insertedUserId.sort(), ['custom_words', 'log', 'progress', 'settings']);
  ['progress', 'log', 'custom_words', 'settings'].forEach((name) => {
    assert.equal(rep.before[name], rep.after[name], name);
    const data = t.sheet(name).data;
    assert.equal(data[0][0], 'userId');
    LEGACY[name].forEach((row, i) => {
      assert.deepEqual(data[i].slice(1, row.length + 1), row, `${name} dòng ${i + 1} giữ nguyên`);
      if (i > 0) assert.equal(data[i][0], 'u01');
    });
  });
  assert.deepEqual(rep.createdTabs.sort(), ['sessions', 'users']);
  assert.deepEqual(rep.addedColumns.custom_words, ['deletedAt']);
  const snapshot = JSON.stringify(t.env.store.sheets.map((s) => [s.name, s.data]));
  const again = t.cli('migrate').data;
  assert.deepEqual(again.insertedUserId, []);
  assert.equal(again.filled.progress, 0);
  assert.equal(JSON.stringify(t.env.store.sheets.map((s) => [s.name, s.data])), snapshot, 'chạy lần hai không đổi gì');
});

test('migrate: dòng mới thiếu userId (ghi sau khi chuyển) được điền u01, userId đã có không bị ghi đè', () => {
  const t = setup();
  t.cli('migrate');
  const p = t.sheet('progress').data;
  p.push(['u05', 'tout', '1', '2026-11-05', '0', '0', '1', 'good', '', '', '2026-11-04T13:00:00.000Z', '2026-11-04']);
  p.push(['', 'extol', '1', '2026-11-05', '0', '0', '1', 'good', '', '', '2026-11-04T13:00:00.000Z', '2026-11-04']);
  const r = t.cli('migrate').data;
  assert.equal(r.filled.progress, 1);
  assert.equal(p[p.length - 2][0], 'u05');
  assert.equal(p[p.length - 1][0], 'u01');
});

/* ---------------- Tài khoản ---------------- */

test('tạo 10 tài khoản: user01 admin đang dùng, còn lại bị khóa; mật khẩu ngẫu nhiên dễ đọc; chạy lại không tạo thêm', () => {
  const t = setup();
  t.cli('migrate');
  const r = t.cli('createAccounts').data;
  assert.equal(r.created.length, 10);
  assert.equal(new Set(r.created.map((c) => c.password)).size, 10);
  r.created.forEach((c) => assert.match(c.password, /^[a-hjkmnp-z2-9]{3}-[a-hjkmnp-z2-9]{3}-[a-hjkmnp-z2-9]{3}$/));
  const users = t.sheet('users').data;
  assert.deepEqual(users[0], ['userId', 'username', 'displayName', 'passwordHash', 'salt', 'role', 'active', 'mustChangePassword', 'createdAt', 'lastLoginAt']);
  assert.deepEqual(users.slice(1).map((u) => u[0]), ['u01', 'u02', 'u03', 'u04', 'u05', 'u06', 'u07', 'u08', 'u09', 'u10']);
  assert.deepEqual(users[1].slice(5, 8), ['admin', 'TRUE', 'TRUE']);
  assert.deepEqual(users[2].slice(5, 8), ['user', 'FALSE', 'TRUE']);
  const flat = JSON.stringify(t.env.store.sheets.map((s) => s.data));
  r.created.forEach((c) => assert.ok(!flat.includes(c.password), 'mật khẩu gốc không nằm trong Sheet'));
  assert.equal(t.cli('createAccounts').data.created.length, 0);
});

test('đăng nhập lần đầu bắt đặt mật khẩu mới; sau đó thấy đúng tiến độ cũ', () => {
  const t = ready();
  const r = t.login('USER01', t.pw.user01);
  assert.equal(r.ok, true);
  assert.equal(r.data.user.mustChangePassword, true);
  const token = r.data.token;
  assert.equal(t.call('getState', {}, token).error.code, 'must_change_password');
  assert.equal(t.call('setPassword', { password: '12345' }, token).error.code, 'bad_request', 'tối thiểu 6 ký tự');
  assert.equal(t.call('setPassword', { password: 'mat-khau-moi' }, token).ok, true);
  const st = t.call('getState', {}, token).data;
  assert.deepEqual(Object.keys(st.progress).sort(), ['eulogize', 'laud', 'lionize']);
  assert.equal(st.progress.lionize.lapses, 1);
  assert.deepEqual(st.progress.lionize.confusedWith, ['venerate']);
  assert.equal(st.progress.laud.lastMoved, '2026-11-04');
  assert.equal(st.settings.examMode, true);
  assert.deepEqual(st.daily, { '2026-11-04': { r: 16, n: 12 } });
  assert.equal(st.user.username, 'user01');
  assert.equal(st.user.role, 'admin');
  assert.equal(t.login('user01', t.pw.user01).ok, false, 'mật khẩu ban đầu hết hiệu lực');
  assert.equal(t.login('user01', 'mat-khau-moi').data.user.mustChangePassword, false);
});

test('tài khoản bị khóa không đăng nhập được; mở khóa thì được', () => {
  const t = ready();
  const r = t.login('user02', t.pw.user02);
  assert.equal(r.error.code, 'inactive');
  assert.equal(r.error.message, 'Tài khoản này chưa được kích hoạt. Liên hệ người quản lý.');
  const admin = t.loginReady('user01');
  assert.equal(t.call('adminSetActive', { userId: 'u02', active: true }, admin).ok, true);
  assert.equal(t.login('user02', t.pw.user02).ok, true);
});

test('sai mật khẩu 5 lần trong 15 phút: tạm khóa đăng nhập', () => {
  const t = ready();
  for (let k = 0; k < 4; k++) assert.equal(t.login('user01', 'sai').error.code, 'bad_login');
  assert.equal(t.login('user01', 'sai').error.code, 'locked_out');
  assert.equal(t.login('user01', t.pw.user01).error.code, 'locked_out', 'đúng mật khẩu cũng phải chờ');
  assert.equal(t.login('nobody', 'x').error.code, 'bad_login', 'không lộ tên đăng nhập có tồn tại hay không');
});

test('không có token hoặc token giả: bị từ chối', () => {
  const t = ready();
  assert.equal(t.call('getState', {}).error.code, 'unauthorized');
  assert.equal(t.call('getState', {}, 'gia-mao-'.repeat(8)).error.code, 'unauthorized');
  assert.equal(t.call('saveEvents', { events: [] }, 'x').error.code, 'unauthorized');
});

test('tiến độ của mỗi người tách riêng; userId trong payload bị bỏ qua', () => {
  const t = ready();
  const admin = t.loginReady('user01');
  t.call('adminSetActive', { userId: 'u02', active: true }, admin);
  const u2 = t.loginReady('user02');
  const before = JSON.stringify(t.call('getState', {}, admin).data.progress);
  const s = { wordId: 'laud', box: 2, dueDate: '2026-11-07', lapses: 0, correctStreak: 1, totalReviews: 1, lastResult: 'good', lastReviewed: '2026-11-04T14:00:00.000Z', confusedWith: [], updatedAt: '2026-11-04T14:00:00.000Z', lastMoved: '2026-11-04' };
  const r = post(t.env, { action: 'saveEvents', token: u2, userId: 'u01', payload: { userId: 'u01', events: [ev('e1', 'laud', s, { userId: 'u01' })] } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.states.laud.box, 2);
  assert.equal(JSON.stringify(t.call('getState', {}, admin).data.progress), before, 'tiến độ user01 không đổi');
  assert.equal(t.call('getState', {}, u2).data.progress.laud.box, 2);
  const prog = t.sheet('progress').data;
  assert.deepEqual(prog[prog.length - 1].slice(0, 3), ['u02', 'laud', '2']);
  const log = t.sheet('log').data;
  assert.equal(log[log.length - 1][0], 'u02');
  assert.equal(log[log.length - 1][log[0].indexOf('eventId')], 'e1');
});

test('gộp theo updatedAt: bản cũ hơn không ghi đè; sự kiện gửi lại bị bỏ qua', () => {
  const t = ready();
  const tok = t.loginReady('user01');
  const newer = { wordId: 'laud', box: 2, dueDate: '2026-11-08', lapses: 0, correctStreak: 1, totalReviews: 2, lastResult: 'good', updatedAt: '2026-11-05T01:00:00.000Z', lastMoved: '2026-11-05' };
  const older = Object.assign({}, newer, { box: 1, updatedAt: '2026-11-04T10:00:00.000Z' });
  assert.equal(t.call('saveEvents', { events: [ev('n1', 'laud', newer)] }, tok).data.states.laud.box, 2);
  assert.equal(t.call('saveEvents', { events: [ev('o1', 'laud', older)] }, tok).data.states.laud.box, 2);
  const logLen = t.sheet('log').data.length;
  const dup = t.call('saveEvents', { events: [ev('n1', 'laud', newer)] }, tok).data;
  assert.equal(dup.duplicate, 1);
  assert.equal(t.sheet('log').data.length, logLen);
  const rows = t.sheet('progress').data.filter((r) => r[0] === 'u01' && r[1] === 'laud');
  assert.equal(rows.length, 1, 'cập nhật tại chỗ, không thêm dòng trùng');
  assert.equal(rows[0][11], '2026-11-05', 'cột lastMoved của bản cũ vẫn được ghi');
});

test('đổi tên đăng nhập: tiến độ vẫn còn, đăng nhập bằng tên mới', () => {
  const t = ready();
  const admin = t.loginReady('user01');
  t.call('adminSetActive', { userId: 'u02', active: true }, admin);
  const u2 = t.loginReady('user02');
  const s = { wordId: 'tout', box: 1, dueDate: '2026-11-05', lastResult: 'hard', updatedAt: '2026-11-04T15:00:00.000Z' };
  t.call('saveEvents', { events: [ev('x1', 'tout', s)] }, u2);
  assert.equal(t.call('adminRenameUser', { userId: 'u02', username: 'user01' }, admin).error.code, 'conflict');
  assert.equal(t.call('adminRenameUser', { userId: 'u02', username: 'Bad Name' }, admin).error.code, 'bad_request');
  assert.equal(t.call('adminRenameUser', { userId: 'u02', username: 'lan.anh' }, admin).ok, true);
  assert.equal(t.login('user02', t.pw.user02).ok, false);
  const r = t.login('Lan.Anh', t.pw.user02);
  assert.equal(r.ok, true);
  assert.equal(t.call('getState', {}, r.data.token).data.progress.tout.box, 1);
  // tự đổi tên hiển thị và tên đăng nhập
  assert.equal(t.call('updateProfile', { displayName: 'Lan Anh', username: 'lananh' }, r.data.token).data.user.displayName, 'Lan Anh');
  assert.equal(t.login('lananh', t.pw.user02).ok, true);
});

test('đặt lại mật khẩu: mật khẩu tạm hiện một lần, xóa phiên cũ, bắt đổi lần sau', () => {
  const t = ready();
  const admin = t.loginReady('user01');
  t.call('adminSetActive', { userId: 'u02', active: true }, admin);
  const u2 = t.loginReady('user02');
  const r = t.call('adminResetPassword', { userId: 'u02' }, admin).data;
  assert.match(r.password, /^\w{3}-\w{3}-\w{3}$/);
  assert.equal(t.call('getState', {}, u2).error.code, 'unauthorized', 'phiên cũ bị xóa');
  const l = t.login('user02', r.password);
  assert.equal(l.data.user.mustChangePassword, true);
  assert.equal(t.call('adminListUsers', {}, l.data.token).error.code, 'must_change_password');
});

test('admin không tự khóa, không tự đặt lại mật khẩu; người thường không gọi được action quản trị', () => {
  const t = ready();
  const admin = t.loginReady('user01');
  assert.equal(t.call('adminSetActive', { userId: 'u01', active: false }, admin).error.code, 'forbidden');
  assert.equal(t.call('adminResetPassword', { userId: 'u01' }, admin).error.code, 'forbidden');
  t.call('adminSetActive', { userId: 'u02', active: true }, admin);
  const u2 = t.loginReady('user02');
  assert.equal(t.call('adminListUsers', {}, u2).error.code, 'forbidden');
  assert.equal(t.call('adminSetActive', { userId: 'u03', active: true }, u2).error.code, 'forbidden');
});

test('khóa tài khoản đang đăng nhập: phiên bị chặn ngay', () => {
  const t = ready();
  const admin = t.loginReady('user01');
  t.call('adminSetActive', { userId: 'u02', active: true }, admin);
  const u2 = t.loginReady('user02');
  t.call('adminSetActive', { userId: 'u02', active: false }, admin);
  assert.ok(['inactive', 'unauthorized'].includes(t.call('getState', {}, u2).error.code));
});

test('trang Quản lý: số từ đã học, đến hạn, hay quên', () => {
  const t = ready();
  const admin = t.loginReady('user01');
  const list = t.call('adminListUsers', {}, admin).data.users;
  assert.equal(list.length, 10);
  const me = list.find((u) => u.userId === 'u01');
  assert.equal(me.learned, 3);
  assert.equal(me.leech, 0, 'lionize: lapses 1 nhưng lần cuối đúng; eulogize: sai nhưng lapses 0 (lần gặp đầu)');
  assert.ok(me.due >= 1, 'eulogize đến hạn từ 2026-11-04');
  assert.ok(!('passwordHash' in me) && !('salt' in me));
});

test('từ tự thêm: thêm, sửa, xóa (đánh dấu, không xóa dòng); cài đặt theo từng người', () => {
  const t = ready();
  const tok = t.loginReady('user01');
  const w = { id: 'c-abc123', word: 'panache', pos: 'n', priority: 2, meaning: 'phong thái tự tin', collocations: ['with panache'] };
  t.call('saveEvents', { events: [{ id: 'cw1', type: 'custom_upsert', ts: '2026-11-04T15:00:00.000Z', word: Object.assign({ updatedAt: '2026-11-04T15:00:00.000Z' }, w) }] }, tok);
  assert.equal(t.call('getState', {}, tok).data.customWords[0].word, 'panache');
  t.call('saveEvents', { events: [{ id: 'cd1', type: 'custom_delete', ts: '2026-11-04T15:01:00.000Z', wordId: 'c-abc123' }] }, tok);
  assert.equal(t.call('getState', {}, tok).data.customWords.length, 0);
  assert.equal(t.sheet('custom_words').data.length, 2, 'dòng vẫn còn, chỉ đánh dấu deletedAt');
  t.call('saveSettings', { settings: { newPerDay: 15, hacker: 'x' } }, tok);
  const st = t.call('getState', {}, tok).data.settings;
  assert.equal(st.newPerDay, 15);
  assert.equal(st.examMode, true);
  assert.ok(!('hacker' in st));
});

test('đăng xuất xóa phiên hiện tại', () => {
  const t = ready();
  const tok = t.loginReady('user01');
  assert.equal(t.call('logout', {}, tok).ok, true);
  assert.equal(t.call('getState', {}, tok).error.code, 'unauthorized');
});

test('doGet chỉ trả trạng thái sống', () => {
  const t = setup();
  assert.deepEqual(JSON.parse(t.env.ctx.doGet().getContent()), { ok: true, service: 'gre-verbal-api' });
});

/* ---------------- Cập nhật 02: Thi thử ---------------- */

function mockPayload(id, mode, sections) {
  return { mockId: id, mode, startedAt: Date.now() - 600000, finishedAt: Date.now(), sections };
}

test('thi thử: tab mocks tạo bằng cli.ensureMocks (chạy lại vô hại); không đụng tab cũ', () => {
  const t = ready();
  const before = t.env.store.sheets.map((s) => s.name + ':' + s.getLastRow()).join(',');
  const r = t.cli('ensureMocks');
  assert.equal(r.ok, true);
  const again = t.cli('ensureMocks');
  assert.equal(again.data.created, false);
  const after = t.env.store.sheets.filter((s) => s.name !== 'mocks').map((s) => s.name + ':' + s.getLastRow()).join(',');
  assert.equal(after, before.split(',').filter((x) => !x.startsWith('mocks:')).join(','));
  assert.deepEqual(t.sheet('mocks').data[0], ['userId', 'mockId', 'startedAt', 'finishedAt', 'mode', 'section', 'score', 'total', 'durationSec', 'items']);
});

test('thi thử: saveMock ghi mỗi section một dòng, không ghi trùng; getMocks chỉ trả bài của chính mình', () => {
  const t = ready();
  t.cli('ensureMocks');
  const a = t.loginReady('user01');
  t.cli('setUser', { userId: 'u02', active: true });
  const b = t.loginReady('user02');
  const items = [{ i: 'tc01', c: 'laud', ok: 1, t: 40 }, { i: 'se01', c: 'a|b', ok: 0, t: 70 }];
  const p = mockPayload('mock-abc123', 'full', [
    { section: 1, score: 9, total: 12, durationSec: 900, items },
    { section: 2, score: 10, total: 15, durationSec: 1300, items }
  ]);
  p.userId = 'u02';
  const r = t.call('saveMock', p, a);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.saved, 2);
  assert.equal(t.call('saveMock', p, a).data.saved, 0, 'gửi lại không ghi trùng');
  const rows = t.sheet('mocks').data.slice(1).filter((x) => x.some(Boolean));
  assert.equal(rows.length, 2);
  assert.ok(rows.every((x) => x[0] === 'u01'), 'userId lấy từ phiên, không từ payload');
  assert.match(rows[0][2], /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/);
  const mine = t.call('getMocks', {}, a).data.mocks;
  assert.equal(mine.length, 1);
  assert.equal(mine[0].sections.length, 2);
  assert.equal(mine[0].sections[0].score, 9);
  assert.deepEqual(mine[0].sections[1].items[1], { i: 'se01', c: 'a|b', ok: 0, t: 70 });
  assert.deepEqual(t.call('getMocks', {}, b).data.mocks, [], 'user02 không thấy bài của user01');
  assert.equal(t.call('saveMock', mockPayload('x', 's1', []), a).ok, false);
  assert.equal(t.call('saveMock', mockPayload('mock-abcdef', 'zz', [{ section: 1 }]), a).ok, false);
  assert.equal(t.call('getMocks', {}).error.code, 'unauthorized');
});

test('thi thử: chưa có tab mocks thì getMocks trả rỗng, saveMock báo chưa sẵn sàng', () => {
  const t = ready();
  const a = t.loginReady('user01');
  assert.deepEqual(t.call('getMocks', {}, a).data.mocks, []);
  const r = t.call('saveMock', mockPayload('mock-abc123', 's1', [{ section: 1, score: 1, total: 12, durationSec: 60, items: [] }]), a);
  assert.equal(r.error.code, 'not_ready');
});

test('kết quả gần nhất của từng bài GRE (_exRes) được lưu và trả về trong getState', () => {
  const t = ready();
  const a = t.loginReady('user01');
  const ts = new Date().toISOString();
  const day = t.call('getState', {}, a).data.today;
  const ev = (id, ex, result) => ({ id, type: 'review', ts, day, wordId: 'laud', mode: 'gre', result, exerciseId: ex, state: null });
  assert.equal(t.call('saveEvents', { events: [ev('r1', 'tc01', 'good'), ev('r2', 'se01', 'again'), ev('r3', 'tc02', 'seen'), ev('r4', 'scale:x', 'good')] }, a).ok, true);
  const st = t.call('getState', {}, a).data;
  assert.deepEqual(st.exRes, { tc01: [day, 1], se01: [day, 0] });
  assert.ok(!('_exRes' in st.settings));
});

test('đề cố định (mode fixed): mockId là id đề; làm lại lưu thành lần mới; gửi lại cùng lần không ghi trùng; getMocks tách từng lần', () => {
  const t = ready();
  t.cli('ensureMocks');
  const a = t.loginReady('user01');
  const secs = (sc) => [{ section: 1, score: sc, total: 12, durationSec: 900, items: [{ i: 'wc101', c: 'x', ok: 1, t: 30 }] }, { section: 2, score: 5, total: 15, durationSec: 1200, items: [] }];
  const t1 = Math.floor((Date.now() - 3 * 3600e3) / 1000) * 1000, t2 = Math.floor((Date.now() - 3600e3) / 1000) * 1000;
  const p1 = { mockId: 'mock-01', mode: 'fixed', startedAt: t1, finishedAt: t1 + 2400e3, sections: secs(7) };
  const p2 = { mockId: 'mock-01', mode: 'fixed', startedAt: t2, finishedAt: t2 + 2400e3, sections: secs(10) };
  assert.equal(t.call('saveMock', p1, a).data.saved, 2);
  assert.equal(t.call('saveMock', p1, a).data.saved, 0, 'gửi lại cùng lần làm: bỏ qua');
  assert.equal(t.call('saveMock', p2, a).data.saved, 2, 'làm lại: lưu thành lần mới');
  const rows = t.sheet('mocks').data.slice(1).filter((x) => x.some(Boolean));
  assert.equal(rows.length, 4);
  assert.ok(rows.every((x) => x[1] === 'mock-01' && x[4] === 'fixed'));
  const ms = t.call('getMocks', {}, a).data.mocks;
  assert.equal(ms.length, 2);
  assert.deepEqual(ms.map((m) => m.sections[0].score), [10, 7], 'mới nhất trước, mỗi lần làm một mục');
  assert.deepEqual(ms.map((m) => m.startedMs), [t2, t1], 'startedMs khớp mốc giờ client gửi (đã làm tròn giây)');
  // giới hạn chỉ áp dụng cho đề ngẫu nhiên: lần làm đề cố định luôn được trả về
  for (let k = 0; k < 3; k++) t.call('saveMock', mockPayload('mock-rand' + k, 's1', [{ section: 1, score: 1, total: 12, durationSec: 60, items: [] }]), a);
  const lim = t.call('getMocks', { limit: 1 }, a).data.mocks;
  assert.equal(lim.filter((m) => m.mode === 'fixed').length, 2);
  assert.equal(lim.filter((m) => m.mode !== 'fixed').length, 1);
});

test('cài đặt skipVocabIntro được lưu (khóa cài đặt mới)', () => {
  const t = ready();
  const a = t.loginReady('user01');
  const ev = { id: 'set-1', type: 'setting', ts: new Date().toISOString(), key: 'skipVocabIntro', value: true };
  assert.equal(t.call('saveEvents', { events: [ev] }, a).ok, true);
  assert.equal(t.call('getState', {}, a).data.settings.skipVocabIntro, true);
});
