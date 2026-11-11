/**
 * todaylist.js: "Danh sách hôm nay" (đợt 02). Thuần JavaScript, test bằng node (tests/todaylist.test.js).
 *  - Từ mới cố định trong ngày: chọn một lần (thứ tự cụm, mức ưu tiên như phiên ôn), lưu ở cài đặt `todayNew:<YYYY-MM-DD>`.
 *  - Đến hạn: ảnh chụp đầu ngày (`todayDue:<YYYY-MM-DD>`) cộng các từ đến hạn hiện tại, để từ đã ôn xong vẫn còn trong
 *    danh sách (có dấu ✓) thay vì biến mất.
 *  - Hay quên: các từ đang trong sổ hay quên.
 *  - KPI: một từ "đã ôn hôm nay" khi có ít nhất một câu trả lời về nó trong ngày (giờ Việt Nam): lastReviewed của
 *    trạng thái là hôm nay. Bài GRE chỉ ghi lastReviewed cho từ ở đáp án (các từ đích khác chỉ được "touch").
 */
import { vnDate, daysBetween, isDue, isLeech, unlearnedWords } from './srs.js';

export const KEEP_DAYS = 7;
export const CARDS = ['due', 'new', 'leech'];
export const CARD_LABEL = { due: 'Đến hạn', new: 'Từ mới', leech: 'Hay quên' };
export const newKey = (day) => 'todayNew:' + day;
export const dueKey = (day) => 'todayDue:' + day;
const DAY_KEY_RE = /^today(New|Due):(\d{4}-\d{2}-\d{2})$/;

/** Khóa danh sách theo ngày cũ hơn KEEP_DAYS ngày (bỏ qua khi đọc; dòng trong Sheet vẫn giữ). */
export function isStaleDayKey(key, today) {
  const m = DAY_KEY_RE.exec(String(key));
  return !!m && daysBetween(m[2], today) > KEEP_DAYS;
}

/** Bỏ các khóa danh sách theo ngày đã cũ khỏi một bản cài đặt (bản sao mới). */
export function dropStaleDayKeys(settings, today) {
  const out = {};
  Object.keys(settings || {}).forEach((k) => { if (!isStaleDayKey(k, today)) out[k] = settings[k]; });
  return out;
}

const idList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : null);
const sameList = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Từ mới hôm nay. opts: {today, newLimit, newDoneToday, stored (giá trị đã lưu của todayNew:<today> hoặc undefined)}.
 * Đã lưu thì dùng đúng danh sách đó (bỏ id không còn trong dữ liệu); chưa có thì chọn các từ chưa học đầu tiên theo thứ tự
 * giới thiệu, đủ chỗ còn lại của hôm nay. Trả về {ids, save}: save = true khi cần lưu (danh sách mới tạo).
 */
export function pickTodayNew(idx, progress, opts) {
  const stored = idList(opts.stored);
  if (stored) return { ids: stored.filter((id) => idx.byId[id]), save: false };
  const room = Math.max(0, (Number(opts.newLimit) || 0) - (Number(opts.newDoneToday) || 0));
  return { ids: unlearnedWords(idx, progress).slice(0, room).map((w) => w.id), save: true };
}

/**
 * Đến hạn hôm nay: ảnh chụp đầu ngày (đã lưu) + từ đến hạn hiện tại (dueDate ≤ hôm nay, hộp ≥ 1), trừ các từ của
 * danh sách từ mới hôm nay (từ mới trả lời sai cũng "đến hạn" nhưng đã nằm ở thẻ Từ mới).
 * Trả về {ids, save}: save = true khi danh sách khác bản đã lưu (lần đầu trong ngày, hoặc có thêm từ đến hạn).
 */
export function pickTodayDue(idx, progress, opts) {
  const stored = idList(opts.stored);
  const skip = new Set(opts.newIds || []);
  const ids = (stored || []).filter((id) => idx.byId[id] && !skip.has(id));
  const have = new Set(ids);
  dueOrder(idx, progress, opts.today).forEach((w) => { if (!have.has(w.id) && !skip.has(w.id)) { ids.push(w.id); have.add(w.id); } });
  return { ids, save: !sameList(stored, ids) };
}

/** Từ đến hạn hiện tại, cùng thứ tự với phiên ôn (sổ hay quên trước, hộp thấp trước, quá hạn lâu trước). */
function dueOrder(idx, progress, today) {
  const due = idx.words.filter((w) => isDue(progress[w.id], today));
  return due.sort((a, b) => {
    const sa = progress[a.id], sb = progress[b.id];
    const la = isLeech(sa) ? 0 : 1, lb = isLeech(sb) ? 0 : 1;
    if (la !== lb) return la - lb;
    if (sa.box !== sb.box) return sa.box - sb.box;
    if (sa.dueDate !== sb.dueDate) return sa.dueDate < sb.dueDate ? -1 : 1;
    return (b.priority || 0) - (a.priority || 0);
  });
}

/** Các từ trong sổ hay quên (quên nhiều trước). */
export function pickLeech(idx, progress) {
  return idx.words.filter((w) => isLeech(progress[w.id])).sort((a, b) => progress[b.id].lapses - progress[a.id].lapses).map((w) => w.id);
}

/** Id các từ đã có câu trả lời hôm nay (giờ Việt Nam). */
export function reviewedToday(progress, today) {
  const out = new Set();
  Object.keys(progress || {}).forEach((id) => {
    const s = progress[id];
    const ms = s && s.lastReviewed ? Date.parse(s.lastReviewed) : NaN;
    if (!isNaN(ms) && vnDate(ms) === today) out.add(id);
  });
  return out;
}

/** Hợp các thẻ (không trùng, giữ thứ tự Đến hạn → Từ mới → Hay quên). */
export function unionIds(lists) {
  const seen = new Set(), out = [];
  CARDS.forEach((k) => (lists[k] || []).forEach((id) => { if (!seen.has(id)) { seen.add(id); out.push(id); } }));
  return out;
}

/** KPI: {due: {done, total}, new: {...}, leech: {...}, all: {...}} theo tập từ đã ôn hôm nay. */
export function todayKpi(lists, reviewed) {
  const k = (ids) => ({ done: ids.filter((id) => reviewed.has(id)).length, total: ids.length });
  return { due: k(lists.due || []), new: k(lists.new || []), leech: k(lists.leech || []), all: k(unionIds(lists)) };
}

/** Thẻ mặc định: thẻ đầu tiên còn từ chưa ôn; hết thì thẻ đầu tiên có từ; không có gì thì 'due'. */
export function firstOpenCard(lists, reviewed) {
  return CARDS.find((k) => (lists[k] || []).some((id) => !reviewed.has(id))) || CARDS.find((k) => (lists[k] || []).length) || 'due';
}

/**
 * Nhóm từ theo cụm › nhóm, theo thứ tự cụm, thứ tự nhóm trong cụm, thứ tự từ trong file.
 * Trả về [{clusterId, title, n, groups: [{groupId, title, ids}]}].
 */
export function groupByClusterGroup(ids, idx) {
  const words = ids.map((id) => idx.byId[id]).filter(Boolean);
  const cOrder = {}, gOrder = {};
  idx.clusters.forEach((c, ci) => { cOrder[c.id] = ci; (c.groups || []).forEach((g, gi) => { gOrder[g.id] = gi; }); });
  words.sort((a, b) => (cOrder[a.clusterId] - cOrder[b.clusterId]) || ((gOrder[a.group] || 0) - (gOrder[b.group] || 0)) || (a.fileIndex - b.fileIndex));
  const out = [];
  words.forEach((w) => {
    let c = out[out.length - 1];
    if (!c || c.clusterId !== w.clusterId) { c = { clusterId: w.clusterId, title: (idx.clusterById[w.clusterId] || {}).title || '', n: 0, groups: [] }; out.push(c); }
    let g = c.groups[c.groups.length - 1];
    if (!g || g.groupId !== w.group) { g = { groupId: w.group, title: (idx.groupById[w.group] || {}).title || '', ids: [] }; c.groups.push(g); }
    g.ids.push(w.id);
    c.n++;
  });
  return out;
}

/** Dòng tóm tắt chủ đề: "Khen & Chê (Khiển trách 3, Thang khen ngợi 2) · Rõ ràng & Khó hiểu (Khó hiểu 4)". */
export function topicLine(ids, idx) {
  return groupByClusterGroup(ids, idx).map((c) => c.title + ' (' + c.groups.map((g) => g.title + ' ' + g.ids.length).join(', ') + ')').join(' · ');
}

/** Số ngày quá hạn của một từ (0 nếu chưa quá hạn hoặc chưa học). */
export function overdueDays(state, today) {
  if (!state || !state.box || !state.dueDate || state.dueDate >= today) return 0;
  return daysBetween(state.dueDate, today);
}

/**
 * Câu GRE cho một danh sách từ: các câu có ít nhất một từ của danh sách là ĐÁP ÁN (answerIds).
 * exercises: câu đã qua bộ lọc (đã bỏ câu giữ cho đề thi thử chưa làm). n: số câu tối đa (Infinity = tất cả).
 * Chọn tham lam để phủ được nhiều từ nhất trước, rồi thêm ngẫu nhiên cho đủ n.
 * Trả về {found: số câu tìm được, picked: [câu], uncovered: [id từ không có câu GRE nào trong exercises]}.
 */
export function grePlan(wordIds, exercises, n, rng = Math.random) {
  const want = new Set(wordIds);
  const pool = (exercises || []).filter((ex) => (ex.answerIds || []).some((id) => want.has(id)));
  const covered = new Set();
  pool.forEach((ex) => ex.answerIds.forEach((id) => { if (want.has(id)) covered.add(id); }));
  const uncovered = wordIds.filter((id) => !covered.has(id));
  const limit = Math.min(n == null ? Infinity : n, pool.length);
  // xáo trộn trước để các câu ngang nhau được chọn ngẫu nhiên
  const left = pool.slice();
  for (let i = left.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [left[i], left[j]] = [left[j], left[i]]; }
  const picked = [], got = new Set();
  while (picked.length < limit && left.length) {
    let best = 0, bestGain = -1;
    left.forEach((ex, i) => {
      const gain = ex.answerIds.filter((id) => want.has(id) && !got.has(id)).length;
      if (gain > bestGain) { best = i; bestGain = gain; }
    });
    const ex = left.splice(best, 1)[0];
    ex.answerIds.forEach((id) => { if (want.has(id)) got.add(id); });
    picked.push(ex);
  }
  return { found: pool.length, picked, uncovered };
}
