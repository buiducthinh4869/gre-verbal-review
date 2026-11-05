// Test lõi Thi thử (assets/mock.js): cấu trúc section, tỉ lệ TC/SE, ưu tiên câu, thích ứng, chấm như đề thật.
import test from 'node:test';
import assert from 'node:assert/strict';
import { idx, seq } from './fixture.js';
import * as Mk from '../assets/mock.js';

const T0 = '2026-11-05';
const pool = idx.exercises;

test('cấu trúc theo đề thật: Section 1 = 12 câu / 18 phút, Section 2 = 15 câu / 23 phút, đầy đủ = 27 câu / 41 phút', () => {
  assert.deepEqual(Mk.planSections('s1', 83).sections, [{ no: 1, n: 12, min: 18 }]);
  assert.deepEqual(Mk.planSections('s2', 83).sections, [{ no: 2, n: 15, min: 23 }]);
  const full = Mk.planSections('full', 83);
  assert.equal(full.short, false);
  assert.deepEqual(full.sections.map((s) => [s.no, s.n, s.min]), [[1, 12, 18], [2, 15, 23]]);
});

test('không đủ câu: báo số câu hiện có và co bài ngắn lại, giữ nhịp thời gian', () => {
  const p = Mk.planSections('s1', 8);
  assert.equal(p.short, true);
  assert.equal(p.available, 8);
  assert.deepEqual(p.sections, [{ no: 1, n: 8, min: 12 }]);
  const f = Mk.planSections('full', 18);
  assert.equal(f.sections.reduce((a, s) => a + s.n, 0), 18);
  assert.deepEqual(f.sections.map((s) => s.n), [8, 10]);
});

test('Section 1: đúng 12 câu, không trùng, ~55% TC / 45% SE, TC trộn 1-2-3 chỗ trống, TC trước SE sau', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const ids = Mk.pickSection(pool, 12, { exRes: {}, today: T0, rng: seq(seed) });
    assert.equal(ids.length, 12);
    assert.equal(new Set(ids).size, 12);
    const exs = ids.map((id) => idx.exById[id]);
    const nSE = exs.filter((e) => e.type === 'se').length;
    assert.equal(nSE, 5);
    const kinds = new Set(exs.filter((e) => e.type === 'tc').map((e) => e.blanks.length));
    assert.deepEqual([...kinds].sort(), [1, 2, 3]);
    const firstSE = exs.findIndex((e) => e.type === 'se');
    assert.ok(exs.slice(firstSE).every((e) => e.type === 'se'));
  }
  const s2 = Mk.pickSection(pool, 15, { exRes: {}, today: T0, rng: seq(3) }).map((id) => idx.exById[id]);
  assert.equal(s2.filter((e) => e.type === 'se').length, 7);
});

test('ưu tiên câu chưa làm hoặc làm sai; tránh câu làm đúng trong 7 ngày nếu còn đủ câu', () => {
  const exRes = {};
  pool.forEach((e, i) => { exRes[e.id] = i % 3 === 0 ? ['2026-11-04', 1] : i % 3 === 1 ? ['2026-10-01', 1] : ['2026-11-04', 0]; });
  for (let seed = 1; seed <= 10; seed++) {
    const ids = Mk.pickSection(pool, 12, { exRes, today: T0, rng: seq(seed) });
    ids.forEach((id) => {
      const r = exRes[id];
      assert.ok(!(r[1] && r[0] === '2026-11-04'), 'không lấy câu vừa làm đúng hôm qua: ' + id);
    });
  }
  // gần như mọi câu đều vừa làm đúng: vẫn đủ 12 câu (dùng lại câu đã làm đúng)
  const all = {};
  pool.forEach((e) => { all[e.id] = ['2026-11-04', 1]; });
  assert.equal(Mk.pickSection(pool, 12, { exRes: all, today: T0, rng: seq(1) }).length, 12);
});

test('thích ứng: Section 1 ≥ 70% → Section 2 ưu tiên TC nhiều chỗ trống và câu từng sai; dưới 70% → TC một chỗ trống', () => {
  assert.equal(Mk.adaptFrom(9, 12), 'hard');
  assert.equal(Mk.adaptFrom(8, 12), 'easy');
  const avgBlanks = (prefer) => {
    let tot = 0, n = 0;
    for (let seed = 1; seed <= 20; seed++) {
      Mk.pickSection(pool, 15, { exRes: {}, today: T0, prefer, rng: seq(seed) }).map((id) => idx.exById[id])
        .filter((e) => e.type === 'tc').forEach((e) => { tot += e.blanks.length; n++; });
    }
    return tot / n;
  };
  assert.ok(avgBlanks('hard') > avgBlanks('easy') + 0.5, `hard ${avgBlanks('hard')} vs easy ${avgBlanks('easy')}`);
  const wrongId = pool.find((e) => e.type === 'se').id;
  const exRes = { [wrongId]: ['2026-11-01', 0] };
  for (let seed = 1; seed <= 10; seed++) {
    assert.ok(Mk.pickSection(pool, 15, { exRes, today: T0, prefer: 'hard', rng: seq(seed) }).includes(wrongId));
  }
  const used = new Set(Mk.pickSection(pool, 12, { exRes: {}, today: T0, rng: seq(1) }));
  const s2 = Mk.pickSection(pool, 15, { exRes: {}, today: T0, prefer: 'hard', exclude: used, rng: seq(2) });
  assert.ok(s2.every((id) => !used.has(id)), 'Section 2 không lặp câu của Section 1');
});

test('chấm như đề thật: TC nhiều chỗ trống đúng toàn bộ mới tính; SE phải chọn đúng 2 ô', () => {
  const tc3 = pool.find((e) => e.type === 'tc' && e.blanks.length === 3);
  const right = tc3.blanks.map((b) => b.answer);
  assert.equal(Mk.gradeItem(tc3, right, idx).correct, true);
  const oneWrong = right.slice(); oneWrong[2] = tc3.blanks[2].options.find((o) => o !== right[2]);
  assert.equal(Mk.gradeItem(tc3, oneWrong, idx).correct, false);
  assert.equal(Mk.gradeItem(tc3, [right[0], null, right[2]], idx).answered, false);
  const se = pool.find((e) => e.type === 'se');
  assert.equal(Mk.gradeItem(se, se.answers.slice(), idx).correct, true);
  assert.equal(Mk.gradeItem(se, [se.answers[0]], idx).correct, false);
  const other = se.options.find((o) => !se.answers.includes(o));
  assert.equal(Mk.gradeItem(se, [se.answers[0], other], idx).correct, false);
});

test('mã hóa đáp án giữ đúng vị trí chỗ trống chưa chọn', () => {
  const tc3 = pool.find((e) => e.type === 'tc' && e.blanks.length === 3);
  const c = [tc3.blanks[0].options[0], null, tc3.blanks[2].options[1]];
  assert.deepEqual(Mk.decodeChoice(Mk.encodeChoice(c), tc3), c);
  const se = pool.find((e) => e.type === 'se');
  assert.deepEqual(Mk.decodeChoice(Mk.encodeChoice(['a', 'b']), se), ['a', 'b']);
  assert.deepEqual(Mk.decodeChoice('', se), []);
});

test('tổng hợp: điểm, thời gian, trung bình theo dạng câu', () => {
  const tc1 = pool.find((e) => e.type === 'tc' && e.blanks.length === 1), se = pool.find((e) => e.type === 'se');
  const s = Mk.summarize([{ section: 1, score: 1, total: 2, durationSec: 100, items: [{ i: tc1.id, ok: 1, t: 30 }, { i: se.id, ok: 0, t: 70 }] }], idx);
  assert.equal(s.score, 1);
  assert.deepEqual(s.byKind.tc1, { n: 1, ok: 1, t: 30 });
  assert.deepEqual(s.byKind.se, { n: 1, ok: 0, t: 70 });
});
