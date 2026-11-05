#!/usr/bin/env node
/**
 * e2e-api.js: kiểm thử đầu cuối trên API THẬT bằng hai tài khoản thử user02, user03 (không bao giờ đụng u01).
 * Cuối cùng tự dọn: xóa dữ liệu thử của u02/u03, đưa hai tài khoản về trạng thái ban đầu (khóa, tên gốc,
 * mật khẩu ban đầu mới) và cập nhật initial-passwords.txt.
 *   node scripts/e2e-api.js
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { post, cli } from './admin-cli.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PW_FILE = path.join(ROOT, 'initial-passwords.txt');

const call = (action, payload, token) => post({ action, token, payload: payload || {} });
const ok = async (p) => { const r = await p; assert.equal(r.ok, true, JSON.stringify(r)); return r.data; };
const errCode = async (p) => { const r = await p; assert.equal(r.ok, false, JSON.stringify(r)); return r.error.code; };
let n = 0;
const step = (msg) => console.log(`✓ ${++n}. ${msg}`);

async function run() {
  const t0 = Date.now();
  assert.equal(await errCode(call('getState', {})), 'unauthorized');
  assert.equal(await errCode(call('getState', {}, 'token-gia-' + 'x'.repeat(40))), 'unauthorized');
  assert.equal(await errCode(call('saveEvents', { events: [] }, 'abc')), 'unauthorized');
  step('Không có token hoặc token giả: bị từ chối');

  const tmp2 = (await cli('setUser', { userId: 'u02', resetPassword: true })).password;
  assert.equal(await errCode(call('login', { username: 'user02', password: tmp2 })), 'inactive');
  step('user02 đang khóa: không đăng nhập được');

  await cli('setUser', { userId: 'u02', active: true, role: 'admin' }); // tạm cho quyền quản lý để thử các action admin
  let r = await ok(call('login', { username: 'USER02', password: tmp2 }));
  assert.equal(r.user.mustChangePassword, true);
  assert.equal(await errCode(call('getState', {}, r.token)), 'must_change_password');
  await ok(call('setPassword', { password: 'e2e-mat-khau' }, r.token));
  const a = r.token;
  const st = await ok(call('getState', {}, a));
  assert.deepEqual(st.progress, {});
  step('Mở khóa: đăng nhập được; lần đầu bắt đặt mật khẩu mới; tiến độ riêng đang trống');

  const now = new Date().toISOString();
  const s = { wordId: 'laud', box: 1, dueDate: '2026-11-06', lapses: 0, correctStreak: 1, totalReviews: 1, lastResult: 'good', lastReviewed: now, confusedWith: [], updatedAt: now, lastMoved: '2026-11-05' };
  const sv = await ok(post({ action: 'saveEvents', token: a, userId: 'u01', payload: { userId: 'u01', events: [
    { id: 'e2e-' + t0 + '-1', type: 'review', ts: now, day: '2026-11-05', wordId: 'laud', mode: 'w2m', result: 'good', device: 'e2e', isNew: true, state: s, userId: 'u01' },
    { id: 'e2e-' + t0 + '-2', type: 'setting', ts: now, key: 'newPerDay', value: 7 }
  ] } }));
  assert.equal(sv.saved, 2);
  assert.equal(sv.states.laud.box, 1);
  const dump = (await cli('dump', { tab: 'progress' })).values;
  const uid = dump[0].indexOf('userId');
  assert.equal(dump.slice(1).filter((x) => x[uid] === 'u01').length, 12, 'tiến độ u01 vẫn đủ 12 dòng');
  assert.equal(dump.slice(1).filter((x) => x[uid] === 'u02').length, 1);
  const logv = (await cli('dump', { tab: 'log' })).values;
  assert.equal(logv[logv.length - 1][logv[0].indexOf('userId')], 'u02');
  step('Ôn một thẻ: Sheet có dòng mới trong progress và log với userId u02; userId u01 trong payload bị bỏ qua');

  const again = await ok(call('saveEvents', { events: [{ id: 'e2e-' + t0 + '-1', type: 'review', ts: now, wordId: 'laud', state: s }] }, a));
  assert.equal(again.duplicate, 1);
  step('Gửi lại cùng sự kiện (mất mạng rồi thử lại): không ghi trùng');

  const b = (await ok(call('login', { username: 'user02', password: 'e2e-mat-khau' }))).token;
  const st2 = await ok(call('getState', {}, b));
  assert.equal(st2.progress.laud.box, 1);
  assert.equal(st2.settings.newPerDay, 7);
  step('Đăng nhập trên "thiết bị khác" cùng tài khoản: tiến độ và cài đặt khớp');

  const list = (await ok(call('adminListUsers', {}, a))).users;
  assert.equal(list.length, 10);
  const u1 = list.find((u) => u.userId === 'u01');
  assert.equal(u1.learned, 12);
  assert.ok(!('passwordHash' in u1));
  const tmp3 = (await cli('setUser', { userId: 'u03', resetPassword: true })).password;
  await ok(call('adminSetActive', { userId: 'u03', active: true }, a));
  const c = (await ok(call('login', { username: 'user03', password: tmp3 }))).token;
  assert.equal(await errCode(call('adminListUsers', {}, c)), 'must_change_password');
  await ok(call('setPassword', { password: 'e2e-user03' }, c));
  assert.equal(await errCode(call('adminListUsers', {}, c)), 'forbidden');
  step('Trang Quản lý: 10 tài khoản, u01 có 12 từ đã học; mở khóa user03 thì đăng nhập được; người thường bị chặn action quản trị');

  assert.equal(await errCode(call('adminRenameUser', { userId: 'u03', username: 'user01' }, a)), 'conflict');
  await ok(call('adminRenameUser', { userId: 'u03', username: 'e2e.ban' }, a));
  assert.equal(await errCode(call('login', { username: 'user03', password: 'e2e-user03' })), 'bad_login');
  const c2 = (await ok(call('login', { username: 'e2e.ban', password: 'e2e-user03' }))).token;
  await ok(call('getState', {}, c2));
  step('Đổi tên đăng nhập: tên cũ hết dùng, tên mới đăng nhập được');

  const reset = await ok(call('adminResetPassword', { userId: 'u03' }, a));
  assert.match(reset.password, /^\w{3}-\w{3}-\w{3}$/);
  assert.equal(await errCode(call('getState', {}, c2)), 'unauthorized');
  const c3 = await ok(call('login', { username: 'e2e.ban', password: reset.password }));
  assert.equal(c3.user.mustChangePassword, true);
  step('Đặt lại mật khẩu: mật khẩu tạm dùng được, phiên cũ bị xóa, bắt đổi mật khẩu');

  assert.equal(await errCode(call('adminSetActive', { userId: 'u02', active: false }, a)), 'forbidden');
  await ok(call('adminSetActive', { userId: 'u03', active: false }, a));
  assert.ok(['inactive', 'unauthorized'].includes(await errCode(call('me', {}, c3.token))));
  step('Không tự khóa được chính mình; khóa user03 thì phiên của user03 bị chặn ngay');

  for (let k = 0; k < 4; k++) assert.equal(await errCode(call('login', { username: 'e2e-khong-co', password: 'sai' })), 'bad_login');
  assert.equal(await errCode(call('login', { username: 'e2e-khong-co', password: 'sai' })), 'locked_out');
  step('Sai mật khẩu 5 lần: tạm khóa đăng nhập 15 phút');

  await ok(call('logout', {}, b));
  assert.equal(await errCode(call('getState', {}, b)), 'unauthorized');
  step('Đăng xuất xóa phiên hiện tại');
}

async function cleanup() {
  const out = {};
  for (const [userId, username] of [['u02', 'user02'], ['u03', 'user03']]) {
    await cli('purgeTestUser', { userId });
    const r = await cli('setUser', { userId, active: false, role: 'user', username, displayName: username, resetPassword: true });
    out[username] = r.password;
  }
  if (fs.existsSync(PW_FILE)) {
    const text = fs.readFileSync(PW_FILE, 'utf8').split('\n').map((line) => {
      const name = line.split('\t')[0];
      return out[name] ? `${name}\t${out[name]}\t${line.split('\t')[2]}` : line;
    }).join('\n');
    fs.writeFileSync(PW_FILE, text);
  }
  console.log('✓ Đã dọn dữ liệu thử của user02, user03; hai tài khoản về lại trạng thái khóa, mật khẩu ban đầu mới đã ghi vào initial-passwords.txt');
}

try {
  await run();
  console.log('\nTất cả kiểm thử trên API thật đều qua.');
} catch (e) {
  console.error('\n✗ KIỂM THỬ THẤT BẠI: ' + (e.stack || e.message));
  process.exitCode = 1;
} finally {
  await cleanup();
}
