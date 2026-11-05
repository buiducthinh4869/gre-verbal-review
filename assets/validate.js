/**
 * validate.js: quy tắc hợp lệ của MỘT từ và MỘT bài GRE, dùng chung cho scripts/check-data.js (Node)
 * và cho trình sửa nội dung trên web (trình duyệt). Thuần JavaScript, không phụ thuộc gì.
 * apps-script/Content.js có bản viết lại tối thiểu tương đương (cùng câu báo lỗi) để server cũng kiểm tra.
 *
 * Mọi hàm trả về mảng câu báo lỗi tiếng Việt (rỗng = hợp lệ).
 */

/** Trường được phép sửa qua lớp đè (overrides). Không cho sửa id, group, cụm; không xóa (bài lỗi thì ẩn). */
export const EDITABLE = {
  word: ['word', 'pos', 'meaning', 'nuance', 'example', 'collocations', 'root', 'confusables', 'priority', 'level'],
  exercise: ['sentence', 'blanks', 'options', 'answers', 'targets', 'hint', 'explanation', 'hidden']
};

/** Tên tiếng Việt của từng trường (dùng trên giao diện và trong câu báo lỗi). */
export const FIELD_LABEL = {
  word: 'Từ', pos: 'Loại từ', meaning: 'Nghĩa', nuance: 'Sắc thái', example: 'Ví dụ', collocations: 'Collocation',
  root: 'Gốc từ', confusables: 'Từ dễ nhầm', priority: 'Mức ưu tiên', level: 'Mức trên thang',
  sentence: 'Câu', blanks: 'Chỗ trống và phương án', options: 'Phương án', answers: 'Đáp án', targets: 'Từ đích',
  hint: 'Gợi ý', explanation: 'Giải thích', hidden: 'Ẩn câu'
};

const LIMITS = { word: 120, pos: 20, meaning: 500, nuance: 2000, example: 2000, root: 300, coll: 120, sentence: 2000, hint: 2000, explanation: 3000, option: 120 };
const ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

const isStr = (v) => typeof v === 'string';
const isStrArr = (v) => Array.isArray(v) && v.every(isStr);

/** Các số trong {n} của câu, tăng dần, không trùng. */
export function placeholders(sentence) {
  const found = new Set();
  const re = /\{(\d+)\}/g;
  let m;
  while ((m = re.exec(String(sentence || '')))) found.add(Number(m[1]));
  return [...found].sort((a, b) => a - b);
}

function optionErrors(opts, label) {
  const errs = [];
  const seen = new Set();
  opts.forEach((o) => {
    const k = String(o).trim().toLowerCase();
    if (!k) errs.push(label + ': có phương án để trống');
    else if (seen.has(k)) errs.push(label + ': phương án "' + o + '" bị trùng');
    else if (k.length > LIMITS.option) errs.push(label + ': phương án "' + o + '" quá dài');
    seen.add(k);
  });
  return errs;
}

/**
 * Một từ. ctx: {hasWord(id) → bool, isScale (nhóm là thang)}. hasWord không có thì bỏ qua kiểm tra tham chiếu.
 */
export function validateWord(w, ctx = {}) {
  const errs = [];
  if (!w || typeof w !== 'object') return ['Dữ liệu từ không hợp lệ'];
  [['word', 'Từ'], ['pos', 'Loại từ'], ['meaning', 'Nghĩa']].forEach(([k, label]) => {
    if (!isStr(w[k]) || !w[k].trim()) errs.push(label + ' không được để trống');
    else if (w[k].length > LIMITS[k]) errs.push(label + ' quá dài (tối đa ' + LIMITS[k] + ' ký tự)');
  });
  [['nuance', 'Sắc thái'], ['example', 'Ví dụ'], ['root', 'Gốc từ']].forEach(([k, label]) => {
    if (w[k] == null) return;
    if (!isStr(w[k])) errs.push(label + ' phải là văn bản');
    else if (w[k].length > LIMITS[k]) errs.push(label + ' quá dài (tối đa ' + LIMITS[k] + ' ký tự)');
  });
  if (![1, 2, 3].includes(w.priority)) errs.push('Mức ưu tiên phải là 1, 2 hoặc 3');
  if (w.level != null && (!Number.isInteger(w.level) || w.level < 1 || w.level > 4)) errs.push('Mức trên thang phải là số nguyên từ 1 đến 4');
  if (ctx.isScale && w.level == null) errs.push('Từ thuộc nhóm thang nhẹ → mạnh nên phải có mức trên thang (1–4)');
  if (w.collocations != null) {
    if (!isStrArr(w.collocations)) errs.push('Collocation phải là danh sách văn bản');
    else {
      if (w.collocations.some((x) => !x.trim())) errs.push('Collocation có mục để trống');
      if (w.collocations.some((x) => x.length > LIMITS.coll)) errs.push('Có collocation quá dài (tối đa ' + LIMITS.coll + ' ký tự)');
      if (w.collocations.length > 20) errs.push('Tối đa 20 collocation');
    }
  }
  if (w.confusables != null) {
    if (!isStrArr(w.confusables)) errs.push('Từ dễ nhầm phải là danh sách id từ');
    else {
      if (w.confusables.length > 10) errs.push('Tối đa 10 từ dễ nhầm');
      if (new Set(w.confusables).size !== w.confusables.length) errs.push('Từ dễ nhầm bị trùng');
      w.confusables.forEach((id) => {
        if (id === w.id) errs.push('Từ dễ nhầm không được trỏ về chính từ này');
        else if (!ID_RE.test(id) || (ctx.hasWord && !ctx.hasWord(id))) errs.push('Từ dễ nhầm `' + id + '` không tồn tại');
      });
    }
  }
  return errs;
}

/** Một bài GRE (TC hoặc SE). ctx: {hasWord(id) → bool}. Bài đang ẩn vẫn phải hợp lệ về cấu trúc. */
export function validateExercise(ex, ctx = {}) {
  const errs = [];
  if (!ex || typeof ex !== 'object') return ['Dữ liệu câu không hợp lệ'];
  if (!isStr(ex.sentence) || !ex.sentence.trim()) errs.push('Câu không được để trống');
  else if (ex.sentence.length > LIMITS.sentence) errs.push('Câu quá dài (tối đa ' + LIMITS.sentence + ' ký tự)');
  if (!isStrArr(ex.targets) || !ex.targets.length) errs.push('Cần ít nhất một từ đích (targets)');
  else ex.targets.forEach((t) => { if (!ID_RE.test(t) || (ctx.hasWord && !ctx.hasWord(t))) errs.push('Từ đích `' + t + '` không tồn tại'); });
  [['hint', 'Gợi ý'], ['explanation', 'Giải thích']].forEach(([k, label]) => {
    if (ex[k] == null) return;
    if (!isStr(ex[k])) errs.push(label + ' phải là văn bản');
    else if (ex[k].length > LIMITS[k]) errs.push(label + ' quá dài (tối đa ' + LIMITS[k] + ' ký tự)');
  });
  if (ex.hidden != null && typeof ex.hidden !== 'boolean') errs.push('Trạng thái ẩn phải là có hoặc không');
  const ph = placeholders(ex.sentence);

  if (ex.type === 'tc') {
    const blanks = ex.blanks;
    if (!Array.isArray(blanks) || !blanks.length || blanks.length > 3) { errs.push('Câu TC phải có từ 1 đến 3 chỗ trống'); return errs; }
    if (ph.length !== blanks.length || ph.some((n, k) => n !== k)) {
      errs.push('`{0}` trong câu không khớp số chỗ trống: câu cần ' + blanks.map((_, k) => '{' + k + '}').join(', ') + ' (mỗi chỗ trống một lần đánh dấu)');
    }
    const want = blanks.length === 1 ? 5 : 3;
    blanks.forEach((b, k) => {
      const label = blanks.length > 1 ? 'Chỗ trống ' + (k + 1) : 'Phương án';
      if (!b || !isStrArr(b.options)) { errs.push(label + ': thiếu danh sách phương án'); return; }
      if (b.options.length !== want) errs.push('Câu TC ' + blanks.length + ' chỗ trống cần đúng ' + want + ' phương án mỗi chỗ' + (blanks.length > 1 ? ' (' + label.toLowerCase() + ' đang có ' + b.options.length + ')' : ' (đang có ' + b.options.length + ')'));
      optionErrors(b.options, label).forEach((e) => errs.push(e));
      if (!isStr(b.answer) || !b.options.includes(b.answer)) errs.push((blanks.length > 1 ? label + ': đ' : 'Đ') + 'áp án phải nằm trong danh sách phương án');
    });
  } else if (ex.type === 'se') {
    if (ph.length !== 1 || ph[0] !== 0) errs.push('`{0}` trong câu không khớp số chỗ trống: câu SE cần đúng một chỗ {0}');
    const opts = ex.options, ans = ex.answers;
    const okShape = isStrArr(opts) && opts.length === 6 && isStrArr(ans) && ans.length === 2;
    if (!okShape) errs.push('Câu SE phải có đúng 6 phương án và đúng 2 đáp án (đang có ' + (isStrArr(opts) ? opts.length : 0) + ' phương án, ' + (isStrArr(ans) ? ans.length : 0) + ' đáp án)');
    if (isStrArr(opts)) optionErrors(opts, 'Phương án').forEach((e) => errs.push(e));
    if (isStrArr(ans)) {
      if (ans.length === 2 && ans[0] === ans[1]) errs.push('Hai đáp án SE trùng nhau');
      if (ans.some((a) => !isStrArr(opts) || !opts.includes(a))) errs.push('Đáp án phải nằm trong danh sách phương án');
    }
  } else {
    errs.push('Loại câu phải là TC hoặc SE');
  }
  return errs;
}

/** Kiểm tra hình dạng giá trị của MỘT trường (dùng cho đề xuất sửa, trước khi ghép vào cả từ / cả câu). */
export function validateFieldValue(targetType, field, value) {
  if (!EDITABLE[targetType] || !EDITABLE[targetType].includes(field)) return ['Trường "' + field + '" không được phép sửa'];
  const one = targetType === 'word'
    ? validateWord(Object.assign({ word: 'x', pos: 'x', meaning: 'x', priority: 2 }, { [field]: value }))
    : [];
  if (targetType === 'word') return one;
  if (['sentence', 'hint', 'explanation'].includes(field)) return isStr(value) ? [] : [FIELD_LABEL[field] + ' phải là văn bản'];
  if (['options', 'answers', 'targets'].includes(field)) return isStrArr(value) ? [] : [FIELD_LABEL[field] + ' phải là danh sách'];
  if (field === 'blanks') return Array.isArray(value) && value.every((b) => b && isStrArr(b.options) && isStr(b.answer)) ? [] : ['Chỗ trống không hợp lệ'];
  if (field === 'hidden') return typeof value === 'boolean' ? [] : ['Trạng thái ẩn phải là có hoặc không'];
  return [];
}
