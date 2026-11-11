// Danh sách hôm nay (đợt 02): từ mới cố định trong ngày, ảnh chụp Đến hạn, KPI "đã ôn hôm nay", câu GRE theo đáp án.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { idx, Srs, seq } from './fixture.js';
import * as TL from '../assets/todaylist.js';
import * as B from '../assets/bank.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const T = '2026-11-11';
const iso = (s) => new Date(s).toISOString();
/** Trạng thái đã học: hộp b, đến hạn d, ôn lần cuối lúc last (ISO). */
const st = (id, box, due, last, extra) => Object.assign(Srs.newState(id), { box, dueDate: due, lastReviewed: last || '', updatedAt: last || '' }, extra || {});
const unlearnedIds = (progress) => Srs.unlearnedWords(idx, progress).map((w) => w.id);

/* ---------------- Từ mới cố định trong ngày ---------------- */

test('từ mới hôm nay: chưa lưu thì chọn các từ chưa học đầu tiên (thứ tự cụm, ưu tiên), đủ chỗ còn lại; cần lưu', () => {
  const progress = {};
  const r = TL.pickTodayNew(idx, progress, { today: T, newLimit: 10, newDoneToday: 0 });
  assert.equal(r.save, true);
  assert.deepEqual(r.ids, unlearnedIds(progress).slice(0, 10));
  // đã học 3 từ mới hôm nay trước khi có danh sách: còn 7 chỗ
  assert.equal(TL.pickTodayNew(idx, progress, { today: T, newLimit: 10, newDoneToday: 3 }).ids.length, 7);
  assert.equal(TL.pickTodayNew(idx, progress, { today: T, newLimit: 0, newDoneToday: 0 }).ids.length, 0);
});

test('từ mới hôm nay: đã lưu thì giữ nguyên danh sách dù tiến độ đổi (tải lại trang / máy khác cùng tài khoản)', () => {
  const progress = {};
  const first = TL.pickTodayNew(idx, progress, { today: T, newLimit: 10, newDoneToday: 0 });
  // lưu vào cài đặt như setSetting(todayNew:<ngày>), rồi giả lập server trả về ở lần tải sau / máy khác
  const serverSettings = JSON.parse(JSON.stringify({ newPerDay: 10, [TL.newKey(T)]: first.ids }));
  // trong lúc đó đã học 4 từ của danh sách và đổi số từ mới mỗi ngày
  first.ids.slice(0, 4).forEach((id) => { progress[id] = st(id, 1, '2026-11-12', iso('2026-11-11T03:00:00Z')); });
  const again = TL.pickTodayNew(idx, progress, { today: T, newLimit: 15, newDoneToday: 4, stored: serverSettings[TL.newKey(T)] });
  assert.equal(again.save, false);
  assert.deepEqual(again.ids, first.ids);
  // id không còn trong dữ liệu bị bỏ, giá trị lạ bị bỏ
  assert.deepEqual(TL.pickTodayNew(idx, {}, { today: T, newLimit: 10, stored: ['laud', 'khong-co', 42] }).ids, ['laud']);
  // danh sách rỗng đã lưu vẫn là danh sách cố định (không chọn lại)
  assert.deepEqual(TL.pickTodayNew(idx, {}, { today: T, newLimit: 10, stored: [] }), { ids: [], save: false });
});

test('phiên ôn hôm nay dùng chung danh sách từ mới: chỉ các từ của danh sách còn chưa học, đúng thứ tự', () => {
  const list = unlearnedIds({}).slice(5, 12); // cố ý không phải 7 từ đầu
  const progress = { [list[1]]: st(list[1], 1, '2026-11-12', iso('2026-11-11T03:00:00Z')) };
  const q = Srs.buildDailyQueue(idx, progress, { today: T, newIds: list, max: 40 });
  assert.deepEqual(q.items.filter((x) => x.isNew).map((x) => x.wordId), list.filter((id) => id !== list[1]));
  assert.equal(q.newCount, 6);
  // không truyền newIds: cách cũ (newLimit - newDoneToday)
  assert.equal(Srs.buildDailyQueue(idx, {}, { today: T, newLimit: 10, newDoneToday: 4, max: 40 }).newCount, 6);
});

test('khóa todayNew:/todayDue: cũ hơn 7 ngày bị bỏ qua khi đọc; khóa khác giữ nguyên', () => {
  const s = { newPerDay: 10, examMode: true, 'todayNew:2026-11-11': ['a'], 'todayNew:2026-11-04': ['b'], 'todayDue:2026-11-03': ['c'], 'todayNew:2026-10-01': ['d'] };
  assert.deepEqual(Object.keys(TL.dropStaleDayKeys(s, T)).sort(), ['examMode', 'newPerDay', 'todayNew:2026-11-04', 'todayNew:2026-11-11']);
  assert.equal(TL.isStaleDayKey('examMode', T), false);
});

/* ---------------- Đến hạn: ảnh chụp đầu ngày ---------------- */

test('đến hạn: ôn xong (dueDate dời sang ngày sau) vẫn còn trong danh sách; từ đến hạn mới được thêm; từ mới hôm nay không lặp lại', () => {
  const [a, b, c, d] = ['laud', 'extol', 'vilify', 'belittle'];
  const progress = { [a]: st(a, 2, '2026-11-10'), [b]: st(b, 1, T), [c]: st(c, 3, '2026-11-20') };
  const first = TL.pickTodayDue(idx, progress, { today: T, newIds: [] });
  assert.deepEqual(first.ids.sort(), [a, b].sort());
  assert.equal(first.save, true);
  // ôn đúng a: lên hộp 3, hẹn 7 ngày → không còn "đến hạn" nhưng vẫn trong ảnh chụp
  progress[a] = Srs.applyResult(progress[a], 'good', T, iso('2026-11-11T02:00:00Z'));
  const second = TL.pickTodayDue(idx, progress, { today: T, stored: first.ids, newIds: [] });
  assert.deepEqual(second.ids, first.ids);
  assert.equal(second.save, false);
  // c bị trả lời sai ở Luyện tập → đến hạn hôm nay: được thêm vào và cần lưu lại
  progress[c] = Srs.applyResult(progress[c], 'again', T, iso('2026-11-11T02:05:00Z'));
  const third = TL.pickTodayDue(idx, progress, { today: T, stored: second.ids, newIds: [] });
  assert.deepEqual(third.ids, first.ids.concat([c]));
  assert.equal(third.save, true);
  // d là từ mới hôm nay, trả lời sai (hộp 1, đến hạn hôm nay): đã ở thẻ Từ mới, không lặp ở Đến hạn
  progress[d] = Srs.applyResult(Srs.newState(d), 'again', T, iso('2026-11-11T02:10:00Z'));
  assert.ok(!TL.pickTodayDue(idx, progress, { today: T, stored: third.ids, newIds: [d] }).ids.includes(d));
});

/* ---------------- KPI ---------------- */

test('đã ôn hôm nay theo giờ Việt Nam (00:00–23:59 GMT+7), không theo giờ thiết bị', () => {
  const p = {
    a: st('a', 1, T, '2026-11-10T17:00:00.000Z'),  // 00:00 ngày 11/11 giờ VN → hôm nay
    b: st('b', 1, T, '2026-11-10T16:59:59.000Z'),  // 23:59 ngày 10/11 giờ VN → hôm qua
    c: st('c', 1, T, '2026-11-11T16:59:59.000Z'),  // 23:59 ngày 11/11 giờ VN → hôm nay
    d: st('d', 0, '', '')
  };
  assert.deepEqual([...TL.reviewedToday(p, T)].sort(), ['a', 'c']);
});

test('KPI: số đã ôn / tổng của từng thẻ và của cả danh sách (không đếm trùng từ ở hai thẻ)', () => {
  const lists = { due: ['a', 'b', 'c'], new: ['d', 'e'], leech: ['a', 'f'] };
  const k = TL.todayKpi(lists, new Set(['a', 'd', 'f', 'zz']));
  assert.deepEqual(k.due, { done: 1, total: 3 });
  assert.deepEqual(k.new, { done: 1, total: 2 });
  assert.deepEqual(k.leech, { done: 2, total: 2 });
  assert.deepEqual(k.all, { done: 3, total: 6 }, 'a nằm ở cả Đến hạn và Hay quên: tính một lần');
  assert.equal(TL.firstOpenCard(lists, new Set(['a', 'b', 'c'])), 'new');
  assert.equal(TL.firstOpenCard(lists, new Set(['a', 'b', 'c', 'd', 'e', 'f'])), 'due');
  assert.equal(TL.firstOpenCard({ due: [], new: [], leech: [] }, new Set()), 'due');
});

test('bài GRE: chỉ từ ở đáp án được tính đã ôn (giống phiên ôn: record cho đáp án, touch cho từ đích khác)', () => {
  // một câu có từ đích không phải đáp án
  const ex = idx.exercises.find((e) => Srs.gradeExercise(e, [], idx).otherTargetIds.length && e.answerIds.length);
  assert.ok(ex, 'cần một câu có từ đích ngoài đáp án');
  const choice = ex.type === 'se' ? ex.answers.slice() : ex.blanks.map((b) => b.answer);
  const g = Srs.gradeExercise(ex, choice, idx);
  assert.equal(g.correct, true);
  const now = '2026-11-11T05:00:00.000Z';
  const progress = {};
  g.answerIds.forEach((id) => { progress[id] = Srs.applyResult(Srs.newState(id), 'good', T, now); });
  g.otherTargetIds.forEach((id) => { if (!progress[id]) progress[id] = Srs.touchReview(Srs.newState(id), now); });
  const done = TL.reviewedToday(progress, T);
  g.answerIds.forEach((id) => assert.ok(done.has(id), 'đáp án ' + id));
  g.otherTargetIds.filter((id) => !g.answerIds.includes(id)).forEach((id) => assert.ok(!done.has(id), 'từ đích không phải đáp án ' + id));
  // từ đến hạn là đáp án: sau khi làm câu, KPI Đến hạn tăng
  const due = g.answerIds[0];
  const before = { [due]: st(due, 2, '2026-11-09', '2026-11-06T05:00:00.000Z') };
  const lists = { due: [due], new: [], leech: [] };
  assert.equal(TL.todayKpi(lists, TL.reviewedToday(before, T)).due.done, 0);
  const after = { [due]: Srs.applyResult(before[due], 'good', T, now) };
  assert.equal(TL.todayKpi(lists, TL.reviewedToday(after, T)).due.done, 1);
});

/* ---------------- Nhóm theo cụm › nhóm ---------------- */

test('nhóm theo cụm › nhóm theo thứ tự dữ liệu; dòng tóm tắt chủ đề', () => {
  const ids = ['vilify', 'laud', 'extol', 'obscure-v', 'reprove'].filter((id) => idx.byId[id]);
  const gr = TL.groupByClusterGroup(ids, idx);
  assert.equal(gr.reduce((n, c) => n + c.n, 0), ids.length);
  assert.equal(new Set(gr.map((c) => c.clusterId)).size, gr.length, 'mỗi cụm một mục');
  gr.forEach((c) => c.groups.forEach((g) => g.ids.forEach((id) => assert.equal(idx.byId[id].group, g.groupId))));
  const line = TL.topicLine(ids, idx);
  const c0 = gr[0];
  assert.ok(line.startsWith(c0.title + ' (' + c0.groups[0].title + ' ' + c0.groups[0].ids.length));
  assert.equal(line.split(' · ').length, gr.length);
});

test('số ngày quá hạn', () => {
  assert.equal(TL.overdueDays(st('a', 2, '2026-11-08'), T), 3);
  assert.equal(TL.overdueDays(st('a', 2, T), T), 0);
  assert.equal(TL.overdueDays(st('a', 0, ''), T), 0);
});

/* ---------------- Câu GRE theo đáp án ---------------- */

test('câu GRE cho danh sách: câu có từ của danh sách là đáp án; từ không có câu thì vào danh sách bổ sung; bỏ câu giữ cho đề chưa làm', () => {
  const mockIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/mocks/index.json'), 'utf8'));
  const mocks = mockIndex.mocks.map((id) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/mocks', id + '.json'), 'utf8')));
  const held = B.heldExerciseIds(mocks, new Set());
  const usable = idx.exercises.filter((e) => !held.has(e.id));
  const withEx = idx.words.filter((w) => usable.some((e) => e.answerIds.includes(w.id))).slice(0, 6).map((w) => w.id);
  const noEx = idx.words.filter((w) => !idx.exercises.some((e) => e.answerIds.includes(w.id))).slice(0, 2).map((w) => w.id);
  const list = withEx.concat(noEx);
  const plan = TL.grePlan(list, usable, Infinity, seq(1));
  const want = usable.filter((e) => e.answerIds.some((id) => list.includes(id)));
  assert.equal(plan.found, want.length);
  assert.deepEqual(plan.picked.map((e) => e.id).sort(), want.map((e) => e.id).sort());
  assert.ok(plan.picked.every((e) => !held.has(e.id)), 'không dùng câu của đề thi thử chưa làm');
  assert.deepEqual(plan.uncovered, noEx);
  // giới hạn số câu: chọn để phủ được nhiều từ nhất
  const small = TL.grePlan(withEx, usable, withEx.length, seq(2));
  assert.equal(small.picked.length, Math.min(withEx.length, small.found));
  const covered = new Set(small.picked.flatMap((e) => e.answerIds).filter((id) => withEx.includes(id)));
  assert.equal(covered.size, withEx.length, 'mỗi từ có câu đều được phủ khi đủ số câu');
  // một câu đang giữ cho đề thi thử chưa làm thì không xuất hiện
  const heldEx = idx.exById[[...held][0]];
  const p2 = TL.grePlan(heldEx.answerIds, usable, Infinity);
  assert.ok(!p2.picked.some((e) => e.id === heldEx.id));
});
