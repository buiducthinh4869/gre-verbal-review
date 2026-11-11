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
const mock02 = mocks.find((m) => m.id === 'mock-02');
const mock03 = mocks.find((m) => m.id === 'mock-03');
const mock04 = mocks.find((m) => m.id === 'mock-04');

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

test('ngân hàng câu: 425 câu = 249 TC1 + 43 TC2 + 16 TC3 + 117 SE; tổng theo cụm khớp', () => {
  const b = B.bankTable(idx);
  assert.deepEqual(b.total, { tc1: 249, tc2: 43, tc3: 16, se: 117, total: 425 });
  assert.equal(b.rows.length, 16);
  assert.equal(b.rows.reduce((a, r) => a + r.total, 0), 425);
  b.rows.forEach((r) => assert.equal(r.tc1 + r.tc2 + r.tc3 + r.se, r.total));
});

test('bộ lọc: TC 3 chỗ trống ra đúng câu có 3 cột; kỹ năng Nghĩa phụ có co102, co109; câu mới; độ khó; nhóm', () => {
  const all = idx.exercises;
  const tc3 = B.filterExercises(all, { kinds: ['tc3'] });
  assert.equal(tc3.length, 16);
  assert.ok(['ha117', 'bd115', 'sr118', 'lf117', 'hm118', 'cc118', 'ss113', 'ah120'].every((id) => tc3.some((e) => e.id === id)));
  assert.ok(tc3.every((e) => e.type === 'tc' && e.blanks.length === 3));
  const sec = B.filterExercises(all, { skills: ['secondary-meaning'] }).map((e) => e.id);
  assert.ok(sec.includes('co102') && sec.includes('co109'), sec.join(','));
  const fresh = B.filterExercises(all, { onlyNew: true });
  assert.equal(fresh.length, 270);
  assert.ok(fresh.every((e) => /^(pc1|co1|sy1|wc1|ma1|hp1|on1|hd1|ha1|bd1|sr1|lf1|hm1|cc1|ss1|ah1)/.test(e.id)));
  assert.equal(fresh.filter((e) => e.addedIn === 'batch-02').length, 67);
  assert.equal(fresh.filter((e) => e.addedIn === 'batch-03').length, 67);
  assert.equal(fresh.filter((e) => e.addedIn === 'batch-04').length, 69);
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
  assert.ok(B.filterExercises(all, { kinds: ['se'], diffs: [1, 2], onlyNew: true }).every((e) => e.type === 'se' && e.difficulty < 3 && /^batch-0[1234]$/.test(e.addedIn)));
});

test('mọi câu đều có difficulty, skills, addedIn hợp lệ', () => {
  idx.allExercises.forEach((e) => {
    assert.ok([1, 2, 3].includes(e.difficulty), e.id);
    assert.ok(Array.isArray(e.skills) && e.skills.length && e.skills.every((k) => B.SKILLS[k]), e.id);
    assert.ok(['base', 'batch-01', 'batch-02', 'batch-03', 'batch-04'].includes(e.addedIn), e.id);
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

test('giữ câu: đề chưa làm thì giữ đủ 27 câu mỗi đề; làm xong (mode fixed) thì nhả; thi thử ngẫu nhiên không tính', () => {
  const done = (...ids) => B.doneFixedIds(ids.map((mockId) => ({ mode: 'fixed', mockId })));
  const items = (m) => m.sections.flatMap((s) => s.items);
  assert.equal(B.heldExerciseIds(mocks, new Set()).size, 108);
  assert.equal(B.heldExerciseIds(mocks, B.doneFixedIds(null)).size, 108, 'chưa tải lịch sử: vẫn giữ');
  assert.equal(B.heldExerciseIds(mocks, B.doneFixedIds([{ mode: 'full', mockId: 'mock-01' }])).size, 108);
  const only234 = B.heldExerciseIds(mocks, done('mock-01'));
  assert.equal(only234.size, 81);
  [mock02, mock03, mock04].forEach((m) => items(m).forEach((id) => assert.ok(only234.has(id), id)));
  const only34 = B.heldExerciseIds(mocks, done('mock-01', 'mock-02'));
  assert.equal(only34.size, 54);
  [mock03, mock04].forEach((m) => items(m).forEach((id) => assert.ok(only34.has(id), id)));
  const only4 = B.heldExerciseIds(mocks, done('mock-01', 'mock-02', 'mock-03'));
  assert.equal(only4.size, 27);
  items(mock04).forEach((id) => assert.ok(only4.has(id), id));
  assert.equal(B.heldExerciseIds(mocks, done('mock-01', 'mock-02', 'mock-03', 'mock-04')).size, 0);
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

test('đề cố định mock-02 hợp lệ: 12 + 15 câu từ cụm 5–8, không trùng câu nào với Đề 1', () => {
  assert.deepEqual(mockIndex.mocks, ['mock-01', 'mock-02', 'mock-03', 'mock-04']);
  assert.deepEqual(validateMock(mock02, { file: 'mock-02.json', hasExercise: (id) => !!idx.exById[id], hasCluster: (id) => !!idx.clusterById[id] }), []);
  assert.deepEqual(mock02.sections.map((s) => [s.items.length, s.minutes]), [[12, 18], [15, 23]]);
  const items1 = new Set(mock01.sections.flatMap((s) => s.items));
  const items2 = mock02.sections.flatMap((s) => s.items);
  assert.equal(items2.filter((id) => items1.has(id)).length, 0);
  items2.forEach((id) => assert.ok(mock02.clusters.includes(idx.exById[id].clusterId), id));
});

test('đề cố định mock-03 hợp lệ: 12 + 15 câu từ cụm 9–12, không trùng câu nào với Đề 1 và Đề 2', () => {
  assert.deepEqual(validateMock(mock03, { file: 'mock-03.json', hasExercise: (id) => !!idx.exById[id], hasCluster: (id) => !!idx.clusterById[id] }), []);
  assert.deepEqual(mock03.sections.map((s) => [s.items.length, s.minutes]), [[12, 18], [15, 23]]);
  const before = new Set([mock01, mock02].flatMap((m) => m.sections.flatMap((s) => s.items)));
  const items3 = mock03.sections.flatMap((s) => s.items);
  assert.equal(items3.filter((id) => before.has(id)).length, 0);
  assert.deepEqual(mock03.clusters, ['humble-arrogant', 'belief-doubt', 'support-refute', 'lasting-fleeting']);
  items3.forEach((id) => assert.ok(mock03.clusters.includes(idx.exById[id].clusterId), id));
});

test('đề cố định mock-04 hợp lệ: 12 + 15 câu từ cụm 13–16, không trùng câu nào với Đề 1–3', () => {
  assert.deepEqual(validateMock(mock04, { file: 'mock-04.json', hasExercise: (id) => !!idx.exById[id], hasCluster: (id) => !!idx.clusterById[id] }), []);
  assert.deepEqual(mock04.sections.map((s) => [s.items.length, s.minutes]), [[12, 18], [15, 23]]);
  const before = new Set([mock01, mock02, mock03].flatMap((m) => m.sections.flatMap((s) => s.items)));
  const items4 = mock04.sections.flatMap((s) => s.items);
  assert.equal(new Set(items4).size, 27);
  assert.equal(items4.filter((id) => before.has(id)).length, 0);
  assert.deepEqual(mock04.clusters, ['harsh-mild', 'careful-careless', 'secret-showy', 'amount-harm']);
  items4.forEach((id) => assert.ok(mock04.clusters.includes(idx.exById[id].clusterId), id));
});
