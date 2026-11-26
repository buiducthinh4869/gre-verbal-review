/**
 * quant.js: lõi Quant hằng ngày (thuần JavaScript, test bằng node: tests/quant.test.js).
 *  - Mẫu bài có tham số ngẫu nhiên; mỗi mẫu nhắm một kiểu bẫy hay gặp (theo The Official Guide và sổ lỗi của người học).
 *  - Bốn dạng như đề thật: qc (Quantitative Comparison), mc (chọn 1), multi (chọn mọi đáp án đúng), num (điền số / phân số).
 *  - Bộ câu hằng ngày cố định theo ngày và tài khoản (seed), ưu tiên bẫy hay sai.
 * Mỗi câu sinh ra: {tpl, topic, trap, fmt, stem, qa?, qb?, options?, answer, explain, tip}
 *   qc: answer là 'A' | 'B' | 'C' | 'D'; mc: answer là chuỗi phương án; multi: mảng phương án; num: {n, d} (giá trị n/d).
 */

/* ---------------- Ngẫu nhiên có seed ---------------- */
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    bool: () => next() < 0.5,
    shuffle: (arr) => { const a2 = arr.slice(); for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a2[i], a2[j]] = [a2[j], a2[i]]; } return a2; }
  };
}

/* ---------------- Tiện ích số ---------------- */
export const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
export const lcm = (a, b) => a / gcd(a, b) * b;
export function frac(n, d) { if (d < 0) { n = -n; d = -d; } const g = gcd(n, d) || 1; return { n: n / g, d: d / g }; }
export const fracStr = (f) => (f.d === 1 ? String(f.n) : f.n + '/' + f.d);
const fmtNum = (x) => (Number.isInteger(x) ? String(x) : String(+x.toFixed(4)));
/** Độ lệch chuẩn (theo định nghĩa của GRE: chia cho n). */
export function sd(xs) { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length); }
const median = (xs) => { const s = xs.slice().sort((a, b) => a - b); const k = s.length; return k % 2 ? s[(k - 1) / 2] : (s[k / 2 - 1] + s[k / 2]) / 2; };
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const cmp = (a, b, eps = 1e-9) => (a > b + eps ? 'A' : b > a + eps ? 'B' : 'C');

export const QC_CHOICES = {
  A: 'Quantity A is greater.',
  B: 'Quantity B is greater.',
  C: 'The two quantities are equal.',
  D: 'The relationship cannot be determined from the information given.'
};
export const FMT_LABEL = { qc: 'So sánh (QC)', mc: 'Chọn 1 đáp án', multi: 'Chọn mọi đáp án đúng', num: 'Điền số' };

export const TOPICS = { arith: 'Số học', alg: 'Đại số', pct: 'Phần trăm & tỉ lệ', word: 'Bài toán lời văn', geo: 'Hình học', data: 'Dữ liệu & xác suất' };

/** Kiểu bẫy: nhãn, mẹo tránh. prior: trọng số ban đầu (lấy từ sổ lỗi Notre Dame, 26/11/2026). */
export const TRAPS = {
  boundary: { label: 'Thử thiếu giá trị biên', tip: 'Với QC có miền như 0 < x < 1, thử hai số sát hai cận (0,01 và 0,99), cộng số âm, số 0, phân số nếu miền cho phép.', prior: 3 },
  equalcase: { label: 'Quên trường hợp bằng nhau', tip: 'Đề không nói khác nhau hay nguyên thì thử x = y và số không nguyên. Có thể bằng nhau thì đáp án thường là D.', prior: 3 },
  countvalues: { label: 'Hỏi số lượng, tính giá trị', tip: 'Gặp the number of thì viết lại: đếm có bao nhiêu giá trị. Kiểm tra dấu < hay ≤ ở hai đầu.', prior: 3 },
  sdshift: { label: 'Độ lệch chuẩn khi thêm điểm', tip: 'Thêm cặp mean ± d: SD tăng khi d > SD hiện tại, giảm khi d < SD. Thêm đúng giá trị mean: SD luôn giảm.', prior: 3 },
  pctbase: { label: 'Nhầm gốc phần trăm', tip: 'Phần trăm thay đổi = (mới − cũ) / cũ của CHÍNH đại lượng được hỏi. Gạch chân danh từ sau in; đừng dùng tỷ trọng hay điểm phần trăm.', prior: 3 },
  unitback: { label: 'Đổi đơn vị không đổi ngược', tip: 'Đổi sang đơn vị nhỏ để khử phân số thì ở bước cuối phải đổi về đơn vị đề hỏi.', prior: 3 },
  successive: { label: 'Cộng trừ phần trăm liên tiếp', tip: 'Tăng p% rồi giảm q% là nhân (1 + p)(1 − q), không phải cộng p − q.', prior: 1 },
  negatives: { label: 'Quên số âm', tip: 'a > b không suy ra a² > b². Bình phương, nghịch đảo, nhân với biến đều đổi chiều được khi có số âm.', prior: 1 },
  divbyvar: { label: 'Chia cho biến', tip: 'Không chia hai vế cho x khi x có thể bằng 0; đưa về tích bằng 0.', prior: 1 },
  remainder: { label: 'Số dư với số chia khác', tip: 'Biết số dư khi chia cho m chỉ suy ra số dư khi chia cho ước của m. Với số chia khác, thử vài giá trị.', prior: 1 },
  meanmedian: { label: 'Trung bình và trung vị', tip: 'Dữ liệu lệch có một giá trị rất lớn thì mean bị kéo về phía đó, median không.', prior: 1 },
  harmonic: { label: 'Tốc độ / năng suất trung bình', tip: 'Tốc độ trung bình = tổng quãng đường / tổng thời gian, không phải trung bình cộng hai tốc độ. Hai vòi cùng chảy: cộng năng suất 1/a + 1/b.', prior: 1 },
  replacement: { label: 'Có hoàn lại / không hoàn lại', tip: 'Rút không hoàn lại thì mẫu số và tử số lần sau đều giảm 1.', prior: 1 },
  overcount: { label: 'Đếm trùng', tip: 'Cặp không phân biệt thứ tự (bắt tay, nhóm 2 người) thì chia 2: n(n − 1)/2.', prior: 1 },
  scaling: { label: 'Phóng to diện tích', tip: 'Cạnh hay bán kính tăng k lần thì diện tích tăng k² lần; tăng p% thì diện tích tăng (1 + p)² − 1, không phải 2p.', prior: 1 },
  weighted: { label: 'Trung bình có trọng số', tip: 'Gộp hai nhóm khác cỡ: trung bình chung nghiêng về nhóm đông hơn, không phải trung bình cộng hai mean.', prior: 1 },
  ineqflip: { label: 'Đổi chiều bất đẳng thức', tip: 'Nhân hay chia hai vế cho số âm thì đổi chiều. Dấu ≤ cho phép bằng nên QC so với đầu mút thường là D.', prior: 1 },
  hiddendet: { label: 'Tưởng D nhưng xác định được', tip: 'Trước khi chọn D, kiểm tra xem điều kiện ẩn (tam giác hợp lệ, số nguyên, tính đối xứng) có loại hết các trường hợp khác không.', prior: 2 },
  signs: { label: 'Nghiệm âm và dương', tip: 'x² = k cho hai nghiệm ±√k; x³ = k chỉ cho một nghiệm cùng dấu với k. Đề không nói x > 0 thì phải xét cả nghiệm âm.', prior: 2 },
  overlap: { label: 'Hai tập giao nhau', tip: 'Biết |A|, |B| và tổng chỉ suy ra khoảng của phần giao: từ max(0, |A| + |B| − tổng) đến min(|A|, |B|).', prior: 2 },
  triangle: { label: 'Bất đẳng thức tam giác', tip: 'Cạnh thứ ba nằm giữa hiệu và tổng hai cạnh kia, không bằng hai đầu mút.', prior: 1 }
};

/* ---------------- Mẫu bài ---------------- */
const T = {};

// 1. 0 < x < 1 (hoặc −1 < x < 1): so sánh các lũy thừa
T.unitInterval = (r) => {
  const v = r.pick([
    { dom: '0 < x < 1', a: 'x²', b: 'x', f: (x) => [x * x, x], ans: 'B', why: 'Với 0 < x < 1, nhân x với chính nó (nhỏ hơn 1) làm x nhỏ đi: x² < x.' },
    { dom: '0 < x < 1', a: '√x', b: 'x', f: (x) => [Math.sqrt(x), x], ans: 'A', why: 'Với 0 < x < 1, căn bậc hai lớn hơn chính số đó: √0,25 = 0,5 > 0,25.' },
    { dom: '0 < x < 1', a: '1/x', b: 'x²', f: (x) => [1 / x, x * x], ans: 'A', why: '1/x > 1 còn x² < 1 trên cả miền.' },
    { dom: '0 < x < 1', a: 'x³', b: 'x²', f: (x) => [x ** 3, x * x], ans: 'B', why: 'x³ = x · x² < x² vì x < 1.' },
    { dom: '−1 < x < 1', a: 'x²', b: 'x', f: (x) => [x * x, x], ans: 'D', why: 'x = 0,5 cho x² < x, nhưng x = −0,5 cho x² > x; x = 0 cho bằng nhau.' },
    { dom: '−1 < x < 1, x ≠ 0', a: 'x³', b: 'x', f: (x) => [x ** 3, x], ans: 'D', why: 'x = 0,5: x³ < x; x = −0,5: x³ = −0,125 > −0,5.' },
    { dom: '0 < x < 1', a: '2x', b: 'x + 1', f: (x) => [2 * x, x + 1], ans: 'B', why: '2x − (x + 1) = x − 1 < 0 trên cả miền.' },
    { dom: '0 < x < 1', a: 'x/(x + 1)', b: '1/2', f: (x) => [x / (x + 1), 0.5], ans: 'B', why: 'x/(x + 1) < 1/2 ⇔ 2x < x + 1 ⇔ x < 1, luôn đúng.' }
  ]);
  const swap = r.bool();
  const ans = swap ? ({ A: 'B', B: 'A' }[v.ans] || v.ans) : v.ans;
  return {
    topic: 'alg', trap: 'boundary', fmt: 'qc', stem: v.dom, qa: swap ? v.b : v.a, qb: swap ? v.a : v.b, answer: ans,
    check: { dom: v.dom, f: v.f, swap },
    explain: v.why + (v.ans === 'D' ? ' Hai trường hợp cho hai kết quả khác nhau nên chọn D.' : ' Thử cả 0,01 và 0,99 để chắc kết quả không đổi trên cả miền.')
  };
};

// 2. x + y = k: tích xy so với (k/2)² (bẫy: có thể x = y)
T.sumFixed = (r) => {
  const k = r.pick([8, 10, 12, 14, 16, 20]);
  const v = r.pick(['pos', 'distinct', 'greater']);
  if (v === 'greater') {
    return {
      topic: 'alg', trap: 'equalcase', fmt: 'qc', stem: 'x + y = ' + k + ' và x > y', params: { k, v }, qa: 'x', qb: String(k / 2), answer: 'A',
      explain: 'x > y và x + y = ' + k + ' nên 2x > x + y = ' + k + ', suy ra x > ' + k / 2 + '. Ở đây có thêm điều kiện x > y nên loại được trường hợp bằng nhau.'
    };
  }
  const distinct = v === 'distinct';
  return {
    params: { k, v }, topic: 'alg', trap: 'equalcase', fmt: 'qc', stem: 'x và y là các số dương' + (distinct ? ' khác nhau' : '') + ', x + y = ' + k, qa: 'xy', qb: String(k * k / 4),
    answer: distinct ? 'B' : 'D',
    explain: 'Với tổng cố định, tích lớn nhất khi x = y = ' + k / 2 + ', lúc đó xy = ' + k * k / 4 + '. ' +
      (distinct ? 'Đề cho x ≠ y nên xy luôn nhỏ hơn ' + k * k / 4 + ': B.' : 'Đề KHÔNG cấm x = y, nên xy có thể bằng ' + k * k / 4 + ' hoặc nhỏ hơn: D. Đây đúng là bẫy đã gặp ở bài thi thử 26/11.')
  };
};

// 3. Đếm số nguyên thỏa |x − a| < b (hoặc ≤)
T.countAbs = (r) => {
  const a = r.int(-5, 9), b = r.int(3, 7);
  const strict = r.bool();
  const count = strict ? 2 * b - 1 : 2 * b + 1;
  const other = r.pick([2 * b, count, count + (r.bool() ? 1 : -1)]);
  const lo = strict ? a - b + 1 : a - b, hi = strict ? a + b - 1 : a + b;
  return {
    topic: 'arith', trap: 'countvalues', fmt: 'qc', stem: 'x là số nguyên và |' + (a === 0 ? 'x' : a < 0 ? 'x + ' + -a : 'x − ' + a) + '| ' + (strict ? '<' : '≤') + ' ' + b,
    params: { a, b, strict },
    qa: 'Số các giá trị có thể của x', qb: String(other), answer: cmp(count, other),
    explain: 'Quantity A là SỐ LƯỢNG giá trị, không phải giá trị của x. ' + a + ' − ' + b + ' ' + (strict ? '<' : '≤') + ' x ' + (strict ? '<' : '≤') + ' ' + a + ' + ' + b +
      ', nên x chạy từ ' + lo + ' đến ' + hi + ': có ' + count + ' số nguyên (' + (strict ? 'dấu < bỏ hai đầu mút' : 'dấu ≤ lấy cả hai đầu mút') + ').'
  };
};

// 4. Tam giác: số giá trị nguyên của cạnh thứ ba
T.triangleCount = (r) => {
  const a = r.int(3, 9), b = r.int(a + 1, a + 8);
  const count = 2 * a - 1; // b − a < c < a + b
  const other = r.pick([2 * a, count, 2 * a - 2, a + b - 1]);
  return {
    params: { a, b }, topic: 'geo', trap: 'triangle', fmt: 'qc', stem: 'Một tam giác có hai cạnh dài ' + a + ' và ' + b + '; cạnh thứ ba có độ dài là số nguyên c.',
    qa: 'Số các giá trị có thể của c', qb: String(other), answer: cmp(count, other),
    explain: b + ' − ' + a + ' < c < ' + b + ' + ' + a + ', tức ' + (b - a) + ' < c < ' + (a + b) + '. Số nguyên từ ' + (b - a + 1) + ' đến ' + (a + b - 1) + ': có ' + count + ' giá trị. Không lấy hai đầu mút vì tam giác sẽ suy biến.'
  };
};

// 5. Độ lệch chuẩn khi thêm điểm
T.sdAdd = (r) => {
  for (;;) {
    const m = r.int(10, 30);
    const base = r.pick([[-4, -2, 0, 2, 4], [-6, -1, 0, 1, 6], [-3, -3, 0, 3, 3], [-5, -1, 1, 5], [-8, 0, 8]]).map((d) => m + d);
    const s = sd(base);
    const v = r.pick(['pairBig', 'pairSmall', 'mean']);
    let add, text;
    if (v === 'mean') { add = [m]; text = 'thêm số ' + m; } else {
      const d = v === 'pairBig' ? Math.ceil(s) + r.int(1, 3) : Math.max(1, Math.floor(s) - r.int(1, 2));
      if (v === 'pairSmall' && d >= s) continue;
      add = [m - d, m + d]; text = 'thêm hai số ' + (m - d) + ' và ' + (m + d);
    }
    const s2 = sd(base.concat(add));
    if (Math.abs(s2 - s) < 1e-6) continue;
    return {
      params: { base, add }, topic: 'data', trap: 'sdshift', fmt: 'qc', stem: 'Tập dữ liệu S = {' + base.join(', ') + '}. Tập T có được khi ' + text + ' vào S.',
      qa: 'Độ lệch chuẩn của T', qb: 'Độ lệch chuẩn của S', answer: cmp(s2, s),
      explain: 'Mean của S là ' + m + ', SD của S ≈ ' + s.toFixed(2) + '. ' +
        (v === 'mean' ? 'Thêm đúng giá trị mean làm tăng n mà không thêm độ phân tán: SD giảm.' :
          'Hai số thêm vào cách mean ' + (add[1] - m) + (add[1] - m > s ? ' > SD hiện tại, nên SD tăng.' : ' < SD hiện tại, nên SD giảm.')) + ' Không cần tính chính xác SD của T.'
    };
  }
};

// 6. Phần trăm tăng của một khoản (không phải tỷ trọng)
T.pctIncrease = (r) => {
  for (;;) {
    const o1 = r.int(4, 12) * 10, s1 = r.int(10, 30) * 10;
    const g = r.pick([25, 50, 20, 75, 40]);
    const o2 = o1 * (100 + g) / 100;
    const s2 = s1 + r.int(-4, 6) * 10;
    if (!Number.isInteger(o2) || s2 <= 0) continue;
    const sh1 = 100 * o1 / (o1 + s1), sh2 = 100 * o2 / (o2 + s2);
    const ppt = Math.round((sh2 - sh1) * 10) / 10;
    const shareChg = Math.round(100 * (sh2 - sh1) / sh1 * 10) / 10;
    const totalChg = Math.round(100 * (o2 + s2 - o1 - s1) / (o1 + s1) * 10) / 10;
    const wrongBase = Math.round(100 * (o2 - o1) / o2 * 10) / 10;
    const opts = [g, ppt, shareChg, totalChg, wrongBase].map((x) => x + '%');
    if (new Set(opts).size < 5) continue;
    return {
      params: { o1, s1, o2, s2 }, topic: 'data', trap: 'pctbase', fmt: 'mc',
      stem: 'Doanh thu của một cửa hàng (triệu đồng): năm 2024 Online ' + o1 + ', Tại quầy ' + s1 + '; năm 2025 Online ' + o2 + ', Tại quầy ' + s2 + '. Doanh thu Online tăng bao nhiêu phần trăm từ 2024 đến 2025?',
      options: r.shuffle(opts), answer: g + '%',
      explain: 'Hỏi phần trăm tăng của CHÍNH doanh thu Online: (' + o2 + ' − ' + o1 + ') / ' + o1 + ' = ' + g + '%. Các phương án nhiễu: thay đổi tỷ trọng tính theo điểm phần trăm (' + ppt + '%), theo phần trăm của tỷ trọng (' + shareChg + '%), tăng của tổng doanh thu (' + totalChg + '%), và chia nhầm cho năm sau (' + wrongBase + '%).'
    };
  }
};

// 7. Hai người chạy vòng: gặp lại ở vạch xuất phát (đổi giây rồi đổi ngược về phút)
T.lapLcm = (r) => {
  for (;;) {
    const a = r.pick([40, 45, 50, 60, 75, 80, 90]), b = r.pick([60, 72, 75, 90, 100, 120, 150]);
    if (a === b) continue;
    const L = lcm(a, b);
    if (L % 60 !== 0 || L / 60 > 30 || L / 60 < 3) continue;
    const mins = L / 60;
    const opts = [mins, L, L / 100, (a * b) / 60, mins * 2].map((x) => +x.toFixed(2));
    if (new Set(opts).size < 5) continue;
    const show = (s) => (s < 60 ? s + ' giây' : s % 60 ? Math.floor(s / 60) + ' phút ' + (s % 60) + ' giây' : s / 60 + ' phút');
    return {
      params: { a, b }, topic: 'word', trap: 'unitback', fmt: 'mc',
      stem: 'An chạy một vòng sân hết ' + show(a) + ', Bình chạy một vòng hết ' + show(b) + '. Hai người xuất phát cùng lúc tại cùng một vạch và chạy đều. Sau ít nhất bao nhiêu PHÚT thì cả hai cùng có mặt lại ở vạch xuất phát?',
      options: r.shuffle(opts.map(String)), answer: String(mins),
      explain: 'Đổi sang giây: ' + a + ' và ' + b + '. BCNN = ' + L + ' giây. Đề hỏi phút nên đổi ngược: ' + L + ' / 60 = ' + mins + ' phút. Phương án ' + L + ' là quên đổi ngược; ' + +(a * b / 60).toFixed(2) + ' là nhân thay vì lấy BCNN.'
    };
  }
};

// 8. Tăng p% rồi giảm q%
T.successive = (r) => {
  const v = r.pick([[25, 20], [20, 20], [10, 10], [50, 30], [25, 25], [100, 50], [20, 15]]);
  const f = (1 + v[0] / 100) * (1 - v[1] / 100);
  return {
    params: { p: v[0], q: v[1] }, topic: 'pct', trap: 'successive', fmt: 'qc', stem: 'Giá một món hàng tăng ' + v[0] + '%, sau đó giảm ' + v[1] + '% so với giá đã tăng.',
    qa: 'Giá cuối cùng', qb: 'Giá ban đầu', answer: cmp(f, 1),
    explain: 'Giá cuối = giá đầu × ' + (1 + v[0] / 100) + ' × ' + (1 - v[1] / 100) + ' = ' + fmtNum(+f.toFixed(4)) + ' × giá đầu. ' +
      (Math.abs(f - 1) < 1e-9 ? 'Bằng đúng giá ban đầu dù ' + v[0] + ' ≠ ' + v[1] + ': C.' : f < 1 ? 'Nhỏ hơn giá đầu.' : 'Lớn hơn giá đầu.') + ' Không được tính ' + v[0] + ' − ' + v[1] + '.'
  };
};

// 9. "A nhiều hơn B p%" → "B ít hơn A bao nhiêu %"
T.pctReverse = (r) => {
  const v = r.pick([[25, 20], [50, 100 / 3], [100, 50], [20, 100 / 6], [60, 37.5], [300, 75]]);
  const ans = +v[1].toFixed(2);
  const opts = [ans, v[0], +(100 - v[0]).toFixed(2), +(v[0] / 2).toFixed(2), +(100 * v[0] / (100 - v[0])).toFixed(2)].filter((x) => Number.isFinite(x) && x > 0);
  const uniq = [...new Set(opts)].slice(0, 5);
  while (uniq.length < 5) uniq.push(+(ans + uniq.length * 7).toFixed(2));
  return {
    params: { p: v[0] }, topic: 'pct', trap: 'pctbase', fmt: 'mc', stem: 'Lương của Hà nhiều hơn lương của Minh ' + v[0] + '%. Lương của Minh ít hơn lương của Hà bao nhiêu phần trăm? (làm tròn 2 chữ số thập phân nếu cần)',
    options: r.shuffle(uniq.map((x) => x + '%')), answer: ans + '%',
    explain: 'Đặt Minh = 100 thì Hà = ' + (100 + v[0]) + '. Chênh lệch ' + v[0] + ', nhưng gốc so sánh bây giờ là lương Hà: ' + v[0] + ' / ' + (100 + v[0]) + ' ≈ ' + ans + '%. Chọn ' + v[0] + '% là dùng nhầm gốc.'
  };
};

// 10. a > b: so sánh a² và b² (bẫy số âm)
T.squares = (r) => {
  const v = r.pick(['any', 'pos', 'neg']);
  const d = { any: 'a > b', pos: 'a > b > 0', neg: '0 > a > b' }[v];
  return {
    params: { v }, topic: 'alg', trap: 'negatives', fmt: 'qc', stem: d, qa: 'a²', qb: 'b²', answer: { any: 'D', pos: 'A', neg: 'B' }[v],
    explain: { any: 'a = 2, b = 1 cho a² > b²; a = 1, b = −3 cho a² < b²: D.', pos: 'Hai số dương: số lớn hơn có bình phương lớn hơn.', neg: 'Hai số âm: b xa 0 hơn nên |b| > |a| và b² > a² (vd a = −1, b = −2).' }[v]
  };
};

// 11. Số dư
T.remainder = (r) => {
  const m = r.pick([6, 10, 12, 15]);
  const rem = r.int(1, m - 1);
  const divs = { 6: [2, 3], 10: [2, 5], 12: [3, 4, 6], 15: [3, 5] }[m];
  const det = r.bool();
  const k = det ? r.pick(divs) : r.pick({ 6: [4, 9], 10: [4, 15], 12: [8, 9], 15: [6, 9] }[m]);
  if (det) {
    const val = rem % k;
    const other = r.pick([val, (val + 1) % k, rem % k === 0 ? 1 : 0]);
    return {
      params: { m, rem, k }, topic: 'arith', trap: 'remainder', fmt: 'qc', stem: 'Khi chia số nguyên dương n cho ' + m + ' được số dư ' + rem + '.', qa: 'Số dư khi chia n cho ' + k, qb: String(other), answer: cmp(val, other),
      explain: 'n = ' + m + 'q + ' + rem + '. Vì ' + k + ' là ước của ' + m + ' nên số dư khi chia cho ' + k + ' là số dư của ' + rem + ' khi chia cho ' + k + ' = ' + val + '.'
    };
  }
  const vals = [0, 1, 2, 3].map((q) => (m * q + rem) % k);
  const other = vals[0];
  return {
    params: { m, rem, k }, topic: 'arith', trap: 'remainder', fmt: 'qc', stem: 'Khi chia số nguyên dương n cho ' + m + ' được số dư ' + rem + '.', qa: 'Số dư khi chia n cho ' + k, qb: String(other),
    answer: vals.every((x) => x === other) ? 'C' : 'D',
    explain: k + ' không phải ước của ' + m + '. Thử n = ' + [0, 1, 2, 3].map((q) => m * q + rem).join(', ') + ': số dư khi chia cho ' + k + ' lần lượt là ' + vals.join(', ') + '. ' + (vals.every((x) => x === other) ? 'Luôn bằng nhau.' : 'Thay đổi theo n nên chọn D.')
  };
};

// 12. Mean và median của dữ liệu lệch (một giá trị ngoại lai rất lớn hoặc rất nhỏ)
T.meanMedian = (r) => {
  for (;;) {
    const base = r.int(20, 40);
    const core = [base, base + r.int(1, 3), base + r.int(4, 6), base + r.int(7, 9)];
    const high = r.bool();
    const out = high ? base + r.int(30, 80) : base - r.int(15, 19);
    const data = core.concat([out]).sort((a, b) => a - b);
    const mn = mean(data), md = median(data);
    if (Math.abs(mn - md) < 0.5) continue;
    return {
      topic: 'data', trap: 'meanmedian', fmt: 'qc', stem: 'Tập dữ liệu: ' + r.shuffle(data).join(', '), qa: 'Trung bình cộng (mean)', qb: 'Trung vị (median)', answer: cmp(mn, md),
      data,
      explain: 'Sắp xếp: ' + data.join(', ') + '. Median = ' + fmtNum(md) + ', mean = ' + fmtNum(+mn.toFixed(2)) + '. ' + (mn > md ? 'Một giá trị rất lớn kéo mean lên trên median.' : 'Một giá trị rất nhỏ kéo mean xuống dưới median.')
    };
  }
};

// 13. Tốc độ trung bình đi về
T.avgSpeed = (r) => {
  for (;;) {
    const v1 = r.pick([30, 40, 45, 60, 20]), v2 = r.pick([60, 90, 120, 30, 80]);
    if (v1 === v2) continue;
    const h = frac(2 * v1 * v2, v1 + v2);
    if (h.d !== 1) continue;
    const ari = (v1 + v2) / 2;
    return {
      params: { v1, v2 }, topic: 'word', trap: 'harmonic', fmt: 'qc', stem: 'Một người đi từ A đến B với tốc độ ' + v1 + ' km/h và quay về theo đúng đường đó với tốc độ ' + v2 + ' km/h.',
      qa: 'Tốc độ trung bình cả đi và về (km/h)', qb: String(ari), answer: 'B',
      explain: 'Đặt quãng đường là d: thời gian = d/' + v1 + ' + d/' + v2 + '. Tốc độ trung bình = 2d / thời gian = 2·' + v1 + '·' + v2 + '/(' + v1 + ' + ' + v2 + ') = ' + h.n + ' < ' + ari + '. Thời gian đi chậm dài hơn nên kéo trung bình xuống.'
    };
  }
};

// 14. Hai vòi cùng chảy (điền số, phân số)
T.workRate = (r) => {
  const a = r.int(2, 9), b = r.int(a + 1, 12);
  const f = frac(a * b, a + b);
  return {
    params: { a, b }, topic: 'word', trap: 'harmonic', fmt: 'num', stem: 'Vòi thứ nhất chảy đầy bể trong ' + a + ' giờ, vòi thứ hai trong ' + b + ' giờ. Nếu mở cả hai vòi cùng lúc thì bao nhiêu giờ đầy bể? (nhập phân số hoặc số thập phân chính xác)',
    answer: f, explain: 'Mỗi giờ hai vòi chảy được 1/' + a + ' + 1/' + b + ' = ' + (a + b) + '/' + a * b + ' bể. Thời gian = ' + a * b + '/' + (a + b) + ' = ' + fracStr(f) + ' giờ. Lấy trung bình (' + a + ' + ' + b + ')/2 là sai.'
  };
};

// 15. Xác suất rút không hoàn lại (điền phân số)
T.noReplace = (r) => {
  const red = r.int(3, 7), blue = r.int(2, 8), n = red + blue;
  const f = frac(red * (red - 1), n * (n - 1));
  return {
    params: { red, blue }, topic: 'data', trap: 'replacement', fmt: 'num', stem: 'Một hộp có ' + red + ' bi đỏ và ' + blue + ' bi xanh. Rút ngẫu nhiên lần lượt 2 bi, không hoàn lại. Xác suất cả hai bi đều đỏ là bao nhiêu? (nhập phân số)',
    answer: f, explain: 'Lần 1: ' + red + '/' + n + '. Lần 2 còn ' + (red - 1) + ' đỏ trong ' + (n - 1) + ' bi: ' + (red - 1) + '/' + (n - 1) + '. Nhân lại: ' + fracStr(f) + '. Dùng (' + red + '/' + n + ')² là tính như có hoàn lại.'
  };
};

// 16. Bắt tay / chọn cặp (đếm trùng)
T.handshake = (r) => {
  const n = r.int(6, 15);
  const ans = n * (n - 1) / 2;
  const opts = [ans, n * (n - 1), n * n, ans - n, (n - 1) * (n - 2) / 2];
  return {
    params: { n }, topic: 'data', trap: 'overcount', fmt: 'mc', stem: 'Trong một buổi họp có ' + n + ' người, mỗi người bắt tay mỗi người khác đúng một lần. Có tất cả bao nhiêu cái bắt tay?',
    options: r.shuffle(opts.map(String)), answer: String(ans),
    explain: 'Mỗi người bắt tay ' + (n - 1) + ' người, nhưng mỗi cái bắt tay được đếm hai lần (A với B và B với A): ' + n + '·' + (n - 1) + '/2 = ' + ans + '.'
  };
};

// 17. Phóng to bán kính p%: phần trăm tăng của diện tích
T.areaScale = (r) => {
  const p = r.pick([10, 20, 30, 50]);
  const inc = ((1 + p / 100) ** 2 - 1) * 100;
  return {
    params: { p }, topic: 'geo', trap: 'scaling', fmt: 'qc', stem: 'Bán kính của một hình tròn tăng ' + p + '%.', qa: 'Phần trăm tăng của diện tích', qb: 2 * p + '%', answer: 'A',
    explain: 'Diện tích tỉ lệ với r²: (1 + ' + p / 100 + ')² = ' + fmtNum(+((1 + p / 100) ** 2).toFixed(4)) + ', tức tăng ' + fmtNum(+inc.toFixed(2)) + '% > ' + 2 * p + '%. Phần dư ' + fmtNum(+(p * p / 100).toFixed(2)) + '% đến từ số hạng p².'
  };
};

// 18. Chia cho biến: chọn mọi nghiệm
T.divVar = (r) => {
  const k = r.int(2, 9);
  const opts = ['0', String(k), String(-k), String(k * k), '1'];
  return {
    params: { k }, topic: 'alg', trap: 'divbyvar', fmt: 'multi', stem: 'x² = ' + k + 'x. Giá trị nào dưới đây có thể là x? Chọn mọi đáp án đúng.',
    options: r.shuffle(opts), answer: ['0', String(k)],
    explain: 'x² − ' + k + 'x = 0 ⇔ x(x − ' + k + ') = 0 ⇔ x = 0 hoặc x = ' + k + '. Chia hai vế cho x sẽ mất nghiệm x = 0.'
  };
};

// 19. Trị tuyệt đối: chọn mọi giá trị có thể của tổng
T.absMulti = (r) => {
  const a = r.int(2, 6), b = r.int(1, 5);
  const xs = [a, -a], ys = [b, -b];
  const sums = [...new Set(xs.flatMap((x) => ys.map((y) => x + y)))];
  const all = [...new Set(sums.concat([a * b, 0, a - b + 1, -(a + b) - 1]))].filter((v) => v !== undefined).slice(0, 6);
  const opts = r.shuffle(all.slice(0, Math.max(5, sums.length + 1)).map(String));
  return {
    params: { a, b }, topic: 'arith', trap: 'negatives', fmt: 'multi', stem: '|x| = ' + a + ' và |y| = ' + b + '. Giá trị nào dưới đây có thể là x + y? Chọn mọi đáp án đúng.',
    options: opts, answer: sums.filter((s) => opts.includes(String(s))).map(String),
    explain: 'x = ±' + a + ', y = ±' + b + ': x + y ∈ {' + sums.sort((p, q) => q - p).join(', ') + '}. Chỉ lấy x, y dương là bỏ sót ba trường hợp.'
  };
};

// 20. Trung bình gộp hai nhóm khác cỡ
T.weightedAvg = (r) => {
  const n1 = r.int(10, 40), n2 = r.pick([n1, r.int(10, 40)]);
  const m1 = r.int(60, 84), m2 = m1 + r.pick([-15, -10, -6, 6, 10, 15]);
  const all = (n1 * m1 + n2 * m2) / (n1 + n2), simple = (m1 + m2) / 2;
  return {
    params: { n1, n2, m1, m2 }, topic: 'data', trap: 'weighted', fmt: 'qc',
    stem: 'Lớp X có ' + n1 + ' học sinh, điểm trung bình ' + m1 + '. Lớp Y có ' + n2 + ' học sinh, điểm trung bình ' + m2 + '.',
    qa: 'Điểm trung bình của cả ' + (n1 + n2) + ' học sinh', qb: fmtNum(simple), answer: cmp(all, simple),
    explain: 'Trung bình chung = (' + n1 + '·' + m1 + ' + ' + n2 + '·' + m2 + ') / ' + (n1 + n2) + ' ≈ ' + fmtNum(+all.toFixed(2)) + '. ' +
      (n1 === n2 ? 'Hai lớp đông bằng nhau nên đúng bằng trung bình cộng hai mean: C.' : 'Lớp ' + (n1 > n2 ? 'X' : 'Y') + ' đông hơn nên kéo trung bình chung về phía ' + (n1 > n2 ? m1 : m2) + '.')
  };
};

// 21. SD khi cộng hằng số hoặc nhân hệ số
T.sdConstant = (r) => {
  const base = r.pick([[2, 4, 6, 8], [1, 5, 9], [3, 3, 7, 11], [10, 12, 20]]);
  const v = r.pick(['add', 'sub', 'mul']);
  const c = v === 'mul' ? r.pick([2, 3]) : r.int(3, 20);
  const T2 = base.map((x) => (v === 'add' ? x + c : v === 'sub' ? x - c : x * c));
  return {
    params: { base, T2 }, topic: 'data', trap: 'sdshift', fmt: 'qc',
    stem: 'Tập S = {' + base.join(', ') + '}. Tập T có được khi ' + (v === 'add' ? 'cộng ' + c + ' vào' : v === 'sub' ? 'trừ ' + c + ' khỏi' : 'nhân ' + c + ' với') + ' mỗi phần tử của S.',
    qa: 'Độ lệch chuẩn của T', qb: 'Độ lệch chuẩn của S', answer: v === 'mul' ? 'A' : 'C',
    explain: v === 'mul' ? 'Nhân mọi phần tử với ' + c + ' thì mọi khoảng cách tới mean nhân ' + c + ': SD tăng ' + c + ' lần.' : 'Cộng hay trừ cùng một số chỉ dịch mean, khoảng cách tới mean giữ nguyên: SD không đổi.'
  };
};

// 22. Bất đẳng thức với hệ số âm
T.ineqFlip = (r) => {
  const a = r.pick([2, 3, 4, 5]), b = r.int(-6, 9), x0 = r.int(-5, 5);
  const strict = r.bool();
  const c = b - a * x0; // −a·x + b > c ⇔ x < x0
  const qb = r.pick([x0, x0, x0 + r.pick([-2, 1, 3])]);
  let ans;
  if (qb === x0) ans = strict ? 'B' : 'D';
  else ans = qb > x0 ? 'B' : 'D';
  return {
    params: { a, b, c, strict, qb }, topic: 'alg', trap: 'ineqflip', fmt: 'qc',
    stem: '−' + a + 'x + ' + (b < 0 ? '(' + b + ')' : b) + ' ' + (strict ? '>' : '≥') + ' ' + c, qa: 'x', qb: String(qb), answer: ans,
    explain: '−' + a + 'x ' + (strict ? '>' : '≥') + ' ' + (c - b) + '. Chia cho −' + a + ' phải đổi chiều: x ' + (strict ? '<' : '≤') + ' ' + x0 + '. ' +
      (ans === 'B' ? 'Mọi x thỏa mãn đều nhỏ hơn ' + qb + ': B.' : qb === x0 ? 'x có thể nhỏ hơn hoặc bằng ' + qb + ' (dấu ≤ cho phép bằng): D.' : 'x có thể lớn hơn, bằng hoặc nhỏ hơn ' + qb + ' tùy giá trị: D.')
  };
};

// 23. Tam giác cân: chu vi tưởng không xác định nhưng chỉ một trường hợp hợp lệ
T.isosceles = (r) => {
  for (;;) {
    const a = r.int(2, 6), b = r.int(2 * a + 1, 2 * a + 7); // a, a, b không hợp lệ vì 2a < b
    const P = a + 2 * b;
    const qb = r.pick([P, P, P - 1, a + 2 * b - (b - 2 * a), 2 * a + b]);
    if (qb === 2 * a + b && qb === P) continue;
    return {
      params: { a, b }, topic: 'geo', trap: 'hiddendet', fmt: 'qc', stem: 'Một tam giác cân có hai cạnh dài ' + a + ' và ' + b + '.', qa: 'Chu vi của tam giác', qb: String(qb), answer: cmp(P, qb),
      explain: 'Hai trường hợp: (' + a + ', ' + a + ', ' + b + ') hoặc (' + a + ', ' + b + ', ' + b + '). Trường hợp đầu không phải tam giác vì ' + a + ' + ' + a + ' = ' + 2 * a + ' < ' + b + '. Chỉ còn (' + a + ', ' + b + ', ' + b + '), chu vi ' + P + '. Chọn D là mắc bẫy.'
    };
  }
};

// 24. x% của y và y% của x
T.pctSymmetry = (r) => {
  const v = r.pick(['sym', 'sym', 'scaled']);
  if (v === 'sym') {
    return {
      params: { v }, topic: 'pct', trap: 'hiddendet', fmt: 'qc', stem: 'x và y là các số dương.', qa: 'x% của y', qb: 'y% của x', answer: 'C',
      explain: 'x% của y = xy/100 = y% của x, với mọi x, y. Không có thông tin về x, y nhưng hai đại lượng luôn bằng nhau: C, không phải D.'
    };
  }
  const k = r.pick([2, 3, 4]);
  return {
    params: { v, k }, topic: 'pct', trap: 'hiddendet', fmt: 'qc', stem: 'x và y là các số dương.', qa: k * 10 + '% của ' + k + 'x', qb: 'x% của ' + k * k * 10 + '', answer: cmp(k * 10 * k, k * k * 10),
    explain: k * 10 + '% của ' + k + 'x = ' + (k * k * 10) + 'x/100; x% của ' + k * k * 10 + ' = ' + k * k * 10 + 'x/100. Bằng nhau với mọi x > 0: C.'
  };
};

// 25. x² = a², y³ = −b³: so sánh x và y
T.rootSigns = (r) => {
  for (;;) {
    const a = r.int(2, 9), b = r.int(2, 9);
    const yNeg = r.bool();
    const y = yNeg ? -b : b;
    const vals = [a, -a].map((x) => cmp(x, y));
    const ans = vals[0] === vals[1] ? vals[0] : 'D';
    return {
      params: { a, y }, topic: 'alg', trap: 'signs', fmt: 'qc', stem: 'x² = ' + a * a + ' và y³ = ' + y ** 3, qa: 'x', qb: 'y', answer: ans,
      explain: 'x = ' + a + ' hoặc x = −' + a + '; y³ = ' + y ** 3 + ' chỉ cho y = ' + y + '. So ' + a + ' với ' + y + ' cho ' + vals[0] + ', so −' + a + ' với ' + y + ' cho ' + vals[1] + '. ' +
        (ans === 'D' ? 'Hai kết quả khác nhau: D.' : 'Cả hai trường hợp cùng kết quả: ' + ans + '. Nghiệm âm cũng phải xét, nhưng ở đây không đổi kết luận.')
    };
  }
};

// 26. Hai tập giao nhau
T.overlap = (r) => {
  for (;;) {
    const n = r.int(30, 60), A = r.int(Math.floor(n / 3), n - 5), B = r.int(Math.floor(n / 3), n - 5);
    const lo = Math.max(0, A + B - n), hi = Math.min(A, B);
    if (hi - lo < 2) continue;
    const qb = r.pick([lo, lo - 1, hi, hi + 1, lo + 1]);
    if (qb < 0) continue;
    const ans = qb < lo ? 'A' : qb > hi ? 'B' : 'D';
    return {
      params: { n, A, B, qb }, topic: 'data', trap: 'overlap', fmt: 'qc', stem: 'Trong ' + n + ' sinh viên, ' + A + ' người học Kinh tế và ' + B + ' người học Toán (một người có thể học cả hai hoặc không học môn nào).',
      qa: 'Số sinh viên học cả hai môn', qb: String(qb), answer: ans,
      explain: 'Phần giao ít nhất là ' + A + ' + ' + B + ' − ' + n + (A + B - n < 0 ? ' < 0, tức ít nhất 0' : ' = ' + lo) + ', nhiều nhất là min(' + A + ', ' + B + ') = ' + hi + '. ' +
        (ans === 'D' ? qb + ' nằm trong khoảng [' + lo + ', ' + hi + '] nên chưa xác định: D.' : qb + ' nằm ngoài khoảng [' + lo + ', ' + hi + ']: ' + ans + '.')
    };
  }
};

// 27. Số ước dương
T.divisors = (r) => {
  const p = r.pick([[2, 3], [2, 5], [3, 5], [2, 7]]);
  const a = r.int(1, 4), b = r.int(1, 3);
  const N = p[0] ** a * p[1] ** b;
  const cnt = (a + 1) * (b + 1);
  const qb = r.pick([cnt, a * b, a + b + 1, cnt + 1, cnt - 1].filter((x) => x > 0));
  return {
    params: { N }, topic: 'arith', trap: 'countvalues', fmt: 'qc', stem: 'N = ' + N, qa: 'Số ước số nguyên dương của N', qb: String(qb), answer: cmp(cnt, qb),
    explain: N + ' = ' + p[0] + (a > 1 ? '^' + a : '') + ' × ' + p[1] + (b > 1 ? '^' + b : '') + '. Số ước = (' + a + ' + 1)(' + b + ' + 1) = ' + cnt + ', tính cả 1 và chính N. Đếm số thừa số nguyên tố hay quên 1 và N là hai lỗi hay gặp.'
  };
};

// 28. Trung bình cộng các số nguyên liên tiếp
T.consecutive = (r) => {
  const k = r.pick([5, 7, 9, 6, 8]);
  const odd = k % 2 === 1;
  return {
    params: { k }, topic: 'arith', trap: 'hiddendet', fmt: 'qc', stem: 'Tổng của ' + k + ' số nguyên liên tiếp là S.', qa: odd ? 'Số ở giữa trong ' + k + ' số' : 'Trung vị của ' + k + ' số', qb: 'S/' + k, answer: 'C',
    explain: 'Dãy cách đều nên trung bình cộng bằng trung vị: S/' + k + ' = ' + (odd ? 'số ở giữa' : 'trung bình của hai số giữa') + ' với mọi dãy. Không biết S nhưng vẫn bằng nhau: C.'
  };
};

export const TEMPLATES = T;
export const TEMPLATE_IDS = Object.keys(T);

/** Sinh một câu từ mẫu tpl với seed. */
export function makeItem(tpl, seed) {
  const r = rng(seed);
  const it = T[tpl](r);
  it.tpl = tpl;
  it.seed = seed;
  it.tip = TRAPS[it.trap].tip;
  if (it.fmt === 'qc') it.options = ['A', 'B', 'C', 'D'];
  return it;
}

/* ---------------- Chấm ---------------- */
/** Đọc số nhập: "3/4", "0.75", "0,75", "-2". Trả về số hoặc NaN. */
export function parseNum(s) {
  s = String(s || '').trim().replace(',', '.').replace(/\s+/g, '');
  if (!s) return NaN;
  const m = s.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  if (m) return +m[2] === 0 ? NaN : +m[1] / +m[2];
  return /^-?\d*\.?\d+$/.test(s) ? +s : NaN;
}
/** choice: qc/mc → chuỗi; multi → mảng; num → chuỗi nhập. Đúng toàn bộ mới tính (không điểm từng phần). */
export function grade(it, choice) {
  if (it.fmt === 'multi') { const c = choice || []; return c.length === it.answer.length && it.answer.every((a) => c.includes(a)); }
  if (it.fmt === 'num') { const v = parseNum(choice); return Number.isFinite(v) && Math.abs(v - it.answer.n / it.answer.d) < 1e-9; }
  return choice === it.answer;
}
export function answerText(it) {
  if (it.fmt === 'qc') return it.answer + '. ' + QC_CHOICES[it.answer];
  if (it.fmt === 'multi') return it.answer.join('; ');
  if (it.fmt === 'num') return fracStr(it.answer) + (it.answer.d !== 1 ? ' (≈ ' + fmtNum(+(it.answer.n / it.answer.d).toFixed(4)) + ')' : '');
  return it.answer;
}

/* ---------------- Chọn bài hằng ngày ---------------- */
/**
 * Thống kê theo bẫy từ lịch sử: {trap: {n, ok, recentWrong}}. hist: [{day, items: [{tpl, trap, ok, sec}]}], cũ trước mới sau.
 * recentWrong: số lần sai trong 5 lần làm gần nhất của bẫy đó.
 */
export function trapStats(hist) {
  const st = {};
  (hist || []).forEach((s) => s.items.forEach((x) => {
    const t = st[x.trap] || (st[x.trap] = { n: 0, ok: 0, last: [] });
    t.n += 1; if (x.ok) t.ok += 1; t.last.push(x.ok);
  }));
  Object.values(st).forEach((t) => { t.recentWrong = t.last.slice(-5).filter((o) => !o).length; delete t.last; });
  return st;
}
/** Trọng số chọn mẫu: 1 + prior của bẫy (giảm dần khi đã làm đúng) + 2 × số lần sai gần đây. */
/** Mẫu dễ (ra ít hơn): người học đã ở mức khá, bộ hằng ngày ưu tiên câu thách đố. */
export const EASY = ['squares', 'handshake', 'successive', 'areaScale', 'avgSpeed'];
export function weightOf(tpl, stats, sampleTrap) {
  const trap = sampleTrap[tpl];
  const s = stats[trap] || { n: 0, ok: 0, recentWrong: 0 };
  const prior = TRAPS[trap].prior * Math.max(0, 1 - s.ok / 4);
  return (1 + prior + 2 * s.recentWrong) * (EASY.includes(tpl) ? 0.4 : 1);
}
let SAMPLE_TRAP = null;
/** Bẫy và dạng của từng mẫu (sinh thử một lần). */
export function templateMeta() {
  if (!SAMPLE_TRAP) {
    SAMPLE_TRAP = { trap: {}, fmt: {}, topic: {} };
    TEMPLATE_IDS.forEach((id) => { const it = T[id](rng(1)); SAMPLE_TRAP.trap[id] = it.trap; SAMPLE_TRAP.fmt[id] = it.fmt; SAMPLE_TRAP.topic[id] = it.topic; });
  }
  return SAMPLE_TRAP;
}

/**
 * Bộ câu cho một ngày: n câu (mặc định 4), ít nhất 2 câu QC (1 nếu n < 4) và 1 câu không phải QC (khi n ≥ 2), không trùng mẫu, không quá 2 câu cùng chủ đề.
 * seedStr: ví dụ "2026-11-27|user01|0" (số cuối là lượt Làm thêm trong ngày).
 */
export function dailySet(seedStr, hist, n = 4) {
  const meta = templateMeta();
  const stats = trapStats(hist);
  const r = rng(hashStr(seedStr));
  const chosen = [];
  const topicCount = {};
  const pickWeighted = (pool) => {
    const ws = pool.map((id) => weightOf(id, stats, meta.trap));
    let x = r.next() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { x -= ws[i]; if (x <= 0) return pool[i]; }
    return pool[pool.length - 1];
  };
  const ok = (id) => !chosen.includes(id) && (topicCount[meta.topic[id]] || 0) < 2;
  const need = (fmtTest, k) => {
    for (let i = 0; i < k; i++) {
      const pool = TEMPLATE_IDS.filter((id) => ok(id) && fmtTest(meta.fmt[id]));
      if (!pool.length) return;
      const id = pickWeighted(pool);
      chosen.push(id); topicCount[meta.topic[id]] = (topicCount[meta.topic[id]] || 0) + 1;
    }
  };
  need((f) => f === 'qc', n >= 4 ? 2 : 1);
  need((f) => f !== 'qc', n >= 2 ? 1 : 0);
  need(() => true, n - chosen.length);
  const ordered = r.shuffle(chosen);
  return ordered.map((id, i) => makeItem(id, hashStr(seedStr + '#' + i + id)));
}

/** Dữ liệu lỗi gọn để đưa cho Claude dựng đề Quant đầy đủ. */
export function exportSummary(hist, userName) {
  const st = trapStats(hist);
  const traps = Object.keys(st).map((k) => ({ trap: k, label: TRAPS[k] ? TRAPS[k].label : k, done: st[k].n, correct: st[k].ok, wrongInLast5: st[k].recentWrong }))
    .sort((a, b) => (a.correct / a.done) - (b.correct / b.done));
  const wrong = [];
  (hist || []).slice(-30).forEach((s) => s.items.forEach((x) => { if (!x.ok) wrong.push({ day: s.day, template: x.tpl, trap: x.trap, format: x.fmt, stem: x.stem, chose: x.c, answer: x.a, seconds: x.sec }); }));
  return {
    purpose: 'Dữ liệu Quant hằng ngày của ' + (userName || 'người học') + ' (web Sổ GRE). Dùng để dựng đề Quant đầy đủ tập trung vào các bẫy hay sai.',
    sessions: (hist || []).length, traps, recentMistakes: wrong.slice(-40)
  };
}
