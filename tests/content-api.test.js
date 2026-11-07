// Test phía server cho sửa nội dung trực tiếp và đề xuất sửa (apps-script/Content.js) trong giả lập Apps Script.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { makeEnv, loadServer, post, Sheet } = require('./gas_mock.cjs');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/clusters/praise-criticism.json'), 'utf8'));
const baseWord = (id) => JSON.parse(JSON.stringify(pc.words.find((w) => w.id === id)));
const baseEx = (id) => JSON.parse(JSON.stringify(pc.exercises.find((e) => e.id === id)));
const SE = pc.exercises.find((e) => e.type === 'se').id;

const ADMIN_KEY = 'test-admin-key-0123456789';
const OLD = {
  progress: [['wordId', 'box', 'dueDate', 'lapses', 'correctStreak', 'totalReviews', 'lastResult', 'lastReviewed', 'confusedWith', 'updatedAt', 'lastMoved'],
    ['laud', '1', '2026-11-05', '0', '0', '1', 'hard', '2026-11-04T12:27:16.623Z', '', '2026-11-04T12:27:16.623Z', '2026-11-04']],
  log: [['timestamp', 'wordId', 'mode', 'result', 'exerciseId', 'chosen', 'device', 'eventId'], ['04/11/2026 19:27:16', 'laud', 'w2m', 'hard', '', '', 'd', 'e1']],
  custom_words: [['id', 'word', 'pos', 'priority', 'meaning', 'nuance', 'example', 'collocations', 'root', 'createdAt', 'updatedAt']],
  settings: [['key', 'value'], ['examMode', 'true']]
};

function ready({ content = true } = {}) {
  const env = makeEnv();
  Object.entries(OLD).forEach(([n, rows]) => env.store.sheets.push(new Sheet(n, rows.map((r) => r.slice()))));
  loadServer(env);
  env.ctx.ADMIN_KEY_HASH = crypto.createHash('sha256').update(ADMIN_KEY).digest('base64');
  const call = (action, payload, token) => post(env, { action, payload, token });
  const cli = (action, payload) => post(env, { action: 'cli.' + action, adminKey: ADMIN_KEY, payload });
  assert.equal(cli('migrate').ok, true);
  const pw = {};
  cli('createAccounts').data.created.forEach((c) => { pw[c.username] = c.password; });
  if (content) assert.equal(cli('ensureContent').ok, true);
  const tokenOf = (u) => {
    const r = call('login', { username: u, password: pw[u] });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(call('setPassword', { password: 'matkhau-' + u }, r.data.token).ok, true);
    return r.data.token;
  };
  const sheet = (n) => env.store.sheets.find((s) => s.name === n);
  const rows = (n) => sheet(n).data.slice(1).filter((r) => r.some((v) => v !== ''));
  return { env, call, cli, tokenOf, sheet, rows };
}

test('cli.ensureContent: thêm 3 tab ở cuối, chạy lại vô hại, không đụng tab cũ', () => {
  const t = ready({ content: false });
  const before = t.env.store.sheets.map((s) => [s.name, JSON.stringify(s.data)]);
  const r = t.cli('ensureContent');
  assert.deepEqual(r.data.created, ['content_overrides', 'content_history', 'suggestions']);
  const after = t.env.store.sheets.map((s) => s.name);
  assert.deepEqual(after.slice(-3), ['content_overrides', 'content_history', 'suggestions']);
  before.forEach(([n, d]) => assert.equal(JSON.stringify(t.sheet(n).data), d, 'tab cũ ' + n + ' không đổi'));
  assert.deepEqual(t.cli('ensureContent').data.created, []);
});

test('chưa có tab nội dung: getState vẫn chạy, trả nội dung rỗng; sửa thì báo chưa bật', () => {
  const t = ready({ content: false });
  const a = t.tokenOf('user01');
  const st = t.call('getState', {}, a);
  assert.equal(st.ok, true);
  assert.deepEqual(st.data.content, { overrides: [], corrected: [], pending: 0 });
  const r = t.call('adminSaveOverride', { targetType: 'word', targetId: 'laud', changes: { nuance: 'x' }, base: baseWord('laud') }, a);
  assert.equal(r.error.code, 'not_ready');
});

test('quản trị viên sửa sắc thái: có override + một dòng lịch sử; getState của người khác thấy bản sửa và nhãn đã đính chính', () => {
  const t = ready();
  const a = t.tokenOf('user01');
  t.cli('setUser', { userId: 'u02', active: true });
  const u = t.tokenOf('user02');
  const r = t.call('adminSaveOverride', { targetType: 'word', targetId: 'laud', changes: { nuance: 'Sắc thái mới' }, base: baseWord('laud'), note: 'theo Merriam-Webster' }, a);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.data.changed, ['nuance']);
  assert.deepEqual(r.data.content.overrides, [{ t: 'word', id: 'laud', f: 'nuance', v: 'Sắc thái mới', ver: 1 }]);
  const h = t.rows('content_history');
  assert.equal(h.length, 1);
  const H = t.sheet('content_history').data[0];
  assert.equal(JSON.parse(h[0][H.indexOf('before')]), baseWord('laud').nuance);
  assert.equal(h[0][H.indexOf('source')], 'admin-edit');
  assert.equal(h[0][H.indexOf('changedBy')], 'u01');
  const st = t.call('getState', {}, u).data.content;
  assert.deepEqual(st.overrides.map((o) => o.v), ['Sắc thái mới']);
  assert.deepEqual(st.corrected, ['word:laud']);
  assert.equal(st.pending, 0);
  // sửa lần hai: cập nhật đúng dòng override (version 2), thêm dòng lịch sử
  t.call('adminSaveOverride', { targetType: 'word', targetId: 'laud', changes: { nuance: 'Lần hai' }, base: baseWord('laud') }, a);
  assert.equal(t.rows('content_overrides').length, 1);
  assert.equal(t.rows('content_history').length, 2);
  const O = t.sheet('content_overrides').data[0];
  assert.equal(t.rows('content_overrides')[0][O.indexOf('version')], '2');
  // lưu lại y nguyên: không ghi gì thêm
  const same = t.call('adminSaveOverride', { targetType: 'word', targetId: 'laud', changes: { nuance: 'Lần hai' }, base: baseWord('laud') }, a);
  assert.deepEqual(same.data.changed, []);
  assert.equal(t.rows('content_history').length, 2);
});

test('người thường gọi action quản trị: bị từ chối, không ghi gì', () => {
  const t = ready();
  t.cli('setUser', { userId: 'u02', active: true });
  const u = t.tokenOf('user02');
  for (const action of ['adminSaveOverride', 'adminRevertChange', 'adminHideExercise', 'adminListHistory', 'adminListSuggestions', 'adminReviewSuggestion', 'adminExportOverrides', 'adminMarkOverridesBaked']) {
    const r = t.call(action, { targetType: 'word', targetId: 'laud', changes: { nuance: 'x' }, base: baseWord('laud') }, u);
    assert.equal(r.error.code, 'forbidden', action);
  }
  assert.equal(t.rows('content_overrides').length, 0);
  assert.equal(t.rows('content_history').length, 0);
});

test('kiểm tra hợp lệ ở server: SE chỉ 1 đáp án, đáp án ngoài phương án, {0} không khớp, trường cấm sửa → không lưu', () => {
  const t = ready();
  const a = t.tokenOf('user01');
  const se = baseEx(SE);
  let r = t.call('adminSaveOverride', { targetType: 'exercise', targetId: SE, changes: { answers: [se.answers[0]] }, base: se }, a);
  assert.equal(r.error.code, 'invalid');
  assert.match(r.error.message, /Câu SE phải có đúng 6 phương án và đúng 2 đáp án/);
  r = t.call('adminSaveOverride', { targetType: 'exercise', targetId: SE, changes: { answers: [se.answers[0], 'khong-co'] }, base: se }, a);
  assert.match(r.error.message, /Đáp án phải nằm trong danh sách phương án/);
  r = t.call('adminSaveOverride', { targetType: 'exercise', targetId: SE, changes: { sentence: 'Không có chỗ trống.' }, base: se }, a);
  assert.match(r.error.message, /\{0\}` trong câu không khớp số chỗ trống/);
  r = t.call('adminSaveOverride', { targetType: 'word', targetId: 'laud', changes: { group: 'x' }, base: baseWord('laud') }, a);
  assert.equal(r.error.code, 'bad_request');
  r = t.call('adminSaveOverride', { targetType: 'word', targetId: 'laud', changes: { meaning: '' }, base: baseWord('laud') }, a);
  assert.match(r.error.message, /Nghĩa không được để trống/);
  assert.equal(t.rows('content_overrides').length, 0);
  assert.equal(t.rows('content_history').length, 0);
});

test('ẩn câu rồi khôi phục: lịch sử chỉ thêm dòng; khôi phục lần sửa đầu tiên thì trở về dữ liệu gốc (tắt override)', () => {
  const t = ready();
  const a = t.tokenOf('user01');
  const se = baseEx(SE);
  const h1 = t.call('adminHideExercise', { exerciseId: SE, hidden: true, base: se }, a).data;
  assert.deepEqual(h1.content.overrides.map((o) => [o.f, o.v]), [['hidden', true]]);
  assert.deepEqual(h1.content.corrected, [], 'chỉ ẩn thì không gắn nhãn đã đính chính');
  const s1 = t.call('adminSaveOverride', { targetType: 'exercise', targetId: SE, changes: { explanation: 'Giải thích 1' }, base: se }, a).data;
  const s2 = t.call('adminSaveOverride', { targetType: 'exercise', targetId: SE, changes: { explanation: 'Giải thích 2' }, base: se }, a).data;
  // khôi phục s2 → về "Giải thích 1"
  let r = t.call('adminRevertChange', { changeId: s2.changeId, base: se }, a);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.content.overrides.find((o) => o.f === 'explanation').v, 'Giải thích 1');
  // khôi phục s1 (lần sửa đầu) → trở về dữ liệu gốc: override explanation tắt
  r = t.call('adminRevertChange', { changeId: s1.changeId, base: se }, a);
  assert.equal(r.data.content.overrides.some((o) => o.f === 'explanation'), false);
  // hiện lại câu
  r = t.call('adminRevertChange', { changeId: h1.changeId, base: se }, a);
  assert.deepEqual(r.data.content.overrides, []);
  const hist = t.call('adminListHistory', { targetType: 'exercise', targetId: SE }, a).data.history;
  assert.equal(hist.length, 6, 'đủ 6 dòng: ẩn, sửa, sửa, khôi phục ×3');
  assert.equal(hist[0].source, 'revert:' + h1.changeId);
  assert.equal(hist[0].changedBy, 'user01');
  assert.equal(t.rows('content_history').length, 6);
  // khôi phục lại một thay đổi đã về như cũ: báo không có gì thay đổi
  assert.equal(t.call('adminRevertChange', { changeId: s1.changeId, base: se }, a).error.code, 'no_change');
});

test('khôi phục bị chặn nếu làm câu không hợp lệ', () => {
  const t = ready();
  const a = t.tokenOf('user01');
  const se = baseEx(SE);
  const other = se.options.find((o) => !se.answers.includes(o));
  // đổi phương án rồi đổi đáp án theo phương án mới; khôi phục riêng lần đổi phương án → đáp án nằm ngoài phương án
  const opts = se.options.map((o) => (o === other ? 'moi-them' : o));
  const c1 = t.call('adminSaveOverride', { targetType: 'exercise', targetId: SE, changes: { options: opts }, base: se }, a).data;
  assert.ok(c1.changeId);
  const c2 = t.call('adminSaveOverride', { targetType: 'exercise', targetId: SE, changes: { answers: [se.answers[0], 'moi-them'] }, base: se }, a);
  assert.equal(c2.ok, true, JSON.stringify(c2));
  const r = t.call('adminRevertChange', { changeId: c1.changeId, base: se }, a);
  assert.equal(r.error.code, 'invalid');
});

test('đề xuất: sửa nghĩa không có nguồn bị chặn; có nguồn thì gửi được; giới hạn 20 mỗi ngày; chỉ thấy đề xuất của mình', () => {
  const t = ready();
  const a = t.tokenOf('user01');
  t.cli('setUser', { userId: 'u02', active: true });
  t.cli('setUser', { userId: 'u03', active: true });
  const u = t.tokenOf('user02'), v = t.tokenOf('user03');
  const w = baseWord('laud');
  const base = { targetType: 'word', targetId: 'laud', field: 'meaning', currentValue: w.meaning, proposedValue: 'khen ngợi hết lời', reason: 'Nghĩa hiện tại chưa đủ mạnh.' };
  let r = t.call('submitSuggestion', base, u);
  assert.equal(r.error.code, 'invalid');
  assert.match(r.error.message, /cần kèm nguồn/);
  assert.match(t.call('submitSuggestion', Object.assign({}, base, { sourceUrl: 'https://x.org', reason: 'ngắn' }), u).error.message, /ít nhất 10 ký tự/);
  assert.match(t.call('submitSuggestion', Object.assign({}, base, { sourceUrl: 'javascript:alert(1)' }), u).error.message, /đường link/);
  assert.match(t.call('submitSuggestion', Object.assign({}, base, { sourceUrl: 'https://x.org', proposedValue: w.meaning }), u).error.message, /giống hệt/);
  r = t.call('submitSuggestion', Object.assign({}, base, { sourceUrl: 'https://www.merriam-webster.com/dictionary/laud' }), u);
  assert.equal(r.ok, true, JSON.stringify(r));
  // ví dụ không bắt buộc nguồn; lý do bắt đầu bằng "=" không bị Sheet hiểu thành công thức
  r = t.call('submitSuggestion', { targetType: 'word', targetId: 'laud', field: 'example', currentValue: w.example, proposedValue: 'They *lauded* her.', reason: '=HYPERLINK("x") ví dụ hay hơn' }, u);
  assert.equal(r.ok, true);
  const S = t.sheet('suggestions').data[0];
  assert.equal(t.rows('suggestions')[1][S.indexOf('reason')].charAt(0), "'");
  // báo lỗi câu
  r = t.call('submitSuggestion', { targetType: 'exercise', targetId: SE, field: '_report', proposedValue: { kind: 'two_correct', text: '' }, reason: 'Phương án thứ ba cũng đúng nghĩa.' }, u);
  assert.equal(r.ok, true);
  assert.equal(t.call('listMySuggestions', {}, u).data.suggestions.length, 3);
  assert.equal(t.call('listMySuggestions', {}, v).data.suggestions.length, 0);
  assert.equal(t.call('getState', {}, a).data.content.pending, 3);
  for (let k = 3; k < 20; k++) assert.equal(t.call('submitSuggestion', { targetType: 'word', targetId: 'laud', field: 'root', currentValue: '', proposedValue: 'gốc ' + k, reason: 'thử giới hạn số đề xuất' }, u).ok, true);
  assert.equal(t.call('submitSuggestion', { targetType: 'word', targetId: 'laud', field: 'root', currentValue: '', proposedValue: 'gốc 21', reason: 'thử giới hạn số đề xuất' }, u).error.code, 'rate_limited');
});

test('duyệt đề xuất: chấp nhận tạo override + lịch sử source suggestion:<id>; từ chối cần lý do; người đề xuất thấy trạng thái và ghi chú', () => {
  const t = ready();
  const a = t.tokenOf('user01');
  t.cli('setUser', { userId: 'u02', active: true });
  const u = t.tokenOf('user02');
  const w = baseWord('laud');
  const s1 = t.call('submitSuggestion', { targetType: 'word', targetId: 'laud', field: 'meaning', currentValue: w.meaning, proposedValue: 'ca ngợi hết lời', reason: 'Nghĩa gốc nhấn mạnh mức độ.', sourceUrl: 'https://www.merriam-webster.com/dictionary/laud' }, u).data.suggestionId;
  const s2 = t.call('submitSuggestion', { targetType: 'word', targetId: 'laud', field: 'example', currentValue: w.example, proposedValue: 'x *laud* y', reason: 'Ví dụ dễ hiểu hơn nhiều.' }, u).data.suggestionId;
  const list = t.call('adminListSuggestions', {}, a).data;
  assert.equal(list.pending, 2);
  assert.equal(list.suggestions[0].username, 'user02');
  let r = t.call('adminReviewSuggestion', { suggestionId: s1, decision: 'accept', changes: { meaning: 'ca ngợi hết lời' }, base: w, note: 'Cảm ơn bạn' }, a);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.status, 'accepted');
  assert.equal(r.data.content.overrides[0].v, 'ca ngợi hết lời');
  const hist = t.call('adminListHistory', { targetType: 'word', targetId: 'laud' }, a).data.history;
  assert.equal(hist[0].source, 'suggestion:' + s1);
  assert.equal(t.call('adminReviewSuggestion', { suggestionId: s1, decision: 'reject', note: 'abc' }, a).error.code, 'conflict');
  assert.equal(t.call('adminReviewSuggestion', { suggestionId: s2, decision: 'reject', note: '' }, a).error.code, 'invalid');
  assert.equal(t.call('adminReviewSuggestion', { suggestionId: s2, decision: 'reject', note: 'Ví dụ cũ đã rõ' }, a).ok, true);
  const mine = t.call('listMySuggestions', {}, u).data.suggestions;
  const by = Object.fromEntries(mine.map((x) => [x.suggestionId, x]));
  assert.equal(by[s1].status, 'accepted');
  assert.equal(by[s1].reviewerNote, 'Cảm ơn bạn');
  assert.equal(by[s2].status, 'rejected');
  assert.equal(by[s2].reviewerNote, 'Ví dụ cũ đã rõ');
  assert.equal(t.call('getState', {}, a).data.content.pending, 0);
});

test('xuất bản sửa và đánh dấu đã đưa vào dữ liệu gốc: chỉ tắt đúng phiên bản đã xuất', () => {
  const t = ready();
  const a = t.tokenOf('user01');
  t.call('adminSaveOverride', { targetType: 'word', targetId: 'laud', changes: { nuance: 'A' }, base: baseWord('laud') }, a);
  t.call('adminSaveOverride', { targetType: 'word', targetId: 'extol', changes: { nuance: 'B' }, base: baseWord('extol') }, a);
  const ex = t.call('adminExportOverrides', {}, a).data;
  assert.equal(ex.overrides.length, 2);
  assert.match(ex.date, /^\d{4}-\d{2}-\d{2}$/);
  // extol được sửa tiếp sau khi xuất (version 2): không bị tắt
  t.call('adminSaveOverride', { targetType: 'word', targetId: 'extol', changes: { nuance: 'C' }, base: baseWord('extol') }, a);
  const items = ex.overrides.map((o) => ({ targetType: o.targetType, targetId: o.targetId, field: o.field, version: o.version }));
  const r = t.call('adminMarkOverridesBaked', { items }, a).data;
  assert.equal(r.marked, 1);
  assert.deepEqual(r.content.overrides.map((o) => [o.id, o.v]), [['extol', 'C']]);
  assert.equal(t.rows('content_history').length, 3, 'đánh dấu không xóa lịch sử');
});

test('purgeTestUser: từ chối nếu tài khoản có tiến độ từ trước khi kiểm thử', () => {
  const t = ready();
  t.cli('setUser', { userId: 'u02', active: true });
  const u = t.tokenOf('user02');
  const old = '2026-01-01T00:00:00.000Z';
  t.call('saveEvents', { events: [{ id: 'e-old', type: 'review', ts: old, wordId: 'laud', state: { wordId: 'laud', box: 1, dueDate: '2026-01-02', updatedAt: old } }] }, u);
  const r = t.cli('purgeTestUser', { userId: 'u02', since: Date.now() - 1000 });
  assert.equal(r.error.code, 'forbidden');
  assert.equal(t.rows('progress').filter((x) => x[0] === 'u02').length, 1, 'không xóa gì');
  assert.equal(t.cli('purgeTestUser', { userId: 'u02' }).error.code, 'bad_request');
});

test('sửa độ khó và kỹ năng của câu GRE (đợt bài tập 01): hợp lệ thì lưu, sai thì từ chối', () => {
  const t = ready();
  const a = t.tokenOf('user01');
  const id = pc.exercises.find((e) => e.addedIn === 'batch-01').id;
  const ok = t.call('adminSaveOverride', { targetType: 'exercise', targetId: id, changes: { difficulty: 3, skills: ['contrast', 'nuance'] }, base: baseEx(id) }, a);
  assert.equal(ok.ok, true, JSON.stringify(ok));
  const ov = ok.data.content.overrides.filter((o) => o.id === id).map((o) => o.f).sort();
  assert.deepEqual(ov, ['difficulty', 'skills']);
  const bad1 = t.call('adminSaveOverride', { targetType: 'exercise', targetId: id, changes: { difficulty: 4 }, base: baseEx(id) }, a);
  assert.equal(bad1.ok, false);
  assert.match(bad1.error.message, /Độ khó/);
  const bad2 = t.call('adminSaveOverride', { targetType: 'exercise', targetId: id, changes: { skills: ['foo'] }, base: baseEx(id) }, a);
  assert.equal(bad2.ok, false);
  assert.match(bad2.error.message, /Kỹ năng/);
});
