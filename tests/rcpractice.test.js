import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildReading, validateReading, RC_TASK_CODES } from '../assets/reading.js';
import * as P from '../assets/rcpractice.js';

const data = JSON.parse(fs.readFileSync(new URL('../data/reading/passages.json', import.meta.url)));
const RC = buildReading(data);

test('mọi câu Reading có task hợp lệ; mọi dạng trong TASKS đều có ít nhất 2 câu', () => {
  assert.deepEqual(validateReading(data, new Set()), []);
  const qs = Object.values(RC.byId);
  qs.forEach((q) => assert.ok(RC_TASK_CODES.includes(q.task), q.id + ' thiếu task'));
  assert.deepEqual(Object.keys(P.TASKS).sort(), RC_TASK_CODES.slice().sort());
  RC_TASK_CODES.forEach((t) => assert.ok(qs.filter((q) => q.task === t).length >= 2, 'dạng ' + t + ' có ít hơn 2 câu'));
  Object.values(P.TASKS).forEach((t) => { assert.equal(t.steps.length, 3); assert.equal(t.traps.length, 2); });
});

test('taskOf: dữ liệu thiếu task suy từ kind', () => {
  assert.equal(P.taskOf({ kind: 'sentence' }), 'select');
  assert.equal(P.taskOf({ kind: 'mc' }), 'inference');
  assert.equal(P.taskOf({ kind: 'mc', task: 'vocab' }), 'vocab');
});

test('budgetSec: 90 giây mỗi câu, đoạn dài thêm 60 giây', () => {
  assert.equal(P.budgetSec({ questionIds: ['a', 'b'], length: 'short' }), 180);
  assert.equal(P.budgetSec({ questionIds: ['a', 'b', 'c'], length: 'long' }), 330);
  assert.equal(P.budgetSec({ questionIds: ['a'], length: 'argument' }), 90);
});

const p1 = RC.passages.find((p) => p.id === 'rc01');
const p27 = RC.passages.find((p) => p.id === 'rc27');
const allRight = (p) => Object.fromEntries(p.questionIds.map((id) => {
  const q = RC.byId[id];
  return [id, q.kind === 'multi' ? q.answers.slice() : [String(q.answer)]];
}));

test('gradeAttempt: đúng toàn bộ, sai và bỏ trống', () => {
  const ok = P.gradeAttempt(p1, RC.byId, allRight(p1));
  assert.ok(ok.every((x) => x.ok));
  const bad = P.gradeAttempt(p1, RC.byId, { rc01a: ['explain why parasites are uncommon on coral reefs'] });
  assert.deepEqual(bad.map((x) => x.ok), [false, false]);
  assert.deepEqual(bad[1].c, []);
});

test('trạng thái đoạn, lọc, chọn đoạn tiếp theo', () => {
  const hist = [
    { pid: 'rc01', at: 1, sec: 100, items: P.gradeAttempt(p1, RC.byId, allRight(p1)) },
    { pid: 'rc27', at: 2, sec: 50, items: P.gradeAttempt(p27, RC.byId, {}) }
  ];
  const last = P.lastByPassage(hist);
  assert.equal(P.passageStatus('rc01', last), 'done');
  assert.equal(P.passageStatus('rc27', last), 'wrong');
  assert.equal(P.passageStatus('rc02', last), 'new');

  const bold = P.filterPassages(RC.passages, RC.byId, { tasks: ['boldface'] }, last);
  assert.deepEqual(bold.map((p) => p.id).sort(), ['rc27', 'rc35']);
  const arg = P.filterPassages(RC.passages, RC.byId, { length: 'argument' }, last);
  assert.ok(arg.length >= 9 && arg.every((p) => p.length === 'argument'));
  assert.deepEqual(P.filterPassages(RC.passages, RC.byId, { status: 'wrong' }, last).map((p) => p.id), ['rc27']);
  // Đoạn có câu đang giữ cho đề cố định bị ẩn
  assert.ok(!P.filterPassages(RC.passages, RC.byId, {}, last, new Set(['rc01a'])).some((p) => p.id === 'rc01'));

  // Ưu tiên chưa làm, rồi còn sai, rồi đã đúng; bỏ đoạn vừa làm
  assert.equal(P.pickNext([p1, p27], last, null).id, 'rc27');
  assert.equal(P.pickNext([p1, p27], last, 'rc27').id, 'rc01');
  assert.equal(P.pickNext([p1], last, 'rc01').id, 'rc01');
  assert.equal(P.pickNext([], last, null), null);
  const p2 = RC.passages.find((p) => p.id === 'rc02');
  assert.equal(P.pickNext([p1, p27, p2], last, null).id, 'rc02');
});

test('taskStats chỉ tính lần làm gần nhất mỗi câu; weakestTask, reasonStats', () => {
  const wrong = P.gradeAttempt(p1, RC.byId, {});
  wrong[0].reason = 'partial';
  const hist = [
    { pid: 'rc01', at: 1, sec: 120, items: wrong },
    { pid: 'rc01', at: 2, sec: 60, items: P.gradeAttempt(p1, RC.byId, allRight(p1)) },
    { pid: 'rc27', at: 3, sec: 90, items: P.gradeAttempt(p27, RC.byId, {}) }
  ];
  const st = P.taskStats(hist, RC.byId);
  assert.deepEqual(st.purpose, { n: 1, ok: 1, sec: 30 });
  assert.deepEqual(st.select, { n: 1, ok: 1, sec: 30 });
  assert.deepEqual(st.boldface, { n: 1, ok: 0, sec: 90 });
  const all = P.taskStats(hist, RC.byId, true);
  assert.equal(all.purpose.n, 2);
  assert.equal(P.weakestTask(st, 3), null);
  assert.equal(P.weakestTask(st, 1).task, 'boldface');
  assert.deepEqual(P.reasonStats(hist), { partial: 1 });
  assert.equal(P.trimHistory(new Array(10).fill(0), 4).length, 4);
});
