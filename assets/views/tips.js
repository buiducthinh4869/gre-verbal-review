// Trang Chiến lược: cấu trúc đề hiện hành, cách chấm, mẹo chính thức cho TC, SE, Reading, các dạng câu hỏi, bẫy thường gặp.
// Nội dung tóm tắt (diễn đạt lại) từ The Official Guide to the GRE General Test (ETS) và trang ets.org/gre/shorter.
// Trang tĩnh, không gọi API.
import { esc, views } from '../state.js';
import { tocLayout, bindToc, calloutList } from './ui.js';

const STRUCTURE = [
  ['Section 1', '12 câu', '18 phút', 'Độ khó trung bình. Kết quả section này quyết định độ khó của Section 2.'],
  ['Section 2', '15 câu', '23 phút', 'Dễ hơn hoặc khó hơn tùy kết quả Section 1 (thích ứng theo section).']
];

const RULES = [
  'Khoảng một nửa số câu là Reading Comprehension; nửa còn lại là Text Completion và Sentence Equivalence.',
  'Trong một section được đi lại tự do: bỏ qua câu, đánh dấu (Mark), mở màn Review và sửa đáp án cho tới khi hết giờ.',
  'Không trừ điểm câu sai. Điểm thô chỉ tính số câu đúng, mọi câu có trọng số như nhau.',
  'Không có điểm từng phần: TC phải đúng mọi chỗ trống, SE phải đúng cả 2 ô, Reading chọn-nhiều phải chọn đúng toàn bộ.',
  'Thang điểm Verbal 130–170, bước 1 điểm.'
];

const TYPES = [
  {
    id: 'tc', title: 'Text Completion (TC)',
    format: [
      'Đoạn 1–5 câu, có 1, 2 hoặc 3 chỗ trống.',
      '1 chỗ trống: chọn 1 trong 5 phương án. 2–3 chỗ trống: mỗi chỗ 3 phương án, các chỗ chọn độc lập.',
      'Phải đúng mọi chỗ trống mới được điểm.'
    ],
    steps: [
      'Đọc cả đoạn để nắm ý chung trước khi nhìn phương án.',
      'Gạch chân từ tín hiệu: although, yet, despite, far from (đổi chiều); moreover, indeed, dấu hai chấm (cùng chiều); thus, because (nhân quả).',
      'Tự nghĩ một từ của mình cho chỗ trống, rồi tìm phương án gần nhất.',
      'Không bắt buộc điền chỗ trống 1 trước. Làm chỗ trống dễ nhất trước rồi suy ngược.',
      'Đọc lại cả đoạn đã điền: phải hợp logic, ngữ pháp và văn phong.'
    ]
  },
  {
    id: 'se', title: 'Sentence Equivalence (SE)',
    format: [
      'Một câu, một chỗ trống, 6 phương án.',
      'Chọn đúng 2 phương án, mỗi phương án cho ra câu hợp lý và hai câu có nghĩa giống nhau.',
      'Phải đúng cả 2 mới được điểm.'
    ],
    steps: [
      'Đừng chỉ đi tìm cặp từ đồng nghĩa. Cặp đồng nghĩa không hợp câu là bẫy phổ biến, và đáp án đúng có khi không phải đồng nghĩa trong từ điển.',
      'Đọc cả câu, tìm từ tín hiệu và ý câu cần.',
      'Tự nghĩ từ cho chỗ trống, tìm các phương án khớp.',
      'Nếu chỉ thấy 1 phương án khớp, xem lại các phương án còn lại theo một cách hiểu khác của câu.',
      'Kiểm tra lại cả 2 câu đã điền: cùng hợp lý, cùng nghĩa.'
    ]
  },
  {
    id: 'rc', title: 'Reading Comprehension',
    format: [
      'Khoảng 10 đoạn văn cho cả bài thi; phần lớn chỉ 1 đoạn văn, chỉ 1–2 đoạn dài nhiều đoạn. Mỗi đoạn có 1–6 câu hỏi.',
      'Ba dạng: chọn 1 trong 5 (ô tròn); chọn mọi đáp án đúng trong 3 (ô vuông, có thể đúng 1, 2 hoặc cả 3); chọn một câu trong đoạn văn (Select-in-Passage).',
      'Với đoạn dài, câu Select-in-Passage thường chỉ giới hạn trong 1–2 đoạn được đánh dấu bằng mũi tên.'
    ],
    steps: [
      'Chỉ trả lời dựa trên đoạn văn. Không dùng kiến thức bên ngoài hay ý kiến riêng.',
      'Tách ý chính khỏi chi tiết minh họa; tách ý của tác giả khỏi ý tác giả chỉ thuật lại.',
      'Theo dõi quan hệ giữa các ý: đối lập, hỗ trợ, chi tiết hóa, nhân quả.',
      'Chọn 1 đáp án: đọc hết 5 phương án trước khi chọn; loại phương án đúng một phần hoặc đúng nhưng không trả lời câu hỏi.',
      'Chọn nhiều đáp án: xét từng phương án độc lập, không suy từ các phương án khác.',
      'Chọn câu trong đoạn: xét từng câu trong phạm vi được chỉ định, chọn câu khớp trọn mô tả.'
    ]
  }
];

const TASKS = [
  ['Ý chính / mục đích', 'The primary purpose of the passage is to…', 'Đoạn văn làm gì: bác bỏ, điều chỉnh, giải thích, so sánh. Loại phương án quá rộng hoặc quá hẹp.'],
  ['Chi tiết', 'According to the passage, which of the following is true of X?', 'Đáp án nằm thẳng trong bài, thường diễn đạt lại.'],
  ['Suy luận', 'It can be inferred from the passage that…', 'Dạng gặp nhiều nhất. Đáp án phải chắc chắn đúng theo bài, không chỉ có thể đúng.'],
  ['Chức năng', 'The author mentions X primarily in order to…', 'Hỏi vì sao chi tiết có mặt, không hỏi nó nói gì.'],
  ['Thái độ tác giả', "The author's attitude toward X is best described as…", 'Thường là thái độ có chừng mực (qualified approval, measured skepticism).'],
  ['Nghĩa từ trong ngữ cảnh', 'In the context in which it appears, X most nearly means…', 'Thường hỏi nghĩa phụ của từ quen. Thay từng phương án vào câu.'],
  ['Chọn câu trong đoạn', 'Select the sentence in the passage that…', 'Đối chiếu mô tả với từng câu; câu chỉ khớp một phần là bẫy.'],
  ['Làm yếu (argument)', 'Which of the following, if true, most seriously weakens the argument?', 'Tìm nguyên nhân khác hoặc phá giả định ngầm.'],
  ['Củng cố (argument)', 'Which of the following, if true, most strengthens…?', 'Loại bỏ nguyên nhân khác hoặc xác nhận giả định.'],
  ['Giả định (argument)', 'The argument depends on which of the following assumptions?', 'Phép thử phủ định: phủ định phương án, nếu lập luận sụp thì đó là giả định.'],
  ['Giải thích nghịch lý', 'Which of the following, if true, best explains the apparent discrepancy?', 'Đáp án làm cả hai sự kiện cùng đúng; không phủ nhận sự kiện nào.'],
  ['Vai trò phần in đậm', 'In the argument, the two portions in boldface play which of the following roles?', 'Xác định kết luận chính trước, rồi xem từng phần hỗ trợ hay chống lại nó.']
];

const FLAWS = [
  ['Nhân quả vội', 'Xảy ra trước hoặc đi cùng không có nghĩa là gây ra. Tìm yếu tố thứ ba hoặc chiều nhân quả ngược.'],
  ['Giải thích khác', 'Cùng một dữ kiện có thể do nguyên nhân khác. Phương án đưa ra nguyên nhân khác thường làm yếu lập luận.'],
  ['Giả định ngầm', 'Kết luận cần một tiền đề không nói ra. Phá tiền đề đó là làm yếu; xác nhận nó là củng cố.'],
  ['Mẫu khảo sát', 'Mẫu nhỏ, không đại diện, câu hỏi dẫn dắt, người trả lời tự chọn tham gia.'],
  ['Số lượng và tỷ lệ', 'Số tuyệt đối tăng không có nghĩa tỷ lệ tăng. Số khiếu nại tăng có thể do khiếu nại dễ hơn.'],
  ['Khái quát quá mức', 'Kết quả hẹp bị mở rộng thành kết luận chung; phương án nói quá ý tác giả.']
];

const TRAPS = [
  'Phương án đúng một phần: nửa đầu khớp bài, nửa sau sai hoặc nói quá.',
  'Phương án đúng nhưng lạc câu hỏi: nhắc đúng chi tiết trong bài nhưng không trả lời điều được hỏi.',
  'Kiến thức bên ngoài: phương án hợp lý ngoài đời nhưng bài không nói.',
  'Ý người khác thành ý tác giả: tác giả chỉ thuật lại quan điểm mà phương án gán cho tác giả.',
  'Cặp đồng nghĩa lạc ngữ cảnh (SE): hai từ cùng nghĩa nhưng không hợp câu.',
  'Bám chỗ trống 1 (TC): ép đáp án cho chỗ trống đầu khi chỗ trống sau mới có manh mối.',
  'Chọn câu ngoài phạm vi (Select-in-Passage): câu nằm ngoài đoạn được chỉ định, hoặc chỉ khớp một phần mô tả.'
];

const PACING = [
  'Trung bình khoảng 1 phút 30 giây mỗi câu (18 phút / 12 câu; 23 phút / 15 câu).',
  'Hai lượt: lượt đầu làm nhanh câu chắc chắn và đánh dấu câu khó; lượt hai quay lại câu đã đánh dấu.',
  'Đoạn văn lạ hoặc khó: để cuối, làm TC/SE và đoạn dễ trước. Mọi câu cùng giá trị.',
  'Không bỏ trống câu nào. Không trừ điểm câu sai, nên đoán trước khi hết giờ.',
  'Không mở màn Review quá nhiều lần; đó cũng là thời gian.'
];

const VOCAB = [
  'TC và SE đo cách dùng từ trong câu, không đo định nghĩa rời. Học từ kèm câu ví dụ và cụm kết hợp.',
  'Nắm từ tín hiệu đổi chiều, cùng chiều, nhân quả; chúng quyết định hướng nghĩa của chỗ trống.',
  'Phân biệt sắc thái và mức độ trong nhóm từ gần nghĩa: đây là chỗ đề đặt phương án nhiễu.',
  'Giáo trình chính thức không cho danh sách từ; trên web này, mục Từ vựng và sổ Hay quên đóng vai trò đó.'
];

const TOC = [['t-format', 'Cấu trúc và cách chấm'], ['t-tc', 'Text Completion'], ['t-se', 'Sentence Equivalence'], ['t-rc', 'Reading'], ['t-tasks', 'Dạng câu hỏi Reading'],
  ['t-arg', 'Lỗi lập luận'], ['t-traps', 'Bẫy trong phương án'], ['t-pace', 'Thời gian và đoán'], ['t-vocab', 'Học từ vựng']];

const ul = (arr) => '<ul class="tips-list">' + arr.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>';
const ol = (arr) => '<ol class="tips-list">' + arr.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ol>';

views.tips = {
  title: 'Chiến lược',
  render() {
    let h = '<div class="page-head"><h1>Chiến lược làm bài Verbal</h1><p>Tóm tắt từ The Official Guide to the GRE General Test và quy định đề rút gọn của ETS (áp dụng từ 22/9/2023).</p></div>';
    let m = '';
    m += '<section class="card tips-card" id="t-format"><h2 class="section">Cấu trúc và cách chấm</h2>';
    m += '<div class="table-wrap"><table class="mock-table"><thead><tr><th>Section</th><th>Số câu</th><th>Thời gian</th><th>Ghi chú</th></tr></thead><tbody>' +
      STRUCTURE.map((r) => '<tr>' + r.map((c) => '<td>' + esc(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
    m += ul(RULES) + '</section>';

    TYPES.forEach((t) => {
      m += '<section class="card tips-card" id="t-' + t.id + '"><h2 class="section">' + esc(t.title) + '</h2>';
      m += '<h3 class="tips-h">Định dạng</h3>' + ul(t.format) + calloutList('tip', 'Cách làm', t.steps, true) + '</section>';
    });

    m += '<section class="card tips-card" id="t-tasks"><h2 class="section">Các dạng câu hỏi Reading</h2>';
    m += '<div class="table-wrap"><table class="mock-table tips-table"><thead><tr><th>Dạng</th><th>Câu hỏi thường gặp</th><th>Mẹo</th></tr></thead><tbody>' +
      TASKS.map(([a, b, c]) => '<tr><td><b>' + esc(a) + '</b></td><td><i lang="en">' + esc(b) + '</i></td><td>' + esc(c) + '</td></tr>').join('') + '</tbody></table></div></section>';

    m += '<section class="card tips-card" id="t-arg"><h2 class="section">Lỗi lập luận hay gặp trong đoạn argument</h2>' +
      '<dl class="tips-dl">' + FLAWS.map(([a, b]) => '<dt>' + esc(a) + '</dt><dd>' + esc(b) + '</dd>').join('') + '</dl></section>';
    m += '<section class="card tips-card" id="t-traps"><h2 class="section">Bẫy trong phương án</h2>' + calloutList('trap', 'Phương án nhiễu hay gặp', TRAPS) + '</section>';
    m += '<section class="card tips-card" id="t-pace"><h2 class="section">Phân bổ thời gian và đoán</h2>' + calloutList('tip', 'Nguyên tắc', PACING) + '</section>';
    m += '<section class="card tips-card" id="t-vocab"><h2 class="section">Học từ vựng cho TC và SE</h2>' + calloutList('tip', 'Cách học', VOCAB) + '</section>';
    return h + tocLayout(TOC, m);
  },
  wide: () => true,
  after() { bindToc(); }
};
