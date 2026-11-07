/**
 * bank.js: ngân hàng câu GRE (đợt bài tập 01). Thuần JavaScript, test bằng node (tests/bank.test.js).
 *  - phân loại câu (dạng, độ khó, kỹ năng, câu mới) và bộ lọc luyện tập;
 *  - bảng "Ngân hàng câu hỏi" theo cụm và dạng;
 *  - "Từ vựng cần biết" cho một bộ câu (nhóm liên quan, từ ngoài web);
 *  - giữ câu cho đề thi thử cố định chưa làm;
 *  - chèn thẻ ôn nhanh khi trả lời sai một câu GRE trong Luyện tập.
 */
import { DIFFICULTY, SKILLS } from './validate.js';

export { DIFFICULTY, SKILLS };
export const KINDS = ['tc1', 'tc2', 'tc3', 'se'];
export const KIND_SHORT = { tc1: 'TC 1 chỗ trống', tc2: 'TC 2 chỗ trống', tc3: 'TC 3 chỗ trống', se: 'SE' };
export const exKind = (ex) => (ex.type === 'se' ? 'se' : 'tc' + (ex.blanks || []).length);
export const isNewEx = (ex) => !!ex.addedIn && ex.addedIn !== 'base';

/* ---------------- Bộ lọc ---------------- */

/**
 * Lọc câu theo điều kiện (mảng rỗng / 'all' = không lọc):
 * f: {kinds: ['tc1', ...], diffs: [1, 2, 3], skills: [mã] (câu có ít nhất MỘT kỹ năng đã chọn), onlyNew, group: id nhóm | 'all'}
 * Câu chưa phân loại độ khó / kỹ năng không qua được bộ lọc độ khó / kỹ năng tương ứng.
 */
export function filterExercises(list, f = {}) {
  const kinds = f.kinds || [], diffs = (f.diffs || []).map(Number), skills = f.skills || [];
  return list.filter((ex) =>
    (!kinds.length || kinds.includes(exKind(ex))) &&
    (!diffs.length || diffs.includes(ex.difficulty)) &&
    (!skills.length || (ex.skills || []).some((s) => skills.includes(s))) &&
    (!f.onlyNew || isNewEx(ex)) &&
    (!f.group || f.group === 'all' || (ex.relatedGroups || []).includes(f.group)));
}

/** Bảng ngân hàng câu: {rows: [{clusterId, title, tc1, tc2, tc3, se, total}], total: {...}} theo thứ tự cụm. */
export function bankTable(idx) {
  const zero = () => ({ tc1: 0, tc2: 0, tc3: 0, se: 0, total: 0 });
  const total = zero();
  const rows = idx.clusters.filter((c) => !c.custom).map((c) => Object.assign({ clusterId: c.id, title: c.title }, zero()));
  const by = Object.fromEntries(rows.map((r) => [r.clusterId, r]));
  idx.exercises.forEach((ex) => {
    const r = by[ex.clusterId];
    const k = exKind(ex);
    if (r) { r[k]++; r.total++; }
    total[k]++; total.total++;
  });
  return { rows, total };
}

/* ---------------- Từ vựng cần biết ---------------- */

/**
 * Từ vựng cần biết cho một bộ câu. progress: {wordId: state}. Trả về
 * {groups: [{id, title, clusterId, clusterTitle, nEx, learned, total, words: [id]}], outside: [từ ngoài web]}
 * Nhóm sắp theo số câu dùng tới giảm dần, rồi theo thứ tự cụm và thứ tự trong cụm.
 */
export function vocabNeeded(exercises, idx, progress) {
  const by = {}, outside = [];
  exercises.forEach((ex) => {
    (ex.relatedGroups || []).forEach((g) => { by[g] = (by[g] || 0) + 1; });
    (ex.outsideWords || []).forEach((w) => { const k = String(w).toLowerCase().trim().replace(/^(a|an|the)\s+/, ''); if (k && !outside.includes(k)) outside.push(k); });
  });
  const order = {};
  idx.clusters.forEach((c, ci) => (c.groups || []).forEach((g, gi) => { order[g.id] = ci * 1000 + gi; }));
  const groups = Object.keys(by).filter((g) => idx.groupById[g]).map((g) => {
    const gr = idx.groupById[g];
    const words = idx.words.filter((w) => w.group === g).map((w) => w.id);
    const learned = words.filter((id) => progress && progress[id] && progress[id].box >= 1).length;
    return { id: g, title: gr.title, clusterId: gr.clusterId, clusterTitle: (idx.clusterById[gr.clusterId] || {}).title || '', nEx: by[g], learned, total: words.length, words };
  });
  groups.sort((a, b) => b.nEx - a.nEx || (order[a.id] || 0) - (order[b.id] || 0));
  outside.sort();
  return { groups, outside };
}

/* ---------------- Giữ câu cho đề thi thử cố định chưa làm ---------------- */

/** Id các đề cố định người dùng đã nộp ít nhất một lần (từ lịch sử thi thử: mode = 'fixed'). */
export function doneFixedIds(mocks) {
  return new Set((mocks || []).filter((m) => m && m.mode === 'fixed').map((m) => m.mockId));
}

/** Id các câu đang được giữ: thuộc một đề cố định mà người dùng chưa làm lần nào. */
export function heldExerciseIds(fixedMocks, done) {
  const held = new Set();
  (fixedMocks || []).forEach((m) => {
    if (done && done.has(m.id)) return;
    (m.sections || []).forEach((s) => (s.items || []).forEach((id) => held.add(id)));
  });
  return held;
}

/* ---------------- Luyện lại ngay khi sai ---------------- */

export const QUICK_GAP = [3, 5]; // thẻ ôn nhanh chen vào sau 3–5 thẻ

/**
 * Chèn thẻ ôn nhanh cho các từ đáp án vừa sai (thay đổi trực tiếp mảng cards).
 * i: vị trí thẻ hiện tại; boxOf(id): hộp của từ TRƯỚC khi trả lời câu này; used: Set từ đã chèn trong phiên (tối đa một lần mỗi từ).
 * Hộp 0–2 → thẻ Nghĩa → Từ (m2w); hộp ≥ 3 → thẻ Từ → Nghĩa (w2m, tự chấm). Trả về các thẻ đã chèn.
 */
export function insertQuickCards(cards, i, wordIds, boxOf, used, rng = Math.random) {
  const added = [];
  (wordIds || []).forEach((id) => {
    if (used.has(id)) return;
    used.add(id);
    const gap = QUICK_GAP[0] + Math.floor(rng() * (QUICK_GAP[1] - QUICK_GAP[0] + 1));
    // đứng sau đúng `gap` thẻ thường kể từ câu vừa sai (thẻ ôn nhanh vừa chèn không tính vào khoảng cách)
    let pos = i + 1, seen = 0;
    while (pos < cards.length && seen < gap) { if (!added.includes(cards[pos])) seen++; pos++; }
    while (pos < cards.length && added.includes(cards[pos])) pos++;
    const card = { type: (boxOf(id) || 0) >= 3 ? 'w2m' : 'm2w', wordId: id, quick: true };
    cards.splice(pos, 0, card);
    added.push(card);
  });
  return added;
}

/**
 * Câu GRE KHÁC có chứa các từ (trong targets), trừ các câu đã dùng trong phiên và các câu bị loại (skip).
 * Câu chứa nhiều từ vừa sai được ưu tiên trước.
 */
export function otherExercisesFor(wordIds, exercises, usedIds, skip) {
  const ws = new Set(wordIds || []);
  const hits = (ex) => (ex.targets || []).filter((t) => ws.has(t)).length;
  return (exercises || []).filter((ex) => !(usedIds && usedIds.has(ex.id)) && !(skip && skip.has(ex.id)) && hits(ex) > 0)
    .sort((a, b) => hits(b) - hits(a));
}
