/**
 * distractors.js: sinh phương án nhiễu cho bài Nghĩa → Từ.
 * Phương án sai phải cùng hướng nghĩa nhưng sai sắc thái hoặc mức độ, như cách GRE bẫy.
 * Thuần JavaScript, test bằng node (tests/distractors.test.js).
 */
import { shuffle } from './srs.js';
import { groupDirection, directionsMatch } from './vocab.js';

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
 *  1. confusables của từ đúng (rồi các từ coi từ đúng là confusable), kể cả từ ở cụm khác
 *  2. cùng nhóm, level gần nhất
 *  3. cùng cụm, cùng hướng nghĩa ("direction" của nhóm; nhóm neutral hợp với mọi hướng)
 *  4. cùng hướng nghĩa ở cụm khác
 *  5. còn thiếu mới lấy từ khác hướng
 * Ở bậc 2–5 ưu tiên từ cùng loại từ. Loại trừ: nghĩa giống hệt từ đúng; cùng dòng từ
 * (trừ khi dữ liệu ghi rõ là confusable). Không lặp phương án.
 */
export function pickDistractors(word, idx, n = 3, rng = Math.random) {
  const out = [];
  const used = new Set([word.id]);
  const wm = normMeaning(word.meaning);
  const wDir = groupDirection(idx.groupById[word.group]);
  const dirOf = (c) => groupDirection(idx.groupById[c.group]);
  const sameDir = (c) => directionsMatch(wDir, dirOf(c));

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
  const others = idx.words.filter((c) => c.id !== word.id);

  // 1. confusables (được phép trỏ sang cụm khác)
  word.confusables.forEach((id) => accept(idx.byId[id], true));
  (idx.reverseConf[word.id] || []).forEach((id) => accept(idx.byId[id], true));

  // 2. cùng nhóm, level gần nhất
  tier(others.filter((c) => c.group === word.group), (c) => {
    const d = word.level && c.level ? Math.abs(word.level - c.level) : 9;
    return [d, posKey(c)];
  });

  // 3. cùng cụm, cùng hướng (từ chưa rõ hướng, vd Từ tự thêm: cùng cụm)
  tier(others.filter((c) => c.clusterId === word.clusterId && (!wDir || sameDir(c))), (c) => [posKey(c)]);

  // 4. cùng hướng ở cụm khác
  if (wDir) tier(others.filter((c) => c.clusterId !== word.clusterId && sameDir(c)), (c) => [dirOf(c) === wDir ? 0 : 1, posKey(c)]);

  // 5. còn thiếu: phần còn lại, cùng cụm trước
  tier(others, (c) => [c.clusterId === word.clusterId ? 0 : 1, posKey(c)]);

  // Bất đắc dĩ: nới điều kiện cùng dòng từ
  if (out.length < n) idx.words.forEach((c) => accept(c, true));
  return out;
}
