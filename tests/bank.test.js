// Đợt bài tập 01: ánh xạ mọi phương án về id từ, nhóm liên quan, bộ lọc / ngân hàng câu, giữ câu cho đề cố định,
// chèn thẻ ôn nhanh khi sai, câu khác có cùng từ, kiểm tra đề cố định.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { idx, Srs, seq } from './fixture.js';
import * as B from '../assets/bank.js';
import { validateMock, validateExercise } from '../assets/validate.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mockIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/mocks/index.json'), 'utf8'));
const mocks = mockIndex.mocks.map((id) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/mocks', id + '.json'), 'utf8')));
const mock01 = mocks.find((m) => m.id === 'mock-01');

/* ---------------- Ánh xạ phương án → id ---------------- */

test('ánh xạ phương án: dạng chia, -ying → -ie, số nhiều gốc, cụm có giới từ; từ ngoài web trả null', () => {
  const map = (o, t) => Srs.mapOptionToId(o, idx, t || []);
  assert.equal(map('vilified'), 'vilify');
  assert.equal(map('belying'), 'belie');
  assert.equal(map('plaudit'), 'plaudits');
  assert.equal(map('glossed over'), 'gloss');
  assert.equal(map('touted'), 'tout');
  assert.equal(map('promoted'), null);
  assert.equal(map('brief'), null);
});

test('mọi câu có optionMap đủ phương án; optionWordIds + outsideWords phủ hết phương án', () => {
  idx.allExercises.forEach((ex) => {
    const opts = Srs.exerciseOptions(ex);
    assert.deepEqual(Object.keys(ex.optionMap).sort(), [...new Set(opts)].sort(), ex.id);
    opts.forEach((o) => {
      const id = ex.optionMap[o];
      if (id) assert.ok(ex.optionWordIds.includes(id) && idx.byId[id], ex.id + ': ' + o);
      else assert.ok(ex.outsideWords.includes(o), ex.id + ': ' + o);
    });
    // đáp án ánh xạ được luôn nằm trong optionWordIds
    ex.answerIds.forEach((id) => assert.ok(ex.optionWordIds.includes(id), ex.id + ' answer ' + id));
  });
});

test('relatedGroups: nhóm của các từ trong phương án (kể cả phương án nhiễu), không trùng', () => {
  const ex = idx.exById.pc111; // vilified / deprecated / belittled / reproved / admonished
  assert.deepEqual(ex.optionWordIds.sort(), ['admonish', 'belittle', 'deprecate', 'reprove', 'vilify']);
  const want = [...new Set(ex.optionWordIds.map((id) => idx.byId[id].group))];
  assert.deepEqual(ex.relatedGroups.slice().sort(), want.sort());
  idx.allExercises.forEach((e) => {
    assert.equal(new Set(e.relatedGroups).size, e.relatedGroups.length, e.id);
    e.relatedGroups.forEach((g) => assert.ok(idx.groupById[g], e.id + ' nhóm ' + g));
    e.optionWordIds.forEach((id) => assert.ok(e.relatedGroups.includes(idx.byId[id].group), e.id + ' thiếu nhóm của ' + id));
  });
});

test('wrongAnswerIds: TC chỉ lấy chỗ trống sai; SE lấy đáp án không được chọn', () => {
  const tc = idx.exById.tc05; // effusive · tepid
  assert.deepEqual(Srs.wrongAnswerIds(tc, ['effusive', 'unstinting'], idx), ['tepid']);
  assert.deepEqual(Srs.wrongAnswerIds(tc, ['effusive', 'tepid'], idx), []);
  const se = idx.exById.se01; // extolling, lauding
  assert.deepEqual(Srs.wrongAnswerIds(se, ['lauding', 'touting'], idx), ['extol']);
  assert.deepEqual(Srs.wrongAnswerIds(idx.exById.pc111, ['belittled'], idx), ['vilify']);
});

/* ---------------- Phân loại, bộ lọc, ngân hàng câu ---------------- */

test('ngân hàng câu: 222 câu = 113 TC1 + 32 TC2 + 5 TC3 + 72 SE; tổng theo cụm khớp', () => {
  const b = B.bankTable(idx);
  assert.deepEqual(b.total, { tc1: 113, tc2: 32, tc3: 5, se: 72, total: 222 });
  assert.equal(b.rows.length, 16);
  assert.equal(b.rows.reduce((a, r) => a + r.total, 0), 222);
  b.rows.forEach((r) => assert.equal(r.tc1 + r.tc2 + r.tc3 + r.se, r.total));
});

test('bộ lọc: TC 3 chỗ trống ra đúng câu có 3 cột; kỹ năng Nghĩa phụ có co102, co109; câu mới; độ khó; nhóm', () => {
  const all = idx.exercises;
  const tc3 = B.filterExercises(all, { kinds: ['tc3'] });
  assert.equal(tc3.length, 5);
  assert.ok(tc3.every((e) => e.type === 'tc' && e.blanks.length === 3));
  const sec = B.filterExercises(all, { skills: ['secondary-meaning'] }).map((e) => e.id);
  assert.ok(sec.includes('co102') && sec.includes('co109'), sec.join(','));
  const fresh = B.filterExercises(all, { onlyNew: true });
  assert.equal(fresh.length, 67);
  assert.ok(fresh.every((e) => /^(pc1|co1|sy1|wc1)/.test(e.id)));
  const hard = B.filterExercises(all, { diffs: [3] });
  assert.ok(hard.some((e) => e.id === 'pc114') && hard.every((e) => e.difficulty === 3));
  // nhiều kỹ năng: câu có ít nhất một kỹ năng đã chọn
  const two = B.filterExercises(all, { skills: ['lookalike', 'collocation'] });
  assert.ok(two.every((e) => e.skills.includes('lookalike') || e.skills.includes('collocation')));
  assert.equal(two.length, all.filter((e) => e.skills.includes('lookalike') || e.skills.includes('collocation')).length);
  const g = idx.byId.vilify.group;
  const useG = B.filterExercises(all, { group: g });
  assert.ok(useG.some((e) => e.id === 'pc111') && useG.every((e) => e.relatedGroups.includes(g)));
  // kết hợp điều kiện
  assert.ok(B.filterExercises(all, { kinds: ['se'], diffs: [1, 2], onlyNew: true }).every((e) => e.type === 'se' && e.difficulty < 3 && e.addedIn === 'batch-01'));
});

test('mọi câu đều có difficulty, skills, addedIn hợp lệ', () => {
  idx.allExercises.forEach((e) => {
    assert.ok([1, 2, 3].includes(e.difficulty), e.id);
    assert.ok(Array.isArray(e.skills) && e.skills.length && e.skills.every((k) => B.SKILLS[k]), e.id);
    assert.ok(['base', 'batch-01'].includes(e.addedIn), e.id);
  });
  assert.deepEqual(validateExercise(Object.assign({}, idx.exById.pc114, { difficulty: 5 })), ['Độ khó phải là 1 (dễ), 2 (vừa) hoặc 3 (khó)']);
});

/* ---------------- Từ vựng cần biết ---------------- */

test('vocabNeeded: nhóm sắp theo số câu dùng tới giảm dần; đếm từ đã học theo tiến độ; từ ngoài web', () => {
  const exs = idx.exercises.filter((e) => e.clusterId === 'praise-criticism');
  const progress = { vilify: { box: 2 }, belittle: { box: 0 } };
  const v = B.vocabNeeded(exs, idx, progress);
  const counts = v.groups.map((g) => g.nEx);
  assert.deepEqual(counts, counts.slice().sort((a, b) => b - a));
  // mỗi nhóm: số câu = số câu có nhóm đó trong relatedGroups
  v.groups.forEach((g) => assert.equal(g.nEx, exs.filter((e) => e.relatedGroups.includes(g.id)).length, g.id));
  const all = new Set(exs.flatMap((e) => e.relatedGroups));
  assert.deepEqual(new Set(v.groups.map((g) => g.id)), all);
  const gv = v.groups.find((g) => g.id === idx.byId.vilify.group);
  assert.ok(gv.learned >= 1 && gv.total >= gv.learned);
  assert.ok(v.outside.includes('promoted'));
});

/* ---------------- Giữ câu cho đề cố định chưa làm ---------------- */

test('giữ câu: đề chưa làm thì giữ đủ 27 câu; làm xong (mode fixed) thì nhả; thi thử ngẫu nhiên không tính', () => {
  assert.equal(B.heldExerciseIds(mocks, new Set()).size, 27);
  assert.equal(B.heldExerciseIds(mocks, B.doneFixedIds(null)).size, 27, 'chưa tải lịch sử: vẫn giữ');
  assert.equal(B.heldExerciseIds(mocks, B.doneFixedIds([{ mode: 'full', mockId: 'mock-01' }])).size, 27);
  assert.equal(B.heldExerciseIds(mocks, B.doneFixedIds([{ mode: 'fixed', mockId: 'mock-01' }])).size, 0);
  const held = B.heldExerciseIds(mocks, new Set());
  mock01.sections.forEach((s) => s.items.forEach((id) => assert.ok(held.has(id))));
});

/* ---------------- Chèn thẻ ôn nhanh ---------------- */

test('chèn thẻ ôn nhanh: sau 3–5 thẻ; hộp 0–2 → Nghĩa → Từ, hộp ≥ 3 → Từ → Nghĩa; mỗi từ tối đa một lần', () => {
  for (let seed = 1; seed < 40; seed++) {
    const cards = Array.from({ length: 12 }, (_, k) => ({ type: 'gre', exId: 'x' + k }));
    const used = new Set();
    const boxes = { vilify: 1, laud: 4 };
    const added = B.insertQuickCards(cards, 2, ['vilify', 'laud'], (id) => boxes[id], used, seq(seed));
    assert.equal(added.length, 2);
    const pv = cards.findIndex((c) => c.quick && c.wordId === 'vilify');
    const pl = cards.findIndex((c) => c.quick && c.wordId === 'laud');
    const between = (p) => cards.slice(3, p).filter((c) => !c.quick).length; // thẻ thường giữa câu sai (vị trí 2) và thẻ ôn nhanh
    assert.ok(between(pv) >= 3 && between(pv) <= 5, 'vilify sau ' + between(pv) + ' thẻ');
    assert.ok(between(pl) >= 3 && between(pl) <= 5, 'laud sau ' + between(pl) + ' thẻ');
    assert.equal(cards[pv].type, 'm2w');
    assert.equal(cards[pl].type, 'w2m');
    // sai lại cùng từ trong phiên: không chèn thêm
    assert.equal(B.insertQuickCards(cards, 5, ['vilify'], () => 0, used, seq(seed)).length, 0);
    assert.equal(cards.filter((c) => c.quick).length, 2);
  }
  // gần cuối phiên: thẻ ôn nhanh nằm cuối hàng
  const short = [{ type: 'gre' }, { type: 'gre' }];
  B.insertQuickCards(short, 1, ['vilify'], () => 0, new Set(), () => 0);
  assert.equal(short[2].wordId, 'vilify');
});

test('câu khác có cùng từ: chỉ câu có từ trong targets, chưa làm trong phiên, không thuộc câu đang giữ', () => {
  const used = new Set(['pc111']);
  const list = B.otherExercisesFor(['vilify'], idx.exercises, used, new Set());
  assert.ok(list.length > 0);
  assert.ok(list.every((e) => e.id !== 'pc111' && e.targets.includes('vilify')));
  const skip = new Set(list.map((e) => e.id));
  assert.deepEqual(B.otherExercisesFor(['vilify'], idx.exercises, used, skip), []);
});

/* ---------------- Đề cố định ---------------- */

test('đề cố định mock-01 hợp lệ: 12 + 15 câu, 18 + 23 phút, không lặp, câu đều tồn tại', () => {
  assert.deepEqual(validateMock(mock01, { file: 'mock-01.json', hasExercise: (id) => !!idx.exById[id], hasCluster: (id) => !!idx.clusterById[id] }), []);
  assert.deepEqual(mock01.sections.map((s) => [s.items.length, s.minutes]), [[12, 18], [15, 23]]);
  const bad = JSON.parse(JSON.stringify(mock01));
  bad.sections[1].items.push(bad.sections[0].items[0], 'khong-co');
  bad.sections[0].minutes = 0;
  const errs = validateMock(bad, { file: 'mock-01.json', hasExercise: (id) => !!idx.exById[id] });
  assert.ok(errs.some((e) => /bị lặp/.test(e)) && errs.some((e) => /không tồn tại/.test(e)) && errs.some((e) => /minutes/.test(e)), errs.join('\n'));
});
