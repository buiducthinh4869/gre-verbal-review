// Test module kiểm tra hợp lệ dùng chung (assets/validate.js) và việc ghép bản sửa lên dữ liệu gốc (assets/overrides.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as V from '../assets/validate.js';
import * as O from '../assets/overrides.js';
import { buildIndex } from '../assets/vocab.js';
import { pickDistractors } from '../assets/distractors.js';
import * as Mk from '../assets/mock.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/index.json'), 'utf8'));
const vocab = { clusters: index.clusters.map((id) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/clusters', id + '.json'), 'utf8'))) };
const snapshot = JSON.stringify(vocab);
const ids = new Set(vocab.clusters.flatMap((c) => c.words.map((w) => w.id)));
const hasWord = (id) => ids.has(id);
const words = vocab.clusters.flatMap((c) => c.words);
const exercises = vocab.clusters.flatMap((c) => c.exercises);
const se = () => JSON.parse(JSON.stringify(exercises.find((e) => e.type === 'se')));
const tc = (n) => JSON.parse(JSON.stringify(exercises.find((e) => e.type === 'tc' && e.blanks.length === n)));

test('mọi từ và mọi bài trong dữ liệu thật đều hợp lệ theo module dùng chung', () => {
  words.forEach((w) => assert.deepEqual(V.validateWord(w, { hasWord }), [], w.id));
  exercises.forEach((e) => assert.deepEqual(V.validateExercise(e, { hasWord }), [], e.id));
});

test('câu báo lỗi tiếng Việt rõ ràng cho các lỗi thường gặp', () => {
  const s = se();
  s.answers = [s.answers[0]];
  assert.ok(V.validateExercise(s, { hasWord }).some((m) => m.startsWith('Câu SE phải có đúng 6 phương án và đúng 2 đáp án')));
  const s2 = se();
  s2.answers = [s2.answers[0], 'khong-co'];
  assert.ok(V.validateExercise(s2, { hasWord }).includes('Đáp án phải nằm trong danh sách phương án'));
  const s3 = se();
  s3.options[1] = s3.options[0];
  assert.ok(V.validateExercise(s3, { hasWord }).some((m) => /bị trùng/.test(m)));
  const t2 = tc(2);
  t2.sentence = t2.sentence.replace('{1}', '___');
  assert.ok(V.validateExercise(t2, { hasWord }).some((m) => m.startsWith('`{0}` trong câu không khớp số chỗ trống')));
  const t1 = tc(1);
  t1.blanks[0].options.pop();
  assert.ok(V.validateExercise(t1, { hasWord }).some((m) => /cần đúng 5 phương án/.test(m)));
  const t3 = tc(3);
  t3.blanks[2].answer = 'zzz';
  assert.ok(V.validateExercise(t3, { hasWord }).some((m) => /Chỗ trống 3: đáp án phải nằm trong danh sách phương án/.test(m)));
  const w = Object.assign({}, words[0], { confusables: ['xyz'] });
  assert.deepEqual(V.validateWord(w, { hasWord }), ['Từ dễ nhầm `xyz` không tồn tại']);
  assert.deepEqual(V.validateWord(Object.assign({}, words[0], { meaning: '  ' }), { hasWord }), ['Nghĩa không được để trống']);
  assert.ok(V.validateWord(Object.assign({}, words[0], { priority: 4 })).includes('Mức ưu tiên phải là 1, 2 hoặc 3'));
  assert.ok(V.validateWord(Object.assign({}, words[0], { level: undefined }), { isScale: true }).some((m) => /thang/.test(m)));
  assert.deepEqual(V.validateFieldValue('word', 'group', 'x'), ['Trường "group" không được phép sửa']);
  assert.deepEqual(V.validateFieldValue('exercise', 'hidden', true), []);
});

test('ghép bản sửa: không đổi dữ liệu gốc; giá trị mới có ở chỉ mục; bỏ qua mục không có hoặc trường cấm', () => {
  const ov = [
    { t: 'word', id: 'fulsome', f: 'nuance', v: 'Sắc thái đã sửa', ver: 1 },
    { t: 'word', id: 'fulsome', f: 'collocations', v: ['fulsome praise'], ver: 1 },
    { t: 'word', id: 'khong-co', f: 'meaning', v: 'x', ver: 1 },
    { t: 'word', id: 'laud', f: 'group', v: 'x', ver: 1 }
  ];
  const merged = O.applyOverrides(vocab, ov);
  assert.equal(JSON.stringify(vocab), snapshot, 'dữ liệu gốc không bị sửa');
  const idx = buildIndex(merged, []);
  assert.equal(idx.byId.fulsome.nuance, 'Sắc thái đã sửa');
  assert.deepEqual(idx.byId.fulsome.collocations, ['fulsome praise']);
  assert.equal(idx.byId.laud.group, O.baseValue(vocab, 'word', 'laud', 'group'));
  assert.equal(O.currentValue(vocab, ov, 'word', 'fulsome', 'nuance'), 'Sắc thái đã sửa');
  assert.equal(O.currentValue(vocab, ov, 'word', 'laud', 'meaning'), O.baseValue(vocab, 'word', 'laud', 'meaning'));
  // giá trị trả về là bản sao: sửa nó không làm hỏng override
  O.currentValue(vocab, ov, 'word', 'fulsome', 'collocations').push('x');
  assert.deepEqual(ov[1].v, ['fulsome praise']);
});

test('bản sửa được dùng khi chấm điểm, sinh phương án nhiễu và thi thử; câu bị ẩn không còn được chọn', () => {
  const s = exercises.find((e) => e.type === 'se');
  const other = s.options.find((o) => !s.answers.includes(o));
  const ov = [
    { t: 'exercise', id: s.id, f: 'answers', v: [s.answers[0], other], ver: 1 },
    { t: 'word', id: 'laud', f: 'confusables', v: ['fulsome'], ver: 1 }
  ];
  const idx = buildIndex(O.applyOverrides(vocab, ov), []);
  assert.deepEqual(idx.exById[s.id].answers, [s.answers[0], other]);
  assert.equal(pickDistractors(idx.byId.laud, idx, 3, () => 0.5)[0], 'fulsome', 'từ dễ nhầm mới đứng đầu phương án nhiễu');
  const hidden = buildIndex(O.applyOverrides(vocab, [{ t: 'exercise', id: s.id, f: 'hidden', v: true, ver: 1 }]), []);
  assert.equal(hidden.exercises.some((e) => e.id === s.id), false, 'không còn trong luyện tập');
  assert.ok(hidden.exById[s.id], 'vẫn tra được (kết quả cũ, quản trị viên hiện lại)');
  assert.equal(hidden.allExercises.length, hidden.exercises.length + 1);
  for (let k = 0; k < 30; k++) {
    const picked = Mk.pickSection(hidden.exercises, 15, { exRes: {}, today: '2026-11-05', rng: Math.random });
    assert.equal(picked.includes(s.id), false, 'thi thử không lấy câu bị ẩn');
  }
});

test('bản sửa đã trùng dữ liệu gốc được nhận ra để đánh dấu đã đưa vào dữ liệu gốc', () => {
  const base = O.baseValue(vocab, 'word', 'laud', 'nuance');
  const ov = [{ t: 'word', id: 'laud', f: 'nuance', v: base, ver: 3 }, { t: 'word', id: 'extol', f: 'nuance', v: 'khác', ver: 1 }];
  assert.deepEqual(O.bakedOverrides(vocab, ov).map((o) => o.id), ['laud']);
  assert.equal(O.baseValue(vocab, 'exercise', exercises[0].id, 'hidden'), false);
});
