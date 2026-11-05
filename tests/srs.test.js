// Test logic ôn tập phía client (assets/*.js là ES module thuần, chạy được bằng node).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Srs, idx, vocab, seq } from './fixture.js';

const T0 = '2026-11-04';
const iso = (d, h = 9) => `${d}T0${h}:00:00.000Z`;

/* ---------------- Ngày ---------------- */

test('vnDate dùng giờ Việt Nam (UTC+7)', () => {
  assert.equal(Srs.vnDate(Date.parse('2026-11-04T16:59:00Z')), '2026-11-04');
  assert.equal(Srs.vnDate(Date.parse('2026-11-04T17:00:00Z')), '2026-11-05');
  assert.equal(Srs.addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(Srs.daysBetween('2026-11-04', '2026-12-18'), 44);
});

/* ---------------- Leitner ---------------- */

test('khoảng cách theo hộp: 1, 3, 7, 14, 30 ngày; hộp 5 đúng thì hẹn 60 ngày', () => {
  let s = Srs.newState('laud');
  const expected = [[1, 1], [2, 3], [3, 7], [4, 14], [5, 30], [5, 60]];
  let day = T0;
  expected.forEach(([box, gap]) => {
    s = Srs.applyResult(s, 'good', day, iso(day));
    assert.equal(s.box, box);
    assert.equal(s.dueDate, Srs.addDays(day, gap));
    day = s.dueDate;
  });
  assert.equal(s.correctStreak, 6);
  assert.equal(s.totalReviews, 6);
});

test('Chưa nhớ: về hộp 1, lapses + 1, streak = 0, đến hạn hôm nay', () => {
  let s = Object.assign(Srs.newState('laud'), { box: 3, correctStreak: 2, dueDate: T0, lastMoved: '2026-10-28' });
  s = Srs.applyResult(s, 'again', T0, iso(T0));
  assert.equal(s.box, 1);
  assert.equal(s.lapses, 1);
  assert.equal(s.correctStreak, 0);
  assert.equal(s.dueDate, T0);
  assert.equal(s.lastResult, 'again');
});

test('lần gặp đầu (hộp 0) sai thì vào hộp 1 nhưng không tính là quên', () => {
  const s = Srs.applyResult(Srs.newState('laud'), 'again', T0, iso(T0));
  assert.equal(s.box, 1);
  assert.equal(s.lapses, 0);
  assert.equal(s.dueDate, T0);
});

test('Tạm: giữ hộp (tối thiểu 1), đến hạn ngày mai, streak không đổi', () => {
  let s = Object.assign(Srs.newState('laud'), { box: 3, correctStreak: 2, dueDate: T0, lastMoved: '2026-10-28' });
  s = Srs.applyResult(s, 'hard', T0, iso(T0));
  assert.equal(s.box, 3);
  assert.equal(s.dueDate, '2026-11-05');
  assert.equal(s.correctStreak, 2);
  const s0 = Srs.applyResult(Srs.newState('tout'), 'hard', T0, iso(T0));
  assert.equal(s0.box, 1);
  assert.equal(s0.dueDate, '2026-11-05');
});

test('mỗi từ chỉ lên hộp tối đa một lần mỗi ngày', () => {
  let s = Object.assign(Srs.newState('laud'), { box: 2, dueDate: T0, lastMoved: '2026-11-01' });
  s = Srs.applyResult(s, 'good', T0, iso(T0, 1));
  assert.equal(s.box, 3);
  const due = s.dueDate;
  s = Srs.applyResult(s, 'good', T0, iso(T0, 2));
  assert.equal(s.box, 3, 'không lên thêm trong cùng ngày');
  assert.equal(s.dueDate, due);
  assert.equal(s.totalReviews, 2);
  assert.equal(s.correctStreak, 1);
  // ngày hôm sau thì lên tiếp
  s = Srs.applyResult(s, 'good', '2026-11-05', iso('2026-11-05'));
  assert.equal(s.box, 4);
});

test('quên rồi trả lời đúng trong cùng ngày: vẫn hộp 1, hẹn ngày mai', () => {
  let s = Object.assign(Srs.newState('laud'), { box: 3, dueDate: T0, lastMoved: '2026-10-28' });
  s = Srs.applyResult(s, 'again', T0, iso(T0, 1));
  s = Srs.applyResult(s, 'good', T0, iso(T0, 2));
  assert.equal(s.box, 1);
  assert.equal(s.dueDate, '2026-11-05');
  assert.equal(Srs.isDue(s, T0), false);
});

test('sổ từ hay quên: vào khi sai 2 lần, rời khi đúng 3 lần liên tiếp trên nhiều ngày', () => {
  let s = Object.assign(Srs.newState('laud'), { box: 2, dueDate: T0, lastMoved: '2026-11-01' });
  s = Srs.applyResult(s, 'again', T0, iso(T0, 1));
  assert.equal(s.lapses, 1);
  assert.equal(Srs.isLeech(s), true, 'vừa quên (again) và lapses ≥ 1');
  s = Srs.applyResult(s, 'good', T0, iso(T0, 2));
  assert.equal(Srs.isLeech(s), false, 'lapses = 1, đã trả lời đúng');
  s = Srs.applyResult(s, 'again', '2026-11-05', iso('2026-11-05', 1));
  assert.equal(s.lapses, 2);
  assert.equal(Srs.isLeech(s), true);
  // ba lần đúng trong cùng một ngày chỉ tính một bước streak
  for (let k = 2; k <= 4; k++) s = Srs.applyResult(s, 'good', '2026-11-05', iso('2026-11-05', k));
  assert.equal(s.correctStreak, 0);
  assert.equal(Srs.isLeech(s), true);
  let day = '2026-11-06';
  for (let k = 0; k < 3; k++) {
    s = Srs.applyResult(s, 'good', day, iso(day));
    day = Srs.addDays(day, 1);
  }
  assert.equal(s.correctStreak, 3);
  assert.equal(Srs.isLeech(s), false);
  assert.equal(s.box, 4);
  assert.equal(Srs.statusOf(s), 'known');
});

test('một từ mới sai 2 lần trong một phiên thì vào sổ', () => {
  let s = Srs.applyResult(Srs.newState('cavil'), 'again', T0, iso(T0, 1));
  s = Srs.applyResult(s, 'again', T0, iso(T0, 2));
  assert.equal(Srs.isLeech(s), true);
});

test('confusedWith: mới nhất lên đầu, không trùng, tối đa 5', () => {
  let s = Srs.newState('laud');
  ['a', 'b', 'c', 'd', 'e', 'f', 'b', 'laud'].forEach((x) => { s = Srs.addConfusion(s, x, iso(T0)); });
  assert.deepEqual(s.confusedWith, ['b', 'f', 'e', 'd', 'c']);
});

test('gộp trạng thái: updatedAt mới hơn thắng', () => {
  const a = { wordId: 'x', box: 2, updatedAt: '2026-11-04T01:00:00.000Z' };
  const b = { wordId: 'x', box: 1, updatedAt: '2026-11-04T02:00:00.000Z' };
  assert.equal(Srs.newer(a, b), b);
  assert.equal(Srs.newer(b, a), b);
  assert.equal(Srs.newer(null, a), a);
});

test('normalizeState đọc được dòng từ Sheet (chuỗi)', () => {
  const s = Srs.normalizeState({ wordId: 'laud', box: '3', dueDate: '2026-11-10', lapses: '1', confusedWith: 'tout, commend', lastResult: 'good' });
  assert.equal(s.box, 3);
  assert.equal(s.lapses, 1);
  assert.deepEqual(s.confusedWith, ['tout', 'commend']);
});

/* ---------------- Phiên ôn hôm nay ---------------- */

test('phiên hôm nay: sổ hay quên trước, hộp thấp trước, từ mới cuối, tối đa 40', () => {
  const states = {
    laud: Object.assign(Srs.newState('laud'), { box: 3, dueDate: T0 }),
    tout: Object.assign(Srs.newState('tout'), { box: 1, dueDate: '2026-11-03' }),
    extol: Object.assign(Srs.newState('extol'), { box: 2, dueDate: T0, lapses: 2 }),
    commend: Object.assign(Srs.newState('commend'), { box: 2, dueDate: '2026-11-09' }),
  };
  const q = Srs.buildDailyQueue(idx, states, { today: T0, newLimit: 10, newDoneToday: 0 });
  assert.deepEqual(q.items.slice(0, 3).map((x) => x.wordId), ['extol', 'tout', 'laud']);
  assert.equal(q.dueCount, 3);
  assert.equal(q.newCount, 10);
  assert.ok(q.items.slice(3).every((x) => x.isNew));
  // từ mới: theo cụm, priority 3 trước, theo thứ tự file
  const firstNew = idx.byId[q.items[3].wordId];
  assert.equal(firstNew.priority, 3);
  const q2 = Srs.buildDailyQueue(idx, states, { today: T0, newLimit: 10, newDoneToday: 7 });
  assert.equal(q2.newCount, 3);
  const many = {};
  idx.words.forEach((w) => { many[w.id] = Object.assign(Srs.newState(w.id), { box: 1, dueDate: T0 }); });
  const q3 = Srs.buildDailyQueue(idx, many, { today: T0, newLimit: 10, newDoneToday: 0 });
  assert.equal(q3.items.length, 40);
  assert.equal(q3.total, 62);
});

test('chuỗi ngày ôn', () => {
  assert.equal(Srs.streakDays(['2026-11-02', '2026-11-03', '2026-11-04'], T0), 3);
  assert.equal(Srs.streakDays(['2026-11-02', '2026-11-03'], T0), 2, 'hôm nay chưa ôn vẫn giữ chuỗi');
  assert.equal(Srs.streakDays(['2026-11-01'], T0), 0);
});

/* ---------------- Ánh xạ phương án GRE ---------------- */

test('ánh xạ phương án GRE về id từ', () => {
  const cases = {
    lauded: 'laud', lauding: 'laud', touted: 'tout', extolled: 'extol', extolling: 'extol',
    lionized: 'lionize', eulogizing: 'eulogize', censuring: 'censure', castigating: 'castigate',
    'self-deprecating': 'deprecate', deprecated: 'deprecate', disparaging: 'disparage',
    'scoffed at': 'scoff', 'quibbled with': 'quibble', 'carped about': 'carp', 'carp at': 'carp',
    upbraided: 'berate', pilloried: 'pillory', decried: 'decry', cavils: 'cavil', rebukes: 'rebuke',
    reproaches: 'reproach', encomiums: 'encomium', 'an encomium': 'encomium', 'a panegyric': 'panegyric',
    'a backhanded compliment': 'backhanded', unstinting: 'unqualified', unqualified: 'unqualified',
    qualified: 'qualified', idolized: 'idolize', revered: 'revere', venerated: 'venerate', muted: 'muted',
    admonished: 'admonish', reproved: 'reprove', lambasted: 'lambaste', excoriated: 'excoriate',
    derided: 'deride', ridiculed: 'ridicule', commended: 'commend', applauded: 'applaud',
  };
  Object.entries(cases).forEach(([opt, id]) => assert.equal(Srs.mapOptionToId(opt, idx, []), id, opt));
  ['question', 'gushing', 'derisive', 'venerable', 'a eulogy'].forEach((opt) => {
    assert.equal(Srs.mapOptionToId(opt, idx, []), null, opt);
  });
});

test('mọi đáp án GRE trong dữ liệu đều ánh xạ được về id (trừ từ ngoài dữ liệu)', () => {
  const outside = { se02: ['question'] }; // "question" không phải một từ trong dữ liệu
  idx.exercises.forEach((ex) => {
    const answers = ex.type === 'se' ? ex.answers : ex.blanks.map((b) => b.answer);
    const n = answers.filter((a) => !(outside[ex.id] || []).includes(a)).length;
    assert.equal(ex.answerIds.length, n, `${ex.id}: ${ex.answerIds}`);
  });
});

test('chấm TC 2 chỗ trống: chỉ đúng khi cả hai đúng; ghi nhầm lẫn', () => {
  const ex = idx.exById.tc05;
  assert.equal(Srs.gradeExercise(ex, ['effusive', 'tepid'], idx).correct, true);
  const g = Srs.gradeExercise(ex, ['effusive', 'unstinting'], idx);
  assert.equal(g.correct, false);
  assert.deepEqual(g.answerIds, ['effusive', 'tepid']);
  assert.deepEqual(g.confusions, [{ wordId: 'tepid', confusedWith: 'unqualified' }]);
  assert.equal(Srs.gradeExercise(ex, ['fulsome', 'tepid'], idx).correct, false);
});

test('chấm SE: cần đúng cả 2; ghi nhầm lẫn; targets khác chỉ ghi lượt', () => {
  const ex = idx.exById.se01;
  assert.equal(Srs.gradeExercise(ex, ['extolling', 'lauding'], idx).correct, true);
  const g = Srs.gradeExercise(ex, ['lauding', 'touting'], idx);
  assert.equal(g.correct, false);
  assert.deepEqual(g.confusions, [{ wordId: 'extol', confusedWith: 'tout' }]);
  assert.deepEqual(g.otherTargetIds, ['eulogize']);
  assert.equal(Srs.gradeExercise(ex, ['lauding'], idx).correct, false);
});

test('chọn bài GRE cho từ: ưu tiên bài từ là đáp án, làm ít gần đây nhất', () => {
  const first = Srs.pickExerciseForWord('tout', idx, {});
  assert.ok(['tc06', 'tc17'].includes(first.id));
  const ex = Srs.pickExerciseForWord('tout', idx, { tc06: '2026-11-04T01:00:00Z' });
  assert.equal(ex.id, 'tc17');
  assert.equal(Srs.pickExerciseForWord('pillory', idx, {}).id, 'se04', 'chỉ có trong targets');
  assert.equal(Srs.pickExerciseForWord('homage', idx, {}), null);
});

/* ---------------- Render ---------------- */

test('renderMarkup escape HTML trước rồi mới chuyển * và **', () => {
  assert.equal(
    Srs.renderMarkup('The study was *lauded* **for** <b>x</b> & more'),
    'The study was <em class="target">lauded</em> <b class="coll">for</b> &lt;b&gt;x&lt;/b&gt; &amp; more'
  );
  assert.equal(Srs.renderMarkup('was *lauded* **for**', true), 'was <span class="blank">_____</span> <b class="coll">for</b>');
});

test('từ tự thêm tham gia chỉ mục và được giới thiệu trước', () => {
  const ix = Srs.buildIndex(vocab, [{ id: 'c-abc', word: 'panache', pos: 'n', priority: 2, meaning: 'phong thái tự tin' }]);
  assert.equal(ix.byId['c-abc'].clusterId, 'custom');
  const q = Srs.buildDailyQueue(ix, {}, { today: T0, newLimit: 3, newDoneToday: 0 });
  assert.equal(q.items[0].wordId, 'c-abc');
  assert.equal(Srs.pickDistractors(ix.byId['c-abc'], ix, 3, seq(3)).length, 3);
});

test('server (apps-script/Store.js) chuẩn hóa trạng thái và xét sổ hay quên giống hệt client', async () => {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const { makeEnv, loadServer } = require('./gas_mock.cjs');
  const env = makeEnv();
  loadServer(env);
  const rows = [
    { wordId: 'laud', box: '3', dueDate: '2026-11-10', lapses: '1', confusedWith: 'tout, commend', lastResult: 'again', updatedAt: 'x', lastMoved: '2026-11-01' },
    { wordId: 'tout', box: '9', dueDate: 'bad', lapses: '-2', correctStreak: '3', lastResult: 'meh' },
    { wordId: 'extol', box: '', lapses: '2', correctStreak: '1', confusedWith: '' },
  ];
  rows.forEach((r) => {
    const a = Srs.normalizeState(r);
    const b = JSON.parse(JSON.stringify(env.ctx.normalizeState_(r)));
    assert.deepEqual(b, a);
    assert.equal(env.ctx.isLeech_(b), Srs.isLeech(a));
  });
});
