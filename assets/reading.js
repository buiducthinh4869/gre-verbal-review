/**
 * reading.js: Reading Comprehension cho thi thử (thuần JavaScript, test bằng node: tests/mock.test.js).
 *  - Dữ liệu: data/reading/passages.json. Mỗi đoạn văn có paragraphs (mảng đoạn, mỗi đoạn là mảng câu) và questions.
 *  - Ba dạng câu hỏi như đề thật: mc (chọn 1 trong 5), multi (chọn mọi đáp án đúng trong 3, phải đúng hết mới tính),
 *    sentence (chọn một câu trong đoạn văn; answer là số thứ tự câu tính từ 0 trên toàn đoạn văn).
 *  - Câu hỏi Reading có type 'rc' và nằm riêng (không vào App.idx.exercises), chỉ dùng trong thi thử.
 */
export const RC_KINDS = { mc: 'mc', multi: 'multi', sentence: 'sentence' };

const isStr = (x) => typeof x === 'string' && x.trim().length > 0;

/** Dựng chỉ mục: {passages: [...], byId: {id câu hỏi: câu hỏi}}; mỗi câu hỏi có passageId, passage (tham chiếu), sentences. */
export function buildReading(data) {
  const passages = [], byId = {};
  ((data && data.passages) || []).forEach((p) => {
    const sentences = (p.paragraphs || []).flat();
    const pass = { id: p.id, title: p.title || '', length: p.length || '', paragraphs: p.paragraphs || [], sentences, questionIds: [] };
    (p.questions || []).forEach((q) => {
      const e = Object.assign({}, q, { type: 'rc', passageId: p.id, passage: pass });
      byId[q.id] = e;
      pass.questionIds.push(q.id);
    });
    passages.push(pass);
  });
  return { passages, byId };
}

/** Kiểm tra dữ liệu Reading; trả về danh sách lỗi (rỗng nếu hợp lệ). knownIds: Set id câu TC/SE (không được trùng). */
export function validateReading(data, knownIds) {
  const errs = [];
  if (!data || data.schemaVersion !== 1) errs.push('schemaVersion phải là 1');
  const seen = new Set();
  ((data && data.passages) || []).forEach((p, i) => {
    const where = 'Đoạn ' + (p && p.id ? p.id : '#' + (i + 1));
    if (!p || !isStr(p.id)) { errs.push(where + ': thiếu id'); return; }
    if (seen.has(p.id)) errs.push(where + ': id bị trùng');
    seen.add(p.id);
    if (!Array.isArray(p.paragraphs) || !p.paragraphs.length || !p.paragraphs.every((x) => Array.isArray(x) && x.length && x.every(isStr))) errs.push(where + ': paragraphs phải là mảng đoạn, mỗi đoạn là mảng câu');
    const nSent = Array.isArray(p.paragraphs) ? p.paragraphs.flat().length : 0;
    if (!Array.isArray(p.questions) || !p.questions.length) { errs.push(where + ': cần ít nhất một câu hỏi'); return; }
    p.questions.forEach((q) => {
      const w = where + ', câu ' + (q && q.id);
      if (!q || !isStr(q.id)) { errs.push(where + ': câu hỏi thiếu id'); return; }
      if (seen.has(q.id) || (knownIds && knownIds.has(q.id))) errs.push(w + ': id bị trùng');
      seen.add(q.id);
      if (!isStr(q.stem)) errs.push(w + ': thiếu stem');
      if (q.kind === 'mc') {
        if (!Array.isArray(q.options) || q.options.length !== 5 || !q.options.every(isStr)) errs.push(w + ': dạng mc cần đúng 5 phương án');
        else if (!q.options.includes(q.answer)) errs.push(w + ': answer phải là một phương án');
      } else if (q.kind === 'multi') {
        if (!Array.isArray(q.options) || q.options.length !== 3 || !q.options.every(isStr)) errs.push(w + ': dạng multi cần đúng 3 phương án');
        else if (!Array.isArray(q.answers) || !q.answers.length || !q.answers.every((a) => q.options.includes(a)) || new Set(q.answers).size !== q.answers.length) errs.push(w + ': answers phải gồm 1–3 phương án khác nhau');
      } else if (q.kind === 'sentence') {
        if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= nSent) errs.push(w + ': answer phải là số thứ tự câu (0–' + (nSent - 1) + ')');
      } else errs.push(w + ': kind phải là mc, multi hoặc sentence');
      if (q.difficulty != null && ![1, 2, 3].includes(q.difficulty)) errs.push(w + ': difficulty phải là 1, 2 hoặc 3');
    });
  });
  return errs;
}

/** Đáp án đúng dưới dạng mảng chuỗi (cùng dạng với lựa chọn lưu trong bài làm). */
export const rcAnswers = (q) => (q.kind === 'multi' ? q.answers.slice() : [String(q.answer)]);

/** Chấm một câu Reading: chỉ đúng khi chọn đúng toàn bộ (dạng multi không có điểm từng phần). */
export function gradeRC(q, choice) {
  const c = (choice || []).map(String);
  const ans = rcAnswers(q);
  return c.length === ans.length && ans.every((a) => c.includes(a));
}
