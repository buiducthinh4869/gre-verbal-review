/**
 * distractors.js: sinh phương án nhiễu cho bài Nghĩa → Từ.
 * Phương án sai phải cùng hướng nghĩa nhưng sai sắc thái hoặc mức độ, như cách GRE bẫy.
 * Thuần JavaScript, test bằng node (tests/distractors.test.js).
 */
import { shuffle } from './srs.js';
import { groupDirection } from './vocab.js';

const lc = (s) => String(s || '').toLowerCase().trim();
const normMeaning = (s) => lc(s).replace(/[.,;:!?()]/g, '').replace(/\s+/g, ' ');

/** Hai từ cùng dòng từ (laud / laudable, qualified / unqualified): không dùng làm nhiễu cho nhau. */
export function sameFamily(a, b) {
  for (const x of a.forms) {
    for (const y of b.forms) {
      if (x.length < 4 || y.length < 4) continue;
      const short = x.length <= y.length ? x : y, long = x.length <= y.length ? y : x;
      if (long.indexOf(short) === 0) return true;
      if (short.length >= 6 && long.includes(short)) return true;
      let k = 0;
      while (k < x.length && k < y.length && x[k] === y[k]) k++;
      if (k >= 6) return true;
    }
  }
  return false;
}

const posSet = (p) => lc(p).split('/').map((x) => x.trim());
const posCompatible = (a, b) => { const sb = posSet(b.pos); return posSet(a.pos).some((x) => sb.includes(x)); };

/**
 * Chọn n phương án nhiễu theo thứ tự:
 *  1. confusables của từ đúng (rồi các từ coi từ đúng là confusable)
 *  2. cùng nhóm, level gần nhất
 *  3. cùng cụm, cùng hướng nghĩa (không rõ hướng: cùng cụm)
 *  4. phần còn lại (cùng hướng trước)
 * Ở bậc 2–4 ưu tiên từ cùng loại từ. Loại trừ: nghĩa giống hệt từ đúng; cùng dòng từ
 * (trừ khi dữ liệu ghi rõ là confusable). Không lặp phương án.
 */
export function pickDistractors(word, idx, n = 3, rng = Math.random) {
  const out = [];
  const used = new Set([word.id]);
  const wm = normMeaning(word.meaning);
  const wDir = groupDirection(idx.groupById[word.group]);

  const accept = (c, allowFamily) => {
    if (!c || used.has(c.id) || out.length >= n) return;
    if (normMeaning(c.meaning) === wm) return;
    if (!allowFamily && sameFamily(word, c)) return;
    used.add(c.id);
    out.push(c.id);
  };
  const tier = (cands, keyFn) => {
    const list = shuffle(cands, rng).map((c, i) => ({ c, i, k: keyFn(c) }));
    list.sort((a, b) => {
      for (let t = 0; t < a.k.length; t++) if (a.k[t] !== b.k[t]) return a.k[t] - b.k[t];
      return a.i - b.i;
    });
    list.forEach((x) => accept(x.c, false));
  };
  const posKey = (c) => (posCompatible(word, c) ? 0 : 1);

  // 1. confusables
  word.confusables.forEach((id) => accept(idx.byId[id], true));
  (idx.reverseConf[word.id] || []).forEach((id) => accept(idx.byId[id], true));

  // 2. cùng nhóm, level gần nhất
  tier(idx.words.filter((c) => c.group === word.group && c.id !== word.id), (c) => {
    const d = word.level && c.level ? Math.abs(word.level - c.level) : 9;
    return [d, posKey(c)];
  });

  // 3. cùng cụm, cùng hướng (không rõ hướng: cùng cụm)
  tier(idx.words.filter((c) => {
    if (c.clusterId !== word.clusterId || c.id === word.id) return false;
    return !wDir || groupDirection(idx.groupById[c.group]) === wDir;
  }), (c) => [posKey(c)]);

  // 4. phần còn lại: cùng hướng trước, rồi cùng cụm, rồi cùng loại từ
  tier(idx.words.filter((c) => c.id !== word.id), (c) => {
    const dir = groupDirection(idx.groupById[c.group]);
    return [wDir && dir === wDir ? 0 : 1, c.clusterId === word.clusterId ? 0 : 1, posKey(c)];
  });

  // Bất đắc dĩ: nới điều kiện cùng dòng từ
  if (out.length < n) idx.words.forEach((c) => accept(c, true));
  return out;
}
