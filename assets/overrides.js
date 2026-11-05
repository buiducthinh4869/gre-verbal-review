/**
 * overrides.js: lớp đè nội dung (bản sửa của quản trị viên lưu trong tab content_overrides).
 * Dữ liệu gốc (file JSON trên GitHub) KHÔNG bao giờ bị sửa ở trình duyệt; web ghép bản sửa đè lên
 * theo (targetType, targetId, field) rồi mới dựng chỉ mục, hiển thị, luyện tập, sinh phương án nhiễu, chấm điểm.
 * Thuần JavaScript, test bằng node.
 *
 * Một override: { t: 'word' | 'exercise', id, f: tên trường, v: giá trị mới, ver: số phiên bản }.
 */
import { EDITABLE } from './validate.js';

export const okey = (t, id, f) => t + ':' + id + ':' + f;
export const tkey = (t, id) => t + ':' + id;

const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

/** Tìm bản gốc (chưa đè) của một từ / bài trong dữ liệu JSON: {cluster, item} hoặc null. */
export function findBase(vocab, t, id) {
  for (const c of (vocab && vocab.clusters) || []) {
    const list = t === 'word' ? c.words : c.exercises;
    const item = (list || []).find((x) => x.id === id);
    if (item) return { cluster: c, item };
  }
  return null;
}

/** Giá trị gốc của một trường (bản sao, để so sánh / ghi lịch sử). */
export function baseValue(vocab, t, id, f) {
  const b = findBase(vocab, t, id);
  if (!b) return undefined;
  const v = b.item[f];
  return v === undefined ? (f === 'hidden' ? false : undefined) : clone(v);
}

/** So sánh sâu hai giá trị JSON. */
export function sameValue(a, b) {
  const norm = (v) => (v === undefined ? null : v);
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

/**
 * Ghép overrides lên dữ liệu gốc. Trả về {clusters} MỚI; chỉ các từ / bài có bản sửa mới được sao chép,
 * phần còn lại dùng chung tham chiếu với dữ liệu gốc (dữ liệu gốc không bị thay đổi).
 * Bỏ qua override trỏ tới từ / bài không có, hoặc trường không được phép sửa (an toàn khi dữ liệu gốc đổi).
 */
export function applyOverrides(vocab, overrides) {
  const list = (overrides || []).filter((o) => o && EDITABLE[o.t] && EDITABLE[o.t].includes(o.f));
  if (!vocab || !list.length) return vocab;
  const by = {};
  list.forEach((o) => { (by[tkey(o.t, o.id)] = by[tkey(o.t, o.id)] || []).push(o); });
  const patch = (t, item) => {
    const os = by[tkey(t, item.id)];
    if (!os) return item;
    const out = Object.assign({}, item);
    os.forEach((o) => {
      if (o.f === 'level' && o.v == null) delete out.level;
      else out[o.f] = clone(o.v);
    });
    return out;
  };
  return Object.assign({}, vocab, {
    clusters: vocab.clusters.map((c) => Object.assign({}, c, {
      words: (c.words || []).map((w) => patch('word', w)),
      exercises: (c.exercises || []).map((ex) => patch('exercise', ex))
    }))
  });
}

/** Giá trị đang hiển thị (gốc + bản sửa) của một trường. */
export function currentValue(vocab, overrides, t, id, f) {
  const o = (overrides || []).find((x) => x.t === t && x.id === id && x.f === f);
  if (o) return clone(o.v);
  return baseValue(vocab, t, id, f);
}

/** Các bản sửa đã trùng với dữ liệu gốc hiện tại (đã đưa vào file JSON và GitHub Pages đã cập nhật). */
export function bakedOverrides(vocab, overrides) {
  return (overrides || []).filter((o) => findBase(vocab, o.t, o.id) && sameValue(baseValue(vocab, o.t, o.id, o.f), o.v));
}
