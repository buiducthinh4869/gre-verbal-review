// Tab kiến thức Reading (#rclearn) và Quant (#qlearn): định dạng, cách làm, các dạng câu và bài mẫu có lời giải.
// Chỉ đọc và xem mẫu; luyện tập nằm ở tab Luyện tập (#reading, #quant). Nội dung tóm tắt từ The Official Guide qua NotebookLM.
import { App, esc, views, heldIds } from '../state.js';
import { LS } from '../api.js';
import { tocLayout, bindToc, callout, calloutList } from './ui.js';
import { TASKS, TASK_ORDER, READ_GUIDE, LENGTHS, taskOf } from '../rcpractice.js';
import { rcAnswers } from '../reading.js';
import { TEMPLATE_IDS, templateMeta, makeItem, TRAPS, TOPICS, QC_CHOICES, FMT_LABEL, answerText } from '../quant.js';

const LETTERS = 'ABCDE';
const sentHtml = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b class="rc-bold">$1</b>');
const sentPlain = (s) => String(s || '').replace(/\*\*/g, '');

/* ================= Reading ================= */
const RC_STEM = {
  purpose: 'The primary purpose of the passage is to…', detail: 'According to the passage, which of the following is true of X?',
  inference: 'It can be inferred from the passage that…', function: 'The author mentions X primarily in order to…',
  attitude: "The author's attitude toward X is best described as…", vocab: 'In the context in which it appears, "X" most nearly means…',
  select: 'Select the sentence in the passage that…', weaken: 'Which of the following, if true, most seriously weakens the argument?',
  strengthen: 'Which of the following, if true, most strengthens the argument?', assumption: 'The argument depends on which of the following assumptions?',
  paradox: 'Which of the following, if true, most helps to resolve the apparent discrepancy?', boldface: 'The two portions in boldface play which of the following roles?',
  evaluate: 'Which of the following would be most useful to know in evaluating the argument?'
};
const ARG_TASKS = ['weaken', 'strengthen', 'assumption', 'paradox', 'boldface', 'evaluate'];
const FLAWS = [
  ['Nhân quả vội', 'Xảy ra trước hoặc đi cùng không có nghĩa là gây ra. Tìm yếu tố thứ ba hoặc chiều nhân quả ngược.'],
  ['Giải thích khác', 'Cùng một dữ kiện có thể do nguyên nhân khác. Phương án đưa ra nguyên nhân khác thường làm yếu lập luận.'],
  ['Giả định ngầm', 'Kết luận cần một tiền đề không nói ra. Phá tiền đề đó là làm yếu; xác nhận nó là củng cố.'],
  ['Mẫu khảo sát', 'Mẫu nhỏ, không đại diện, câu hỏi dẫn dắt, người trả lời tự chọn tham gia.'],
  ['Số lượng và tỷ lệ', 'Số tuyệt đối tăng không có nghĩa tỷ lệ tăng. Số khiếu nại tăng có thể do khiếu nại dễ hơn.'],
  ['Khái quát quá mức', 'Kết quả hẹp bị mở rộng thành kết luận chung; phương án nói quá ý tác giả.']
];

/** Câu mẫu cho một dạng: lấy từ đoạn không bị giữ cho đề thi thử, ưu tiên đoạn đã làm (đỡ lộ đoạn chưa làm). */
function rcSample(task) {
  if (!App.reading || !App.user) return null;
  const held = heldIds();
  const done = new Set((LS.get('gre.rcHist.' + App.user.userId, []) || []).map((a) => a.pid));
  const ps = App.reading.passages.filter((p) => !p.questionIds.some((id) => held.has(id)))
    .sort((a, b) => (done.has(b.id) ? 1 : 0) - (done.has(a.id) ? 1 : 0));
  for (const p of ps) {
    const id = p.questionIds.find((qid) => taskOf(App.reading.byId[qid]) === task);
    if (id) return { p, q: App.reading.byId[id], seen: done.has(p.id) };
  }
  return null;
}
function rcSampleHtml(task) {
  const s = rcSample(task);
  if (!s) return '<p class="muted small">Chưa có câu mẫu dùng được cho dạng này (các câu đang được giữ cho đề thi thử).</p>';
  const { p, q } = s;
  const ans = rcAnswers(q);
  let k = 0;
  const passage = p.paragraphs.map((para) => '<p>' + para.map((x) => { const i = k++; return '<span class="rc-sent' + (q.kind === 'sentence' ? ' smp-' + i : '') + '" data-i="' + i + '">' + sentHtml(x) + '</span>'; }).join(' ') + '</p>').join('');
  let h = '<div class="sample"><div class="sample-head">📝 Câu mẫu' + (s.seen ? '' : ' <span class="muted small">(đoạn bạn chưa làm ở Luyện tập)</span>') + '</div>' +
    '<details class="sample-passage"' + (p.length === 'argument' ? ' open' : '') + '><summary>Đoạn văn: ' + esc(p.title) + ' · ' + esc(LENGTHS[p.length] || '') + '</summary><div class="rc-text">' + passage + '</div></details>' +
    '<p class="rc-stem">' + esc(q.stem) + '</p>';
  if (q.kind !== 'sentence') h += '<ol class="sample-opts" type="' + (q.kind === 'mc' ? 'A' : '1') + '">' + q.options.map((o) => '<li>' + esc(o) + '</li>').join('') + '</ol>';
  const shown = q.kind === 'sentence' ? sentPlain(p.sentences[q.answer]) : ans.map((a) => (q.kind === 'mc' ? LETTERS[q.options.indexOf(a)] : q.options.indexOf(a) + 1) + '. ' + a).join('; ');
  return h + '<details class="sample-ans"><summary>Xem đáp án và giải thích</summary><div class="small"><b>Đáp án:</b> ' + esc(shown) + '</div><div class="explain small">' + esc(q.explanation || '') + '</div></details></div>';
}
function taskCard(t) {
  const T = TASKS[t];
  return '<article class="card learn-card" id="rt-' + t + '"><h3 class="learn-h">' + esc(T.label) + '</h3>' +
    '<p class="small muted">Câu hỏi thường gặp: <i lang="en">' + esc(RC_STEM[t]) + '</i></p>' +
    calloutList('tip', 'Ba bước', T.steps, true) + calloutList('trap', 'Bẫy hay gặp', T.traps) + rcSampleHtml(t) +
    '<div class="learn-actions"><button class="btn" data-act="rcp-drill-go" data-id="' + t + '">Luyện dạng này ›</button></div></article>';
}

views.rclearn = {
  title: 'Reading',
  wide: () => true,
  render() {
    let m = '<section class="card tips-card toc-sec" id="r-format"><h2 class="section">Định dạng Reading Comprehension</h2><ul class="tips-list">' +
      ['Khoảng một nửa số câu của mỗi section Verbal.', 'Phần lớn đoạn văn chỉ một đoạn (khoảng 100–200 từ); chỉ 1–2 đoạn dài nhiều đoạn (khoảng 300–450 từ); đoạn lập luận ngắn khoảng 50–100 từ, một câu hỏi.',
        'Ba dạng câu: chọn 1 trong 5 (ô tròn); chọn mọi đáp án đúng trong 3 (ô vuông, đúng 1, 2 hoặc cả 3, không có điểm từng phần); chọn một câu trong đoạn văn.',
        'Đoạn dài: câu chọn câu thường chỉ giới hạn trong 1–2 đoạn được đánh dấu.'].map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></section>';
    m += '<section class="card tips-card toc-sec" id="r-read"><h2 class="section">Cách đọc đoạn văn</h2>' + calloutList('tip', 'Khi đọc lần đầu', READ_GUIDE.all) +
      '<ul class="tips-list">' + Object.keys(LENGTHS).map((k) => '<li>' + esc(READ_GUIDE[k]) + '</li>').join('') + '</ul>' +
      calloutList('tip', 'Trả lời', ['Chỉ dựa vào đoạn văn, không dùng kiến thức ngoài.', 'Chọn 1 đáp án: đọc hết 5 phương án rồi mới chọn.', 'Chọn nhiều đáp án: xét từng phương án độc lập.']) + '</section>';
    m += '<section class="toc-sec" id="r-passage"><h2 class="t-h2">Câu hỏi về đoạn văn</h2>' + TASK_ORDER.filter((t) => !ARG_TASKS.includes(t)).map(taskCard).join('') + '</section>';
    m += '<section class="toc-sec" id="r-arg"><h2 class="t-h2">Câu hỏi về lập luận</h2>' + ARG_TASKS.map(taskCard).join('') +
      '<article class="card learn-card"><h3 class="learn-h">Lỗi lập luận hay gặp</h3><dl class="tips-dl">' + FLAWS.map(([a, b]) => '<dt>' + esc(a) + '</dt><dd>' + esc(b) + '</dd>').join('') + '</dl></article></section>';
    m += '<section class="card tips-card toc-sec" id="r-time"><h2 class="section">Thời gian</h2>' +
      calloutList('tip', 'Nhịp làm bài', ['Khoảng 1 phút 30 giây mỗi câu; đoạn dài dành thêm khoảng 1 phút để đọc.', 'Đoạn lạ hoặc khó: đánh dấu, làm câu khác trước, quay lại sau.', 'Không bỏ trống: sai không bị trừ điểm.']) + '</section>';
    return '<div class="page-head"><h1>Reading</h1><p>Kiến thức và câu mẫu cho từng dạng câu Reading. Luyện tập ở <a href="#reading" data-nav="reading">Luyện tập › Reading</a>.</p></div>' +
      tocLayout([['r-format', 'Định dạng'], ['r-read', 'Cách đọc'], ['r-passage', 'Câu hỏi về đoạn văn'], ['r-arg', 'Câu hỏi về lập luận'], ['r-time', 'Thời gian']], m, 'Reading');
  },
  after() { bindToc(); }
};

/* ================= Quant ================= */
function quantSampleHtml(it) {
  let h = '<div class="sample"><div class="sample-head">📝 Bài mẫu · ' + esc(FMT_LABEL[it.fmt]) + '</div>';
  if (it.fmt === 'qc') {
    h += '<div class="qz-given">' + esc(it.stem) + '</div><div class="qz-qty"><div><span class="muted small">Quantity A</span><b>' + esc(it.qa) + '</b></div><div><span class="muted small">Quantity B</span><b>' + esc(it.qb) + '</b></div></div>' +
      '<ol class="sample-opts" type="A">' + ['A', 'B', 'C', 'D'].map((o) => '<li>' + esc(QC_CHOICES[o]) + '</li>').join('') + '</ol>';
  } else {
    h += '<p class="rc-stem">' + esc(it.stem) + '</p>';
    if (it.options && it.fmt !== 'num') h += '<ol class="sample-opts" type="' + (it.fmt === 'mc' ? 'A' : '1') + '">' + it.options.map((o) => '<li>' + esc(o) + '</li>').join('') + '</ol>';
  }
  return h + '<details class="sample-ans"><summary>Xem lời giải</summary><div class="small"><b>Đáp án:</b> ' + esc(answerText(it)) + '</div><div class="explain small">' + esc(it.explain) + '</div></details></div>';
}

views.qlearn = {
  title: 'Quant',
  wide: () => true,
  render() {
    const meta = templateMeta();
    let m = '<section class="card tips-card toc-sec" id="q-format"><h2 class="section">Định dạng Quantitative Reasoning</h2>' +
      '<div class="table-wrap"><table class="mock-table"><thead><tr><th>Section</th><th>Số câu</th><th>Thời gian</th></tr></thead><tbody>' +
      '<tr><td>Section 1</td><td>12</td><td>21 phút</td></tr><tr><td>Section 2</td><td>15</td><td>26 phút</td></tr></tbody></table></div>' +
      '<ul class="tips-list">' + ['Section 2 dễ hay khó tùy kết quả Section 1 (thích ứng theo section).',
        'Quantitative Comparison: so sánh Quantity A và Quantity B với 4 phương án cố định.',
        'Chọn 1 đáp án trong 5; chọn mọi đáp án đúng (ô vuông, không điểm từng phần).',
        'Điền số: một ô cho số nguyên hoặc thập phân, hai ô cho phân số. Phân số không cần rút gọn; chỉ làm tròn khi đề yêu cầu, ở bước cuối.',
        'Có máy tính trên màn hình: dùng cho phép tính dài hoặc căn; tính nhẩm và phân số chính xác thì không cần.'].map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></section>';
    m += '<section class="card tips-card toc-sec" id="q-qc"><h2 class="section">Quantitative Comparison</h2>' +
      '<ol class="sample-opts" type="A">' + ['A', 'B', 'C', 'D'].map((o) => '<li>' + esc(QC_CHOICES[o]) + '</li>').join('') + '</ol>' +
      calloutList('tip', 'Chiến lược', ['Thử nhiều loại số: số âm, 0, phân số giữa 0 và 1, số rất lớn, hai biến bằng nhau. Hai lần thử cho hai kết quả khác nhau thì chọn D.',
        'Rút gọn hai vế bằng phép biến đổi giữ chiều: cộng trừ cùng một lượng, nhân chia cùng một số dương.',
        'Không chọn D nếu cả hai đại lượng tính ra được con số cụ thể.', 'Hình vẽ không theo tỉ lệ: không suy độ dài hay góc từ hình.']) +
      callout('trap', 'Bẫy kinh điển', '<div class="small">Chỉ thử một số dễ (như x = 2) rồi kết luận. Với miền như 0 &lt; x &lt; 1 hay x ≠ 0, thử cả hai cận và số âm nếu được phép.</div>') + '</section>';
    Object.keys(TOPICS).forEach((tp) => {
      const tpls = TEMPLATE_IDS.filter((id) => meta.topic[id] === tp);
      const seenTrap = new Set();
      let cards = '';
      tpls.forEach((id) => {
        const trap = meta.trap[id];
        if (seenTrap.has(trap)) return;
        seenTrap.add(trap);
        const it = makeItem(id, 424242 + id.length * 97);
        cards += '<article class="card learn-card"><h3 class="learn-h">⚠️ ' + esc(TRAPS[trap].label) + '</h3>' + callout('tip', 'Cách tránh', '<div class="small">' + esc(TRAPS[trap].tip) + '</div>') + quantSampleHtml(it) + '</article>';
      });
      if (cards) m += '<section class="toc-sec" id="q-' + tp + '"><h2 class="t-h2">' + esc(TOPICS[tp]) + '</h2>' + cards + '</section>';
    });
    m += '<section class="card tips-card toc-sec" id="q-read"><h2 class="section">Đọc đề, đơn vị, ước lượng</h2>' +
      calloutList('tip', 'Nguyên tắc', ['Trả lời đúng điều được hỏi: số lượng hay giá trị, tổng hay đơn giá, phần trăm hay điểm phần trăm.',
        'Kiểm tra đơn vị và bậc độ lớn (nghìn, triệu; phút, giây). Đổi đơn vị để tính thì đổi ngược ở bước cuối.',
        'Ô có dấu % thì nhập 33 cho 33%, không nhập 0.33.', 'Phương án cách xa nhau thì ước lượng; xem phương án trước để biết cần chính xác tới đâu.',
        'Không thêm giả định ngoài đề (thuế, múi giờ…).']) + '</section>';
    const toc = [['q-format', 'Định dạng'], ['q-qc', 'So sánh (QC)']].concat(Object.keys(TOPICS).filter((tp) => TEMPLATE_IDS.some((id) => meta.topic[id] === tp)).map((tp) => ['q-' + tp, TOPICS[tp]])).concat([['q-read', 'Đọc đề và đơn vị']]);
    return '<div class="page-head"><h1>Quant</h1><p>Định dạng, chiến lược và các kiểu bẫy, mỗi kiểu một bài mẫu có lời giải. Luyện tập ở <a href="#quant" data-nav="quant">Luyện tập › Quant</a>.</p></div>' + tocLayout(toc, m, 'Quant');
  },
  after() { bindToc(); }
};

