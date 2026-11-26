// Kiểm tra độc lập bộ sinh Quant: mỗi mẫu sinh nhiều lần, đáp án được tính lại bằng vét cạn hoặc công thức riêng
// (không dùng lại logic của mẫu), cộng với cấu trúc câu và bộ câu hằng ngày.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Q from '../assets/quant.js';

const N = 400;
const rel = (a, b) => (Math.abs(a - b) < 1e-9 ? 'C' : a > b ? 'A' : 'B');
/** Đáp án QC từ tập các quan hệ quan sát được: một loại duy nhất thì là loại đó, nhiều loại thì D. */
const fromSet = (set) => (set.size === 1 ? [...set][0] : 'D');
const gridOpen = (lo, hi, steps = 400) => Array.from({ length: steps - 1 }, (_, i) => lo + (hi - lo) * (i + 1) / steps);

const items = (tpl) => Array.from({ length: N }, (_, i) => Q.makeItem(tpl, 1000 + i * 7919));

test('cấu trúc mọi mẫu: dạng, chủ đề, bẫy, phương án, đáp án', () => {
  Q.TEMPLATE_IDS.forEach((tpl) => items(tpl).forEach((it) => {
    const w = tpl + '#' + it.seed;
    assert.ok(Q.TOPICS[it.topic], w + ' topic');
    assert.ok(Q.TRAPS[it.trap], w + ' trap');
    assert.ok(it.stem && it.explain && it.tip, w + ' text');
    if (it.fmt === 'qc') { assert.ok('ABCD'.includes(it.answer) && it.answer.length === 1, w); assert.ok(it.qa && it.qb, w); }
    else if (it.fmt === 'mc') { assert.equal(it.options.length, 5, w); assert.equal(new Set(it.options).size, 5, w + ' trùng phương án'); assert.ok(it.options.includes(it.answer), w); }
    else if (it.fmt === 'multi') { assert.equal(new Set(it.options).size, it.options.length, w); assert.ok(it.answer.length >= 1 && it.answer.every((a) => it.options.includes(a)), w); }
    else if (it.fmt === 'num') { assert.ok(Number.isInteger(it.answer.n) && Number.isInteger(it.answer.d) && it.answer.d > 0, w); }
    else assert.fail(w + ' fmt');
  }));
});

test('unitInterval: vét cạn trên miền', () => {
  items('unitInterval').forEach((it) => {
    const { dom, f, swap } = it.check;
    let xs = dom.startsWith('0') ? gridOpen(0, 1) : gridOpen(-1, 1);
    if (dom.includes('≠ 0')) xs = xs.filter((x) => Math.abs(x) > 1e-12);
    else if (dom.startsWith('−1')) xs.push(0);
    const set = new Set(xs.map((x) => { const [a, b] = f(x); return swap ? rel(b, a) : rel(a, b); }));
    assert.equal(it.answer, fromSet(set), it.stem + ' ' + it.qa + ' vs ' + it.qb);
  });
});

test('sumFixed: vét cạn x trong (0, k)', () => {
  items('sumFixed').forEach((it) => {
    const { k, v } = it.params;
    let xs = gridOpen(0, k, 800);
    if (v === 'pos') xs.push(k / 2);
    if (v === 'distinct') xs = xs.filter((x) => Math.abs(x - k / 2) > 1e-12);
    if (v === 'greater') xs = xs.filter((x) => x > k / 2 + 1e-12);
    const set = new Set(xs.map((x) => (v === 'greater' ? rel(x, k / 2) : rel(x * (k - x), +it.qb))));
    assert.equal(it.answer, fromSet(set), it.stem);
  });
});

test('countAbs và triangleCount: đếm bằng vét cạn', () => {
  items('countAbs').forEach((it) => {
    const { a, b, strict } = it.params;
    let c = 0; for (let x = -100; x <= 100; x++) if (strict ? Math.abs(x - a) < b : Math.abs(x - a) <= b) c++;
    assert.equal(it.answer, rel(c, +it.qb), it.stem);
  });
  items('triangleCount').forEach((it) => {
    const { a, b } = it.params;
    let c = 0; for (let x = 1; x <= 100; x++) if (a + b > x && a + x > b && b + x > a) c++;
    assert.equal(it.answer, rel(c, +it.qb), it.stem);
  });
});

test('sdAdd, meanMedian: tính lại trực tiếp', () => {
  const sd = (xs) => { const m = xs.reduce((p, q) => p + q, 0) / xs.length; return Math.sqrt(xs.reduce((p, q) => p + (q - m) ** 2, 0) / xs.length); };
  items('sdAdd').forEach((it) => {
    const { base, add } = it.params;
    assert.ok(it.stem.includes(base.join(', ')));
    assert.equal(it.answer, rel(sd(base.concat(add)), sd(base)), it.stem);
  });
  items('meanMedian').forEach((it) => {
    const s = it.data.slice().sort((p, q) => p - q);
    const mean = s.reduce((p, q) => p + q, 0) / s.length;
    assert.equal(it.answer, rel(mean, s[2]), it.stem);
  });
});

test('successive, squares, areaScale, avgSpeed', () => {
  items('successive').forEach((it) => { const { p, q } = it.params; assert.equal(it.answer, rel(100 * (100 + p) * (100 - q), 100 * 100 * 100)); });
  items('squares').forEach((it) => {
    const { v } = it.params;
    const pairs = [];
    for (let a = -6; a <= 6; a += 0.5) for (let b = -6; b <= 6; b += 0.5) {
      if (!(a > b)) continue;
      if (v === 'pos' && !(b > 0)) continue;
      if (v === 'neg' && !(0 > a)) continue;
      pairs.push(rel(a * a, b * b));
    }
    assert.equal(it.answer, fromSet(new Set(pairs)), it.stem);
  });
  items('areaScale').forEach((it) => { const { p } = it.params; assert.equal(it.answer, rel(((100 + p) ** 2 - 10000) / 100, 2 * p)); });
  items('avgSpeed').forEach((it) => {
    const { v1, v2 } = it.params;
    const d = 600; const avg = 2 * d / (d / v1 + d / v2);
    assert.equal(+it.qb, (v1 + v2) / 2);
    assert.equal(it.answer, rel(avg, +it.qb));
  });
});

test('remainder: vét cạn n', () => {
  items('remainder').forEach((it) => {
    const { m, rem, k } = it.params;
    const set = new Set();
    for (let n = 1; n <= 2000; n++) if (n % m === rem) set.add(rel(n % k, +it.qb));
    assert.equal(it.answer, fromSet(set), it.stem);
  });
});

test('mc: đáp án tính độc lập', () => {
  items('pctIncrease').forEach((it) => { const { o1, o2 } = it.params; assert.equal(it.answer, Math.round(100 * (o2 - o1) / o1 * 10) / 10 + '%'); });
  items('pctReverse').forEach((it) => { const { p } = it.params; assert.equal(it.answer, +(100 * p / (100 + p)).toFixed(2) + '%'); });
  items('handshake').forEach((it) => { const { n } = it.params; let c = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) c++; assert.equal(it.answer, String(c)); });
  items('lapLcm').forEach((it) => {
    const { a, b } = it.params;
    let t = 1; while (t % a || t % b) t++;
    assert.equal(+it.answer, t / 60, it.stem);
  });
});

test('num: phân số tính độc lập; multi: kiểm tra từng phương án', () => {
  items('workRate').forEach((it) => { const { a, b } = it.params; assert.ok(Math.abs(it.answer.n / it.answer.d - 1 / (1 / a + 1 / b)) < 1e-12); });
  items('noReplace').forEach((it) => { const { red, blue } = it.params; const n = red + blue; assert.ok(Math.abs(it.answer.n / it.answer.d - (red / n) * ((red - 1) / (n - 1))) < 1e-12); });
  items('divVar').forEach((it) => {
    const { k } = it.params;
    it.options.forEach((o) => assert.equal(it.answer.includes(o), (+o) ** 2 === k * +o, it.stem + ' ' + o));
  });
  items('absMulti').forEach((it) => {
    const { a, b } = it.params;
    const poss = new Set([a + b, a - b, -a + b, -a - b]);
    it.options.forEach((o) => assert.equal(it.answer.includes(o), poss.has(+o), it.stem + ' ' + o));
  });
});

test('parseNum và grade', () => {
  assert.equal(Q.parseNum('3/4'), 0.75);
  assert.equal(Q.parseNum('0,75'), 0.75);
  assert.equal(Q.parseNum(' -2 '), -2);
  assert.ok(Number.isNaN(Q.parseNum('1/0')));
  assert.ok(Number.isNaN(Q.parseNum('abc')));
  const it = { fmt: 'num', answer: { n: 10, d: 7 } };
  assert.ok(Q.grade(it, '10/7') && Q.grade(it, '20/14'));
  assert.ok(!Q.grade(it, '1.43'));
  assert.ok(Q.grade({ fmt: 'multi', answer: ['0', '3'] }, ['3', '0']));
  assert.ok(!Q.grade({ fmt: 'multi', answer: ['0', '3'] }, ['3']));
  assert.ok(Q.grade({ fmt: 'qc', answer: 'D' }, 'D'));
});

test('bộ câu hằng ngày: cố định theo seed, đủ dạng, không trùng mẫu; bẫy hay sai được ưu tiên', () => {
  const a = Q.dailySet('2026-11-27|u1|0', []), b = Q.dailySet('2026-11-27|u1|0', []);
  assert.deepEqual(a.map((x) => [x.tpl, x.stem]), b.map((x) => [x.tpl, x.stem]));
  for (let d = 1; d <= 60; d++) {
    const s = Q.dailySet('2026-12-' + d + '|u1|0', []);
    assert.equal(s.length, 4);
    assert.ok(s.filter((x) => x.fmt === 'qc').length >= 2);
    assert.ok(s.some((x) => x.fmt !== 'qc'));
    assert.equal(new Set(s.map((x) => x.tpl)).size, 4);
    const tc = {}; s.forEach((x) => { tc[x.topic] = (tc[x.topic] || 0) + 1; });
    assert.ok(Object.values(tc).every((n) => n <= 2));
  }
  const count = (hist, trap) => { let c = 0; for (let d = 0; d < 300; d++) c += Q.dailySet('d' + d + '|u|0', hist).filter((x) => x.trap === trap).length; return c; };
  const wrongHist = [{ day: 'x', items: Array.from({ length: 5 }, () => ({ tpl: 'remainder', trap: 'remainder', ok: false })) }];
  assert.ok(count(wrongHist, 'remainder') > count([], 'remainder') * 1.5);
  const st = Q.trapStats(wrongHist.concat([{ day: 'y', items: [{ tpl: 'remainder', trap: 'remainder', ok: true }] }]));
  assert.deepEqual(st.remainder, { n: 6, ok: 1, recentWrong: 4 });
  const ex = Q.exportSummary(wrongHist, 'Thịnh');
  assert.equal(ex.traps[0].trap, 'remainder');
  assert.equal(ex.recentMistakes.length, 5);
});

test('weightedAvg, sdConstant, ineqFlip: kiểm tra độc lập', () => {
  items('weightedAvg').forEach((it) => {
    const { n1, n2, m1, m2 } = it.params;
    const sum = []; for (let i = 0; i < n1; i++) sum.push(m1); for (let i = 0; i < n2; i++) sum.push(m2);
    assert.equal(it.answer, rel(sum.reduce((p, q) => p + q, 0) / sum.length, +it.qb), it.stem);
  });
  const sd = (xs) => { const m = xs.reduce((p, q) => p + q, 0) / xs.length; return Math.sqrt(xs.reduce((p, q) => p + (q - m) ** 2, 0) / xs.length); };
  items('sdConstant').forEach((it) => { const { base, T2 } = it.params; assert.equal(it.answer, rel(sd(T2), sd(base)), it.stem); });
  items('ineqFlip').forEach((it) => {
    const { a, b, c, strict, qb } = it.params;
    const set = new Set();
    for (let x = -30; x <= 30; x += 0.25) if (strict ? -a * x + b > c : -a * x + b >= c) set.add(rel(x, qb));
    assert.equal(it.answer, fromSet(set), it.stem + ' vs ' + qb);
  });
});

test('mẫu khó: isosceles, pctSymmetry, rootSigns, overlap, divisors, consecutive', () => {
  items('isosceles').forEach((it) => {
    const { a, b } = it.params;
    const per = new Set();
    for (const t of [[a, a, b], [a, b, b]]) { const [x, y, z] = t; if (x + y > z && x + z > y && y + z > x) per.add(x + y + z); }
    assert.equal(it.answer, fromSet(new Set([...per].map((P) => rel(P, +it.qb)))), it.stem);
  });
  items('pctSymmetry').forEach((it) => {
    const set = new Set();
    for (let x = 0.5; x < 50; x += 3.7) for (let y = 0.5; y < 50; y += 4.1) {
      const k = it.params.k;
      set.add(it.params.v === 'sym' ? rel(x / 100 * y, y / 100 * x) : rel(k * 10 / 100 * k * x, x / 100 * k * k * 10));
    }
    assert.equal(it.answer, fromSet(set));
  });
  items('rootSigns').forEach((it) => {
    const { a, y } = it.params;
    const xs = []; for (let x = -20; x <= 20; x++) if (x * x === a * a) xs.push(x);
    const ys = []; for (let v = -20; v <= 20; v++) if (v ** 3 === y ** 3) ys.push(v);
    const set = new Set(); xs.forEach((x) => ys.forEach((v) => set.add(rel(x, v))));
    assert.equal(it.answer, fromSet(set), it.stem);
  });
  items('overlap').forEach((it) => {
    const { n, A, B, qb } = it.params;
    const set = new Set();
    for (let both = 0; both <= Math.min(A, B); both++) if (A + B - both <= n) set.add(rel(both, qb));
    assert.equal(it.answer, fromSet(set), it.stem);
  });
  items('divisors').forEach((it) => {
    const { N } = it.params; let c = 0; for (let d = 1; d <= N; d++) if (N % d === 0) c++;
    assert.equal(it.answer, rel(c, +it.qb), it.stem);
  });
  items('consecutive').forEach((it) => {
    const { k } = it.params;
    for (let s0 = -10; s0 <= 10; s0++) {
      const xs = Array.from({ length: k }, (_, i) => s0 + i);
      const S = xs.reduce((p, q) => p + q, 0);
      const med = k % 2 ? xs[(k - 1) / 2] : (xs[k / 2 - 1] + xs[k / 2]) / 2;
      assert.equal(rel(med, S / k), it.answer);
    }
  });
});

test('đề hiển thị khớp tham số; unitInterval tính từ chữ hiển thị (không dùng hàm của mẫu)', () => {
  const F = { 'x²': (x) => x * x, '√x': (x) => Math.sqrt(x), '1/x': (x) => 1 / x, 'x³': (x) => x ** 3, x: (x) => x, '2x': (x) => 2 * x, 'x + 1': (x) => x + 1, 'x/(x + 1)': (x) => x / (x + 1), '1/2': () => 0.5 };
  items('unitInterval').forEach((it) => {
    assert.ok(F[it.qa] && F[it.qb], 'biểu thức lạ: ' + it.qa + ' / ' + it.qb);
    let xs = it.stem.startsWith('0') ? gridOpen(0, 1) : gridOpen(-1, 1);
    if (it.stem.includes('≠ 0')) xs = xs.filter((x) => Math.abs(x) > 1e-12); else if (it.stem.startsWith('−1')) xs.push(0);
    assert.equal(it.answer, fromSet(new Set(xs.map((x) => rel(F[it.qa](x), F[it.qb](x))))), it.stem + ' ' + it.qa + ' / ' + it.qb);
  });
  const has = (it, ...nums) => nums.forEach((n) => assert.ok((it.stem + ' ' + (it.qa || '') + ' ' + (it.qb || '')).includes(String(n)), it.tpl + ': thiếu ' + n + ' trong "' + it.stem + '"'));
  items('countAbs').forEach((it) => { has(it, it.params.b); if (it.params.a) has(it, Math.abs(it.params.a)); assert.ok(it.stem.includes(it.params.strict ? '<' : '≤')); });
  items('triangleCount').forEach((it) => has(it, it.params.a, it.params.b));
  items('sdAdd').forEach((it) => it.params.add.forEach((v) => has(it, v)));
  items('successive').forEach((it) => has(it, it.params.p + '%', it.params.q + '%'));
  items('remainder').forEach((it) => has(it, 'cho ' + it.params.m, 'dư ' + it.params.rem, 'cho ' + it.params.k));
  items('avgSpeed').forEach((it) => has(it, it.params.v1 + ' km/h', it.params.v2 + ' km/h'));
  items('workRate').forEach((it) => has(it, it.params.a + ' giờ', it.params.b + ' giờ'));
  items('noReplace').forEach((it) => has(it, it.params.red + ' bi đỏ', it.params.blue + ' bi xanh'));
  items('handshake').forEach((it) => has(it, it.params.n + ' người'));
  items('pctIncrease').forEach((it) => has(it, 'Online ' + it.params.o1, 'Online ' + it.params.o2));
  items('pctReverse').forEach((it) => has(it, it.params.p + '%'));
  items('areaScale').forEach((it) => has(it, it.params.p + '%'));
  items('divVar').forEach((it) => has(it, it.params.k + 'x'));
  items('absMulti').forEach((it) => has(it, '|x| = ' + it.params.a, '|y| = ' + it.params.b));
  items('weightedAvg').forEach((it) => { has(it, it.params.n1 + ' học sinh', it.params.m1, it.params.m2); assert.ok(it.params.m2 <= 100 && it.params.m1 <= 100); });
  items('ineqFlip').forEach((it) => has(it, '−' + it.params.a + 'x', it.params.c));
  items('isosceles').forEach((it) => has(it, it.params.a + ' và ' + it.params.b));
  items('overlap').forEach((it) => has(it, it.params.n + ' sinh viên', it.params.A + ' người', it.params.B + ' người'));
  items('divisors').forEach((it) => has(it, 'N = ' + it.params.N));
  items('lapLcm').forEach((it) => assert.ok(!it.stem.includes('0 phút')));
});
