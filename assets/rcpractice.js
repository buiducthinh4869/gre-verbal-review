/**
 * rcpractice.js: lõi tab Luyện Reading (thuần JavaScript, test bằng node: tests/rcpractice.test.js).
 *  - Dạng câu (task), quy trình 3 bước và 2 bẫy cho từng dạng: tóm tắt từ The Official Guide to the GRE General Test.
 *  - Lịch sử luyện: mảng lần làm {pid, mode, at, sec, items: [{q, ok, c, reason}]}, mới nhất ở cuối; lưu trên trình duyệt.
 *  - Lọc đoạn văn, trạng thái từng đoạn, thống kê theo dạng câu, chọn đoạn tiếp theo, thời gian gợi ý.
 */
import { gradeRC } from './reading.js';

export const LENGTHS = { short: 'Đoạn ngắn', long: 'Đoạn dài', argument: 'Lập luận' };

/** Dạng câu: nhãn, quy trình 3 bước, 2 bẫy hay gặp. Thứ tự là thứ tự hiển thị. */
export const TASKS = {
  purpose: { label: 'Ý chính / mục đích', steps: ['Nhớ lại cấu trúc và luận điểm của cả đoạn.', 'Tự tóm mục đích của tác giả trong một câu.', 'Loại phương án chỉ nói một chi tiết hoặc sai phạm vi.'], traps: ['Quá hẹp: chỉ khớp một đoạn hay một chi tiết.', 'Nói quá: cho rằng tác giả chứng minh hay giải quyết xong khi tác giả chỉ bàn.'] },
  detail: { label: 'Chi tiết', steps: ['Tìm đúng chỗ trong bài mà câu hỏi nhắc tới.', 'Đọc cả câu trước và sau để chắc ý.', 'Chọn phương án diễn đạt lại đúng điều bài nói.'], traps: ['Dùng đúng chữ trong bài nhưng sai quan hệ giữa các ý.', 'Kiến thức ngoài: đúng ngoài đời nhưng bài không nói.'] },
  inference: { label: 'Suy luận', steps: ['Xác định đối tượng câu hỏi nhắc tới.', 'Đọc lại phần liên quan, rút ra điều chắc chắn phải đúng.', 'Chọn phương án được bài trực tiếp hỗ trợ.'], traps: ['Suy diễn quá xa: hợp lý nhưng bài không đủ căn cứ.', 'Đảo quan hệ: ngược nhân quả hoặc ngược so sánh trong bài.'] },
  function: { label: 'Chức năng', steps: ['Tìm câu, chi tiết hay đoạn được hỏi.', 'Xem nó nối với câu trước, câu sau và mục đích chung thế nào.', 'Chọn vai trò: minh họa, giải thích, đối lập, giới hạn…'], traps: ['Tóm nội dung thay vì nói vai trò (nói gì thay vì để làm gì).', 'Gán sai quan hệ: chi tiết dùng để đối lập bị coi là ủng hộ.'] },
  attitude: { label: 'Thái độ tác giả', steps: ['Gạch các tính từ, trạng từ mang đánh giá của tác giả.', 'Xác định hướng: tích cực, tiêu cực, phê phán, trung lập.', 'Chọn phương án đúng cả mức độ.'], traps: ['Quá gắt: lên án, phẫn nộ khi tác giả chỉ dè dặt.', 'Lấy quan điểm được thuật lại làm quan điểm của tác giả.'] },
  vocab: { label: 'Nghĩa từ trong ngữ cảnh', steps: ['Đọc lại cả câu chứa từ.', 'Tự thay một từ của mình giữ được ý câu.', 'Chọn phương án khớp nghĩa ngữ cảnh, bỏ qua nghĩa từ điển quen.'], traps: ['Nghĩa thông dụng nhất của từ nhưng không hợp câu.', 'Khái niệm gần ngữ cảnh nhưng làm hỏng logic câu.'] },
  select: { label: 'Chọn câu trong đoạn', steps: ['Đọc kỹ mọi yếu tố trong mô tả.', 'Xét từng câu trong phạm vi được chỉ định.', 'Chọn câu khớp trọn mô tả.'], traps: ['Khớp một phần mô tả, thiếu một yếu tố bắt buộc.', 'Câu nằm ngoài đoạn được chỉ định.'] },
  weaken: { label: 'Làm yếu', steps: ['Tách tiền đề và kết luận.', 'Tìm giả định ngầm hoặc chỗ hở trong lập luận.', 'Chọn phương án phá chỗ hở đó hoặc đưa ra nguyên nhân khác.'], traps: ['Phương án lại củng cố lập luận.', 'Sự kiện ngoài phạm vi, không chạm tới kết luận.'] },
  strengthen: { label: 'Củng cố', steps: ['Tách tiền đề và kết luận.', 'Tìm giả định ngầm hoặc khoảng trống bằng chứng.', 'Chọn phương án xác nhận giả định, loại nguyên nhân khác hoặc thêm dữ liệu.'], traps: ['Phương án lại làm yếu lập luận.', 'Chỉ nhắc lại tiền đề đã có, không thêm sức nặng.'] },
  assumption: { label: 'Giả định', steps: ['Tách tiền đề và kết luận.', 'Hỏi: điều gì chưa nói ra nhưng phải đúng để kết luận đứng được?', 'Phép thử phủ định: phủ định phương án, lập luận phải sụp.'], traps: ['Quá mạnh: mạnh hơn mức lập luận thật sự cần.', 'Câu đúng nhưng không cần thiết để nối tiền đề với kết luận.'] },
  paradox: { label: 'Giải thích nghịch lý', steps: ['Tìm hai sự kiện có vẻ mâu thuẫn.', 'Nói rõ mâu thuẫn: A xảy ra, vậy mà B.', 'Chọn yếu tố mới khiến cả hai cùng đúng.'], traps: ['Làm mâu thuẫn sâu thêm.', 'Phủ nhận một trong hai sự kiện thay vì dung hòa.'] },
  boldface: { label: 'Vai trò phần in đậm', steps: ['Tìm kết luận chính của lập luận.', 'Gọi tên vai trò từng phần in đậm: bằng chứng, kết luận, dự đoán, quan điểm bị phản bác…', 'Chọn phương án đúng cả hai vai trò.'], traps: ['Đúng hai vai trò nhưng đảo thứ tự.', 'Nhầm kết luận chính với bằng chứng hay với quan điểm được thuật lại.'] },
  evaluate: { label: 'Đánh giá lập luận', steps: ['Tìm kết luận, đề xuất hay dự đoán chính.', 'Tìm giả định then chốt cần kiểm tra.', 'Chọn câu hỏi mà mỗi câu trả lời sẽ củng cố hoặc làm yếu kết luận.'], traps: ['Câu hỏi bên lề, trả lời kiểu gì cũng không đổi kết luận.', 'Chú ý cách trình bày thay vì logic.'] }
};
export const TASK_ORDER = Object.keys(TASKS);

/** Cách đọc đoạn văn trước khi trả lời, theo loại đoạn. */
export const READ_GUIDE = {
  all: ['Tách ý chính khỏi bằng chứng hỗ trợ.', 'Tách ý tác giả khỏi ý tác giả chỉ thuật lại; để ý mức độ cam kết (khẳng định hay chỉ giả thuyết).', 'Theo dõi từ tín hiệu: however, yet, thus, therefore, although, moreover.'],
  short: 'Đoạn ngắn (khoảng 100–200 từ): đọc liền một mạch, nắm cấu trúc và luận điểm.',
  long: 'Đoạn dài (khoảng 300–450 từ): ghi nhớ ý chính từng đoạn và chỗ chuyển ý, để biết chi tiết nằm ở đâu.',
  argument: 'Lập luận (khoảng 50–100 từ): tìm kết luận, bằng chứng, giả định ngầm và mạch nối từ bằng chứng tới kết luận.'
};

/** Lý do sai để ghi nhật ký (theo gợi ý của giáo trình). */
export const REASONS = {
  misread: 'Đọc sai chi tiết',
  partial: 'Phương án đúng một phần',
  outside: 'Dùng kiến thức ngoài',
  scope: 'Nói quá / sai phạm vi',
  time: 'Thiếu thời gian',
  other: 'Lý do khác'
};

/** Thời gian gợi ý cho một đoạn (giây): 1,5 phút mỗi câu, thêm 1 phút đọc cho đoạn dài. */
export const budgetSec = (p) => Math.round(p.questionIds.length * 90 + (p.length === 'long' ? 60 : 0));

/** Dạng câu của một câu hỏi (dữ liệu cũ thiếu task: suy từ kind). */
export const taskOf = (q) => (q && TASKS[q.task] ? q.task : q && q.kind === 'sentence' ? 'select' : 'inference');

/** Lần làm gần nhất của từng đoạn: {pid: attempt}. */
export function lastByPassage(hist) {
  const m = {};
  (hist || []).forEach((a) => { if (a && a.pid) m[a.pid] = a; });
  return m;
}

/** Trạng thái một đoạn: 'new' (chưa làm), 'wrong' (lần gần nhất còn câu sai), 'done' (lần gần nhất đúng hết). */
export function passageStatus(pid, last) {
  const a = last[pid];
  if (!a) return 'new';
  return a.items.every((x) => x.ok) ? 'done' : 'wrong';
}

/**
 * Lọc đoạn văn. f: {length: 'all'|'short'|'long'|'argument', tasks: [] (rỗng = mọi dạng), status: 'all'|'new'|'wrong'|'done'}.
 * held: Set id câu đang giữ cho đề thi thử cố định chưa làm; đoạn có câu đang giữ bị bỏ.
 */
export function filterPassages(passages, byId, f, last, held) {
  f = f || {};
  return passages.filter((p) => {
    if (held && p.questionIds.some((id) => held.has(id))) return false;
    if (f.length && f.length !== 'all' && p.length !== f.length) return false;
    if (f.tasks && f.tasks.length && !p.questionIds.some((id) => f.tasks.includes(taskOf(byId[id])))) return false;
    if (f.status && f.status !== 'all' && passageStatus(p.id, last || {}) !== f.status) return false;
    return true;
  });
}

/** Đoạn tiếp theo: ưu tiên đoạn chưa làm, rồi đoạn còn sai, rồi đoạn đã đúng lâu nhất; bỏ đoạn vừa làm nếu còn lựa chọn khác. */
export function pickNext(list, last, exceptPid) {
  const pool = list.length > 1 ? list.filter((p) => p.id !== exceptPid) : list;
  if (!pool.length) return null;
  const rank = { new: 0, wrong: 1, done: 2 };
  return pool.slice().sort((a, b) => {
    const sa = passageStatus(a.id, last), sb = passageStatus(b.id, last);
    if (sa !== sb) return rank[sa] - rank[sb];
    return ((last[a.id] || {}).at || 0) - ((last[b.id] || {}).at || 0);
  })[0];
}

/** Chấm một lần làm. choices: {qid: mảng chuỗi}. Trả về items [{q, ok, c}]. */
export function gradeAttempt(p, byId, choices) {
  return p.questionIds.map((id) => {
    const c = (choices[id] || []).map(String);
    return { q: id, ok: gradeRC(byId[id], c), c };
  });
}

/**
 * Thống kê theo dạng câu từ lịch sử: {task: {n, ok, sec}}; thời gian chia đều cho các câu của lần làm.
 * Mỗi câu chỉ tính lần làm gần nhất (để tiến bộ hiện ra khi làm lại), trừ khi all = true.
 */
export function taskStats(hist, byId, all) {
  const st = {};
  const seen = new Set();
  (hist || []).slice().reverse().forEach((a) => {
    const per = a.items.length ? (a.sec || 0) / a.items.length : 0;
    a.items.forEach((x) => {
      if (!all && seen.has(x.q)) return;
      seen.add(x.q);
      const q = byId[x.q];
      if (!q) return;
      const t = taskOf(q);
      const s = st[t] || (st[t] = { n: 0, ok: 0, sec: 0 });
      s.n += 1; if (x.ok) s.ok += 1; s.sec += per;
    });
  });
  return st;
}

/** Đếm lý do sai đã ghi trong lịch sử: {reason: số lần}. */
export function reasonStats(hist) {
  const r = {};
  (hist || []).forEach((a) => a.items.forEach((x) => { if (!x.ok && x.reason && REASONS[x.reason]) r[x.reason] = (r[x.reason] || 0) + 1; }));
  return r;
}

/** Dạng câu yếu nhất (ít nhất minN câu, tỉ lệ đúng thấp nhất); null nếu chưa đủ dữ liệu. */
export function weakestTask(stats, minN) {
  let best = null;
  Object.keys(stats).forEach((t) => {
    const s = stats[t];
    if (s.n < (minN || 3)) return;
    const r = s.ok / s.n;
    if (!best || r < best.r) best = { task: t, r, n: s.n };
  });
  return best && best.r < 1 ? best : null;
}

/** Giữ lịch sử gọn: tối đa max lần làm gần nhất. */
export const trimHistory = (hist, max) => (hist.length > (max || 400) ? hist.slice(hist.length - (max || 400)) : hist);
