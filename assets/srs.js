/**
 * srs.js: lặp lại ngắt quãng (hộp Leitner), sổ từ hay quên, phiên ôn hôm nay.
 * Thuần JavaScript, không phụ thuộc trình duyệt; test bằng node (tests/srs.test.js).
 */

export const INTERVALS = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 };
export const MASTERED_REPEAT = 60; // hộp 5 trả lời đúng: giữ hộp 5, hẹn 60 ngày
export const MAX_BOX = 5;
const VN_OFFSET_MS = 7 * 3600 * 1000; // Asia/Ho_Chi_Minh, không có giờ mùa hè

/* ---------------- Ngày giờ (giờ Việt Nam) ---------------- */

export function vnDate(ms) {
  return new Date(ms + VN_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(dateStr, n) {
  const p = dateStr.split('-');
  const d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  const pa = a.split('-'), pb = b.split('-');
  return Math.round((Date.UTC(+pb[0], +pb[1] - 1, +pb[2]) - Date.UTC(+pa[0], +pa[1] - 1, +pa[2])) / 86400000);
}

export function isDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/* ---------------- Trạng thái từ ---------------- */

export function newState(wordId) {
  return {
    wordId, box: 0, dueDate: '', lapses: 0, correctStreak: 0, totalReviews: 0,
    lastResult: '', lastReviewed: '', confusedWith: [], updatedAt: '', lastMoved: ''
  };
}

function clampInt(v, lo, hi) {
  let n = parseInt(v, 10);
  if (isNaN(n)) n = lo;
  return Math.max(lo, Math.min(hi, n));
}

/** Chuẩn hóa một bản trạng thái (từ Sheet: mọi giá trị là chuỗi). Phải khớp normalizeState_ trong apps-script/Store.js. */
export function normalizeState(raw) {
  const s = newState(String(raw.wordId || ''));
  s.box = clampInt(raw.box, 0, MAX_BOX);
  s.dueDate = isDateStr(raw.dueDate) ? raw.dueDate : '';
  s.lapses = clampInt(raw.lapses, 0, 9999);
  s.correctStreak = clampInt(raw.correctStreak, 0, 9999);
  s.totalReviews = clampInt(raw.totalReviews, 0, 999999);
  s.lastResult = ['again', 'hard', 'good'].includes(raw.lastResult) ? raw.lastResult : '';
  s.lastReviewed = raw.lastReviewed ? String(raw.lastReviewed) : '';
  let cw = raw.confusedWith;
  if (typeof cw === 'string') cw = cw ? cw.split(/[,;\s]+/) : [];
  s.confusedWith = (cw || []).filter(Boolean).map(String).slice(0, 5);
  s.updatedAt = raw.updatedAt ? String(raw.updatedAt) : '';
  s.lastMoved = isDateStr(raw.lastMoved) ? raw.lastMoved : '';
  return s;
}

function clone(s) {
  return Object.assign({}, s, { confusedWith: (s.confusedWith || []).slice() });
}

/**
 * Cập nhật trạng thái sau một câu trả lời: 'again' (Chưa nhớ / sai), 'hard' (Tạm), 'good' (Thuộc / đúng).
 * - Mỗi từ đổi hộp tối đa một lần mỗi ngày (lastMoved). Bị đánh rớt hôm nay rồi trả lời đúng trong
 *   cùng ngày thì vẫn ở hộp 1 và hẹn ngày mai.
 * - Lần gặp đầu (hộp 0) mà sai không tính là quên (lapse), vì chưa từng thuộc.
 */
export function applyResult(state, result, today, nowIso) {
  const s = clone(state);
  const prevBox = s.box || 0;
  s.totalReviews += 1;
  s.lastResult = result;
  s.lastReviewed = nowIso;
  s.updatedAt = nowIso;

  if (result === 'again') {
    if (prevBox >= 1) s.lapses += 1;
    s.box = 1;
    s.correctStreak = 0;
    s.dueDate = today;
    s.lastMoved = today;
  } else if (result === 'hard') {
    if (s.box < 1) { s.box = 1; s.lastMoved = today; }
    s.dueDate = addDays(today, 1);
  } else if (result === 'good') {
    if (prevBox >= 1 && s.lastMoved === today) {
      // đã đổi hộp hôm nay: chỉ ghi nhận lượt ôn; nếu đang đến hạn thì dời sang mai
      if (!s.dueDate || s.dueDate <= today) s.dueDate = addDays(today, 1);
    } else {
      if (prevBox >= MAX_BOX) {
        s.box = MAX_BOX;
        s.dueDate = addDays(today, MASTERED_REPEAT);
      } else {
        s.box = prevBox + 1;
        s.dueDate = addDays(today, INTERVALS[s.box]);
      }
      s.correctStreak += 1;
      s.lastMoved = today;
    }
  } else {
    throw new Error('Kết quả không hợp lệ: ' + result);
  }
  return s;
}

/** Chỉ ghi nhận một lượt gặp (các targets không phải đáp án trong bài GRE). */
export function touchReview(state, nowIso) {
  const s = clone(state);
  s.totalReviews += 1;
  s.updatedAt = nowIso;
  return s;
}

export function addConfusion(state, otherId, nowIso) {
  const s = clone(state);
  if (!otherId || otherId === s.wordId) return s;
  s.confusedWith = [otherId].concat(s.confusedWith.filter((x) => x !== otherId)).slice(0, 5);
  s.updatedAt = nowIso;
  return s;
}

/** Sổ từ hay quên: vào khi lapses ≥ 2, hoặc vừa quên (again) và lapses ≥ 1; rời khi correctStreak ≥ 3.
 *  correctStreak chỉ tăng khi lên hộp, tối đa một lần mỗi ngày, nên streak 3 luôn trải trên ≥ 3 ngày khác nhau.
 *  Phải khớp isLeech_ trong apps-script/Store.js. */
export function isLeech(s) {
  if (!s) return false;
  if (s.correctStreak >= 3) return false;
  return s.lapses >= 2 || (s.lastResult === 'again' && s.lapses >= 1);
}

export function isDue(s, today) {
  return !!s && s.box >= 1 && !!s.dueDate && s.dueDate <= today;
}

/** new (chưa học), learning (đang học), known (đã thuộc), leech (hay quên). */
export function statusOf(s) {
  if (!s || s.box === 0) return 'new';
  if (isLeech(s)) return 'leech';
  return s.box >= 4 ? 'known' : 'learning';
}

/** Gộp hai bản trạng thái: bản có updatedAt mới hơn thắng. */
export function newer(a, b) {
  if (!a) return b;
  if (!b) return a;
  return String(b.updatedAt || '') > String(a.updatedAt || '') ? b : a;
}

export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------------- Phiên ôn hôm nay ---------------- */

function newWordOrder(a, b) {
  if (a.clusterOrder !== b.clusterOrder) return a.clusterOrder - b.clusterOrder;
  if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
  return a.fileIndex - b.fileIndex;
}

/**
 * Thẻ hôm nay: từ đến hạn (sổ hay quên trước, hộp thấp trước) rồi từ mới.
 * opts: {today, newLimit, newDoneToday, max} hoặc {today, newIds, max}: newIds = danh sách từ mới cố định của hôm nay
 * (chỉ lấy các từ trong đó còn chưa học, theo đúng thứ tự). Trả về {items: [{wordId, isNew}], total, dueCount, newCount}.
 */
export function buildDailyQueue(idx, states, opts) {
  const today = opts.today;
  const max = opts.max || 40;
  const due = idx.words.filter((w) => isDue(states[w.id], today));
  due.sort((a, b) => {
    const sa = states[a.id], sb = states[b.id];
    const la = isLeech(sa) ? 0 : 1, lb = isLeech(sb) ? 0 : 1;
    if (la !== lb) return la - lb;
    if (sa.box !== sb.box) return sa.box - sb.box;
    if (sa.dueDate !== sb.dueDate) return sa.dueDate < sb.dueDate ? -1 : 1;
    return (b.priority || 0) - (a.priority || 0);
  });
  let fresh;
  if (Array.isArray(opts.newIds)) {
    fresh = opts.newIds.map((id) => idx.byId[id]).filter((w) => { const s = w && states[w.id]; return w && (!s || !s.box); });
  } else {
    const room = Math.max(0, (opts.newLimit || 0) - (opts.newDoneToday || 0));
    fresh = unlearnedWords(idx, states).slice(0, room);
  }
  const items = due.map((w) => ({ wordId: w.id, isNew: false }))
    .concat(fresh.map((w) => ({ wordId: w.id, isNew: true })));
  return { items: items.slice(0, max), total: items.length, dueCount: due.length, newCount: fresh.length };
}

/** Các từ chưa học theo thứ tự giới thiệu (cụm theo order, priority cao trước, theo thứ tự file). */
export function unlearnedWords(idx, states) {
  return idx.words.filter((w) => { const s = states[w.id]; return !s || !s.box; }).sort(newWordOrder);
}

/** Chuỗi ngày ôn liên tục, tính đến hôm nay (hoặc hôm qua nếu hôm nay chưa ôn). */
export function streakDays(activeDays, today) {
  const set = new Set(activeDays || []);
  let d = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(d)) { n++; d = addDays(d, -1); }
  return n;
}
