#!/usr/bin/env node
/**
 * e2e-api.js: kiểm thử đầu cuối trên API THẬT bằng hai tài khoản thử user09 (người thường) và user10 (tạm làm quản lý).
 *
 * AN TOÀN DỮ LIỆU (bạn bè đang dùng web):
 *  - Trước khi chạy, kiểm tra user09/user10 đang KHÓA và KHÔNG có dòng dữ liệu nào. Không thỏa thì DỪNG, không làm gì.
 *  - Không bao giờ đụng u01 hay tài khoản đang có người dùng.
 *  - Không tạo bản sửa nội dung thật (override) trên API thật: phần sửa nội dung chỉ thử quyền và kiểm tra hợp lệ
 *    (bị từ chối nên không ghi gì). Luồng chấp nhận / khôi phục được test đầy đủ trong tests/content-api.test.js.
 *  - Cuối cùng tự dọn: xóa dữ liệu thử của u09/u10 (server từ chối nếu có tiến độ cũ hơn lúc bắt đầu), đưa hai tài khoản
 *    về trạng thái ban đầu (khóa, tên gốc, mật khẩu ban đầu mới) và cập nhật initial-passwords.txt.
 *   node scripts/e2e-api.js
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { post, cli } from './admin-cli.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PW_FILE = path.join(ROOT, 'initial-passwords.txt');
const TEST = [['u09', 'user09'], ['u10', 'user10']];

const call = (action, payload, token) => post({ action, token, payload: payload || {} });
const ok = async (p) => { const r = await p; assert.equal(r.ok, true, JSON.stringify(r)); return r.data; };
const errCode = async (p) => { const r = await p; assert.equal(r.ok, false, JSON.stringify(r)); return r.error.code; };
let n = 0;
const step = (msg) => console.log(`✓ ${++n}. ${msg}`);
const T0 = Date.now();
const praise = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/clusters/praise-criticism.json'), 'utf8'));

/** Dừng ngay nếu tài khoản thử đang có người dùng. */
async function preflight() {
  for (const [userId] of TEST) {
    const info = await cli('userInfo', { userId });
    const used = Object.entries(info.rows).filter(([, k]) => k > 0);
    if (info.active || used.length) {
      throw new Error(`Tài khoản ${info.username} (${userId}) đang mở hoặc đã có dữ liệu (${used.map(([t, k]) => t + ': ' + k).join(', ') || 'đang mở'}). ` +
        'KHÔNG chạy kiểm thử để tránh làm mất tiến độ. Chọn tài khoản thử khác trong scripts/e2e-api.js.');
    }
  }
}

const rowsOf = async (tab, uid) => {
  const v = (await cli('dump', { tab })).values;
  const c = v[0].indexOf('userId');
  return v.slice(1).filter((x) => x[c] === uid).length;
};

async function run() {
  const u01Before = { progress: await rowsOf('progress', 'u01'), log: await rowsOf('log', 'u01') };

  assert.equal(await errCode(call('getState', {})), 'unauthorized');
  assert.equal(await errCode(call('getState', {}, 'token-gia-' + 'x'.repeat(40))), 'unauthorized');
  assert.equal(await errCode(call('saveEvents', { events: [] }, 'abc')), 'unauthorized');
  step('Không có token hoặc token giả: bị từ chối');

  const tmpA = (await cli('setUser', { userId: 'u10', resetPassword: true })).password;
  assert.equal(await errCode(call('login', { username: 'user10', password: tmpA })), 'inactive');
  step('user10 đang khóa: không đăng nhập được');

  await cli('setUser', { userId: 'u10', active: true, role: 'admin' }); // tạm cho quyền quản lý để thử các action admin
  let r = await ok(call('login', { username: 'USER10', password: tmpA }));
  assert.equal(r.user.mustChangePassword, true);
  assert.equal(await errCode(call('getState', {}, r.token)), 'must_change_password');
  await ok(call('setPassword', { password: 'e2e-mat-khau' }, r.token));
  const a = r.token;
  const st = await ok(call('getState', {}, a));
  assert.deepEqual(st.progress, {});
  assert.ok(Array.isArray(st.content.overrides) && Array.isArray(st.content.corrected), 'getState trả về bản sửa nội dung');
  step('Mở khóa: đăng nhập được; lần đầu bắt đặt mật khẩu mới; tiến độ riêng đang trống; getState có phần nội dung sửa');

  const now = new Date().toISOString();
  const s = { wordId: 'laud', box: 1, dueDate: '2026-11-06', lapses: 0, correctStreak: 1, totalReviews: 1, lastResult: 'good', lastReviewed: now, confusedWith: [], updatedAt: now, lastMoved: '2026-11-05' };
  const sv = await ok(post({ action: 'saveEvents', token: a, userId: 'u01', payload: { userId: 'u01', events: [
    { id: 'e2e-' + T0 + '-1', type: 'review', ts: now, day: '2026-11-05', wordId: 'laud', mode: 'w2m', result: 'good', device: 'e2e', isNew: true, state: s, userId: 'u01' },
    { id: 'e2e-' + T0 + '-2', type: 'setting', ts: now, key: 'newPerDay', value: 7 }
  ] } }));
  assert.equal(sv.saved, 2);
  assert.equal(sv.states.laud.box, 1);
  assert.equal(await rowsOf('progress', 'u01'), u01Before.progress, 'tiến độ u01 không đổi');
  assert.equal(await rowsOf('log', 'u01'), u01Before.log, 'log u01 không đổi');
  assert.equal(await rowsOf('progress', 'u10'), 1);
  step('Ôn một thẻ: Sheet có dòng mới với userId u10; userId u01 trong payload bị bỏ qua, dữ liệu u01 giữ nguyên');

  const again = await ok(call('saveEvents', { events: [{ id: 'e2e-' + T0 + '-1', type: 'review', ts: now, wordId: 'laud', state: s }] }, a));
  assert.equal(again.duplicate, 1);
  step('Gửi lại cùng sự kiện (mất mạng rồi thử lại): không ghi trùng');

  const b = (await ok(call('login', { username: 'user10', password: 'e2e-mat-khau' }))).token;
  const st2 = await ok(call('getState', {}, b));
  assert.equal(st2.progress.laud.box, 1);
  assert.equal(st2.settings.newPerDay, 7);
  step('Đăng nhập trên "thiết bị khác" cùng tài khoản: tiến độ và cài đặt khớp');

  const list = (await ok(call('adminListUsers', {}, a))).users;
  assert.equal(list.length, 10);
  assert.ok(!('passwordHash' in list[0]));
  const tmpB = (await cli('setUser', { userId: 'u09', resetPassword: true })).password;
  await ok(call('adminSetActive', { userId: 'u09', active: true }, a));
  const c = (await ok(call('login', { username: 'user09', password: tmpB }))).token;
  assert.equal(await errCode(call('adminListUsers', {}, c)), 'must_change_password');
  await ok(call('setPassword', { password: 'e2e-user09' }, c));
  assert.equal(await errCode(call('adminListUsers', {}, c)), 'forbidden');
  step('Trang Quản lý: 10 tài khoản; mở khóa user09 thì đăng nhập được; người thường bị chặn action quản trị');

  const u01name = (await cli('userInfo', { userId: 'u01' })).username; // tên đăng nhập thật của u01 (có thể đã đổi)
  assert.equal(await errCode(call('adminRenameUser', { userId: 'u09', username: u01name }, a)), 'conflict');
  await ok(call('adminRenameUser', { userId: 'u09', username: 'e2e.ban' }, a));
  assert.equal(await errCode(call('login', { username: 'user09', password: 'e2e-user09' })), 'bad_login');
  const c2 = (await ok(call('login', { username: 'e2e.ban', password: 'e2e-user09' }))).token;
  await ok(call('getState', {}, c2));
  step('Đổi tên đăng nhập: tên cũ hết dùng, tên mới đăng nhập được');

  const mockId = 'e2e-mock-' + T0;
  const mk = { mockId, mode: 's1', startedAt: Date.now() - 900000, finishedAt: Date.now(), userId: 'u01',
    sections: [{ section: 1, score: 9, total: 12, durationSec: 880, items: [{ i: 'tc01', c: 'laud', ok: 1, t: 50 }] }] };
  assert.equal((await ok(call('saveMock', mk, a))).saved, 1);
  assert.equal((await ok(call('saveMock', mk, a))).saved, 0);
  assert.equal((await ok(call('getMocks', {}, a))).mocks.length, 1);
  assert.deepEqual((await ok(call('getMocks', {}, c2))).mocks, [], 'user09 không thấy bài thi thử của user10');
  assert.equal(await rowsOf('mocks', 'u10'), 1, 'userId lấy từ phiên, không từ payload');
  step('Thi thử: saveMock ghi một dòng (gửi lại không trùng), getMocks chỉ trả bài của chính mình');

  // Đề cố định (đợt bài tập 01): mockId là id đề, mode fixed; làm lại là lần mới; gửi lại cùng lần thì bỏ qua
  const fx = (t0, sc) => ({ mockId: 'mock-01', mode: 'fixed', startedAt: t0, finishedAt: t0 + 60000,
    sections: [{ section: 1, score: sc, total: 12, durationSec: 60, items: [{ i: 'wc101', c: 'x', ok: 1, t: 5 }] }] });
  const f1 = Math.floor((Date.now() - 1800000) / 1000) * 1000, f2 = f1 + 600000;
  assert.equal((await ok(call('saveMock', fx(f1, 3), a))).saved, 1);
  assert.equal((await ok(call('saveMock', fx(f1, 3), a))).saved, 0);
  assert.equal((await ok(call('saveMock', fx(f2, 8), a))).saved, 1);
  const fms = (await ok(call('getMocks', {}, a))).mocks.filter((m) => m.mode === 'fixed');
  assert.deepEqual(fms.map((m) => [m.mockId, m.startedMs, m.sections[0].score]), [['mock-01', f2, 8], ['mock-01', f1, 3]]);
  assert.equal(await rowsOf('mocks', 'u10'), 3);
  step('Đề cố định: lưu mode fixed, mockId mock-01; làm lại là lần mới; gửi lại không trùng; getMocks tách từng lần');
  await ok(call('saveEvents', { events: [{ id: 'e2e-set-' + T0, type: 'setting', ts: new Date().toISOString(), key: 'skipVocabIntro', value: true }] }, a));
  assert.equal((await ok(call('getState', {}, a))).settings.skipVocabIntro, true);
  step('Cài đặt skipVocabIntro (Không hiện lại màn Từ vựng cần biết) được lưu');

  // Sửa nội dung: chỉ thử quyền và kiểm tra hợp lệ (không tạo bản sửa thật)
  const ovBefore = (await cli('dump', { tab: 'content_overrides' })).values.length;
  const hiBefore = (await cli('dump', { tab: 'content_history' })).values.length;
  const se = praise.exercises.find((e) => e.type === 'se');
  const laud = praise.words.find((w) => w.id === 'laud');
  assert.equal(await errCode(call('adminSaveOverride', { targetType: 'word', targetId: 'laud', changes: { nuance: 'x' }, base: laud }, c2)), 'forbidden');
  const bad = await call('adminSaveOverride', { targetType: 'exercise', targetId: se.id, changes: { answers: [se.answers[0]] }, base: se }, a);
  assert.equal(bad.ok, false);
  assert.match(bad.error.message, /Câu SE phải có đúng 6 phương án và đúng 2 đáp án/);
  assert.equal((await cli('dump', { tab: 'content_overrides' })).values.length, ovBefore);
  assert.equal((await cli('dump', { tab: 'content_history' })).values.length, hiBefore);
  step('Sửa nội dung: người thường gọi adminSaveOverride bị từ chối; sửa câu SE còn 1 đáp án bị chặn với lỗi rõ ràng; không ghi gì');

  const sug = { targetType: 'word', targetId: 'laud', field: 'meaning', currentValue: laud.meaning, proposedValue: laud.meaning + ' (thử)', reason: 'Kiểm thử tự động, sẽ được xóa.' };
  assert.equal(await errCode(call('submitSuggestion', sug, c2)), 'invalid');
  const sid = (await ok(call('submitSuggestion', Object.assign({ sourceUrl: 'https://www.merriam-webster.com/dictionary/laud' }, sug), c2))).suggestionId;
  assert.equal((await ok(call('listMySuggestions', {}, c2))).suggestions[0].status, 'pending');
  assert.ok((await ok(call('adminListSuggestions', {}, a))).suggestions.some((x) => x.suggestionId === sid));
  await ok(call('adminReviewSuggestion', { suggestionId: sid, decision: 'reject', note: 'Kiểm thử tự động' }, a));
  const mine = (await ok(call('listMySuggestions', {}, c2))).suggestions[0];
  assert.equal(mine.status, 'rejected');
  assert.equal(mine.reviewerNote, 'Kiểm thử tự động');
  step('Đề xuất: sửa nghĩa không có nguồn bị chặn; có nguồn thì gửi được; quản lý thấy trong hàng chờ; từ chối kèm lý do thì người đề xuất thấy lý do');

  const reset = await ok(call('adminResetPassword', { userId: 'u09' }, a));
  assert.match(reset.password, /^\w{3}-\w{3}-\w{3}$/);
  assert.equal(await errCode(call('getState', {}, c2)), 'unauthorized');
  const c3 = await ok(call('login', { username: 'e2e.ban', password: reset.password }));
  assert.equal(c3.user.mustChangePassword, true);
  step('Đặt lại mật khẩu: mật khẩu tạm dùng được, phiên cũ bị xóa, bắt đổi mật khẩu');

  assert.equal(await errCode(call('adminSetActive', { userId: 'u10', active: false }, a)), 'forbidden');
  await ok(call('adminSetActive', { userId: 'u09', active: false }, a));
  assert.ok(['inactive', 'unauthorized'].includes(await errCode(call('me', {}, c3.token))));
  step('Không tự khóa được chính mình; khóa user09 thì phiên của user09 bị chặn ngay');

  for (let k = 0; k < 4; k++) assert.equal(await errCode(call('login', { username: 'e2e-khong-co', password: 'sai' })), 'bad_login');
  assert.equal(await errCode(call('login', { username: 'e2e-khong-co', password: 'sai' })), 'locked_out');
  step('Sai mật khẩu 5 lần: tạm khóa đăng nhập 15 phút');

  await ok(call('logout', {}, b));
  assert.equal(await errCode(call('getState', {}, b)), 'unauthorized');
  step('Đăng xuất xóa phiên hiện tại');
}

async function cleanup() {
  const out = {};
  for (const [userId, username] of TEST) {
    await cli('purgeTestUser', { userId, since: T0 });
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
  console.log('✓ Đã dọn dữ liệu thử của user09, user10; hai tài khoản về lại trạng thái khóa, mật khẩu ban đầu mới đã ghi vào initial-passwords.txt');
}

try {
  await preflight();
} catch (e) {
  console.error('\n✗ ' + e.message);
  process.exit(1);
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
