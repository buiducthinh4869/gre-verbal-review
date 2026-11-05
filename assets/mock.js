/**
 * mock.js: lõi chế độ Thi thử section Verbal (thuần JavaScript, test bằng node: tests/mock.test.js).
 *  - Cấu trúc theo đề thật: Section 1 = 12 câu / 18 phút; Section 2 = 15 câu / 23 phút; Đầy đủ = cả hai.
 *  - Chọn câu: ~55% TC, ~45% SE; trong TC trộn 1, 2, 3 chỗ trống. Ưu tiên câu chưa làm hoặc đã làm sai;
 *    tránh câu đã làm đúng trong 7 ngày gần nhất nếu còn đủ câu.
 *  - Thích ứng theo section (gần đúng): Section 1 đúng ≥ 70% thì Section 2 ưu tiên TC nhiều chỗ trống và câu
 *    từng làm sai; ngược lại ưu tiên TC một chỗ trống.
 *  - Chấm như đề thật: chỉ đúng khi đúng toàn bộ; SE phải chọn đúng 2 ô.
 */
import { shuffle, daysBetween } from './srs.js';
import { gradeExercise } from './vocab.js';

export const SECTION_SPEC = { 1: { n: 12, min: 18 }, 2: { n: 15, min: 23 } };
export const MODES = {
  s1: { label: 'Section 1', secs: [1] },
  s2: { label: 'Section 2', secs: [2] },
  full: { label: 'Đầy đủ', secs: [1, 2] }
};
export const SE_SHARE = 0.45;
export const ADAPT_THRESHOLD = 0.7;
export const RECENT_DAYS = 7;
export const KIND_LABEL = { tc1: 'TC 1 chỗ trống', tc2: 'TC 2 chỗ trống', tc3: 'TC 3 chỗ trống', se: 'Sentence Equivalence' };
const TC_MIX = {
  normal: { 1: 0.4, 2: 0.35, 3: 0.25 },
  hard: { 1: 0.2, 2: 0.4, 3: 0.4 },
  easy: { 1: 0.65, 2: 0.25, 3: 0.1 }
};

export const exKind = (ex) => (ex.type === 'se' ? 'se' : 'tc' + ex.blanks.length);
export const isAnswered = (ex, choice) => (ex.type === 'se' ? (choice || []).length === 2 : !!choice && ex.blanks.every((b, i) => !!choice[i]));
export const isTouched = (choice) => (choice || []).some(Boolean);

/** Bậc ưu tiên của một câu theo kết quả gần nhất (exRes[id] = [ngày, 1 đúng | 0 sai]): 0 chưa làm / làm sai, 1 đúng đã lâu, 2 đúng trong 7 ngày. */
export function tierOf(ex, exRes, today) {
  const r = (exRes || {})[ex.id];
  if (!r || !r[1]) return 0;
  return daysBetween(r[0], today) <= RECENT_DAYS ? 2 : 1;
}
const wasWrong = (ex, exRes) => { const r = (exRes || {})[ex.id]; return !!r && !r[1]; };

/** Số câu của từng section cho một chế độ, co lại theo tỉ lệ nếu không đủ câu. */
export function planSections(mode, available) {
  const secs = MODES[mode].secs;
  const need = secs.reduce((n, s) => n + SECTION_SPEC[s].n, 0);
  const take = Math.min(need, available);
  let left = take;
  return {
    need, available, short: available < need,
    sections: secs.map((s, k) => {
      const n = k === secs.length - 1 ? left : Math.min(left, Math.round(SECTION_SPEC[s].n * take / need));
      left -= n;
      const spec = SECTION_SPEC[s];
      return { no: s, n, min: n === spec.n ? spec.min : Math.max(1, Math.round(spec.min * n / spec.n)) };
    })
  };
}

function quotas(n, mix) {
  const keys = [1, 2, 3];
  const raw = keys.map((k) => n * mix[k]);
  const q = raw.map(Math.floor);
  let rest = n - q.reduce((a, b) => a + b, 0);
  raw.map((v, i) => [v - q[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rest > 0) { q[i]++; rest--; } });
  return { 1: q[0], 2: q[1], 3: q[2] };
}

/**
 * Chọn n câu cho một section từ pool (mảng bài đã có trong chỉ mục).
 * opts: {exRes, today, prefer: 'hard' | 'easy' | null, exclude: Set id, rng}
 * Trả về mảng id bài: TC trước (trộn 1/2/3 chỗ trống), SE sau, như thứ tự nhóm câu của đề thật.
 */
export function pickSection(pool, n, opts = {}) {
  const rng = opts.rng || Math.random;
  const exclude = opts.exclude || new Set();
  const prefer = opts.prefer || null;
  const cands = shuffle(pool.filter((ex) => !exclude.has(ex.id)), rng);
  const pos = new Map(cands.map((ex, i) => [ex.id, i]));
  const key = (ex) => [tierOf(ex, opts.exRes, opts.today), prefer === 'hard' && !wasWrong(ex, opts.exRes) ? 1 : 0, pos.get(ex.id)];
  const cmp = (a, b) => { const ka = key(a), kb = key(b); for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i]; return 0; };
  const se = cands.filter((ex) => ex.type === 'se').sort(cmp);
  const tc = cands.filter((ex) => ex.type !== 'se').sort(cmp);

  let nSE = Math.min(se.length, Math.round(n * SE_SHARE));
  let nTC = Math.min(tc.length, n - nSE);
  nSE = Math.min(se.length, n - nTC); // thiếu TC thì bù bằng SE (và ngược lại)

  // TC: chia theo số chỗ trống, rồi bù phần thiếu theo thứ tự ưu tiên chung
  const q = quotas(nTC, TC_MIX[prefer || 'normal']);
  const chosen = [];
  // (lượt đầu chỉ lấy câu không thuộc diện 'vừa làm đúng trong 7 ngày'; thiếu thì lượt bù mới dùng tới)
  [1, 2, 3].forEach((b) => tc.filter((ex) => ex.blanks.length === b && key(ex)[0] < 2).slice(0, q[b]).forEach((ex) => chosen.push(ex)));
  if (chosen.length < nTC) {
    const blanksKey = (ex) => (prefer === 'hard' ? -ex.blanks.length : prefer === 'easy' ? ex.blanks.length : 0);
    const rest = tc.filter((ex) => !chosen.includes(ex)).sort((a, b) => {
      const ka = key(a), kb = key(b);
      if (ka[0] !== kb[0]) return ka[0] - kb[0];
      return blanksKey(a) - blanksKey(b) || ka[1] - kb[1] || ka[2] - kb[2];
    });
    rest.slice(0, nTC - chosen.length).forEach((ex) => chosen.push(ex));
  }
  const tcIds = shuffle(chosen, rng).map((ex) => ex.id);
  return tcIds.concat(se.slice(0, nSE).map((ex) => ex.id));
}

/** Hướng thích ứng cho Section 2 theo kết quả Section 1. */
export const adaptFrom = (score, total) => (total && score / total >= ADAPT_THRESHOLD ? 'hard' : 'easy');

/** Chấm một câu (chỉ đúng khi đúng toàn bộ; SE đúng 2 ô). */
export function gradeItem(ex, choice, idx) {
  if (!isAnswered(ex, choice)) return { correct: false, answered: false, g: null };
  const g = gradeExercise(ex, choice, idx);
  return { correct: g.correct, answered: true, g };
}

/** Chuỗi đáp án gọn để lưu (giữ vị trí chỗ trống chưa chọn). */
export const encodeChoice = (choice) => (choice || []).map((x) => x || '').join(' | ');
export const decodeChoice = (s, ex) => {
  const parts = String(s || '').split(' | ').map((x) => x.trim());
  if (ex && ex.type !== 'se') return ex.blanks.map((b, i) => parts[i] || null);
  return parts.filter(Boolean);
};

/** Tổng hợp một section đã nộp: điểm, thời gian, thời gian trung bình theo dạng câu. items: [{i, c, ok, t}] */
export function summarize(sections, idx) {
  const byKind = {};
  let score = 0, total = 0, dur = 0;
  sections.forEach((s) => {
    score += s.score; total += s.total; dur += s.durationSec;
    s.items.forEach((it) => {
      const ex = idx.exById[it.i];
      if (!ex) return;
      const k = exKind(ex);
      const b = byKind[k] || (byKind[k] = { n: 0, ok: 0, t: 0 });
      b.n++; b.ok += it.ok ? 1 : 0; b.t += it.t || 0;
    });
  });
  return { score, total, durationSec: dur, byKind };
}
