# Thêm cụm từ mới

Khi có file JSON mới cùng schema (vd. `X.json`), yêu cầu: *"Thêm cụm từ mới trong file X vào web"*. Quy trình:

1. Chép file vào `data/clusters/` (tên file trùng `id` của cụm), thêm id cụm vào `data/index.json` theo đúng thứ tự.
2. Chạy `npm run check` và `npm test`. Có lỗi dữ liệu thì báo lại, **không tự sửa nội dung từ vựng**.
3. Commit `Thêm cụm: <title>` và push lên `main`. GitHub Pages tự cập nhật sau 1–2 phút; **không cần triển khai lại Apps Script**.
4. Mở web, kiểm tra cụm mới hiện thành một thẻ trong Từ vựng, có trong bộ chọn cụm của Luyện tập và Thi thử; báo số từ và số bài GRE đã thêm.

Tiến độ của mọi người trong Sheet không bị ảnh hưởng; từ mới bắt đầu ở hộp 0 và được giới thiệu dần theo số từ mới mỗi ngày.

## Đợt bài tập mới (nối câu GRE, đề thi thử cố định)

Từ đợt 02, câu mới được gửi dưới dạng **file đợt** `data/batches/<tên>.json` có dạng `{ "<clusterId>": [ ...câu hỏi ] }`, kèm đề mới (`data/mocks/<id>.json` + `data/mocks/index.json`) nếu có. **Không chép đè file cụm**: file cụm có thể đã có chỗ sửa tay hoặc bản sửa đã đưa vào dữ liệu gốc. Quy trình:

1. Tạo nhánh mới (`git checkout -b batch-NN`). Sao lưu Sheet (`node scripts/backup-csv.js`, chỉ đọc) và ghi lại tiến độ của `user01` (số từ đã học, đến hạn, hay quên, số lần thi thử) để đối chiếu ở bước cuối.
2. Chép file đợt vào `data/batches/` (giữ lại trong repo làm lịch sử), rồi chạy:
   ```
   node scripts/merge-batch.js data/batches/batch-NN.json --dry-run   # chỉ kiểm tra, in bảng tóm tắt
   node scripts/merge-batch.js data/batches/batch-NN.json             # nối thật
   ```
   Script **nối thêm** câu vào cuối mảng `exercises` của từng `data/clusters/<clusterId>.json`; không sửa, không sắp xếp lại, không xóa câu có sẵn. Nó **dừng và không ghi file nào** nếu: cụm không tồn tại; `id` câu mới trùng với câu đã có ở bất kỳ cụm nào (hoặc trùng nhau trong file đợt; chạy lại cùng đợt lần hai cũng bị chặn vì lý do này); câu không hợp lệ theo `assets/validate.js`; file cụm không ở định dạng chuẩn (JSON thụt 2 dấu cách) nên không thể chỉ thêm dòng. In bảng: số câu thêm cho từng cụm, tổng trước và sau.
3. `git diff --stat`: các file cụm chỉ có dòng thêm (cột xóa bằng 0), các cụm khác không đổi.
4. Chép file đề mới vào `data/mocks/`.
5. Chạy `npm run check` (in số câu theo dạng và độ khó, các đề cố định) và `npm test`. Có lỗi dữ liệu thì báo lại, **không tự sửa nội dung**. Test "mọi đáp án GRE ánh xạ được" liệt kê các đáp án là từ chưa có trên web; đáp án mới kiểu này là hợp lệ, chỉ cần thêm vào danh sách `outside` trong `tests/srs.test.js` sau khi xác nhận. Các test có số câu cố định (`tests/bank.test.js`: tổng ngân hàng câu, số câu mới, số câu đang giữ cho đề chưa làm) cần cập nhật theo đợt mới.
6. Chạy thử trên máy (`npm run dev`), rồi **hỏi chủ dự án trước khi merge vào `main` và push**. GitHub Pages tự cập nhật; không cần triển khai lại Apps Script nếu đợt không đổi mã server.
7. Mở web: bảng Ngân hàng câu hỏi (mục Luyện tập) có tổng số câu mới; đề mới hiện trong Thi thử › Đề cố định. Đối chiếu tiến độ `user01` với số đã ghi ở bước 1.

Câu của một đề cố định mới sẽ tự được giữ (không xuất hiện ở luyện tập) cho tới khi mỗi người làm đề đó lần đầu.

### Trường phân loại của câu GRE

```json
{ "id": "pc114", "type": "tc", "...": "...", "difficulty": 3, "skills": ["contrast", "lookalike"], "addedIn": "batch-01" }
```

- `difficulty` (tùy chọn): 1 = dễ, 2 = vừa, 3 = khó. Hiện trước khi làm.
- `skills` (tùy chọn): danh sách không rỗng, không trùng, gồm các mã (hiện sau khi chấm):

  | Mã | Nhãn | Ý nghĩa |
  |---|---|---|
  | `contrast` | Tín hiệu đổi chiều | although, far from, rather than, once… now |
  | `continuation` | Tín hiệu cùng chiều | dấu hai chấm, ví dụ minh họa, cùng hướng |
  | `degree` | Mức độ của từ | chọn đúng mức mạnh/nhẹ |
  | `secondary-meaning` | Nghĩa phụ | patent, check, gloss over, qualified… |
  | `lookalike` | Bẫy hình thức | laudable/laudatory, complaisant/complacent… |
  | `collocation` | Kết hợp từ | pay homage to, scoff at, expound on… |
  | `nuance` | Phân biệt sắc thái | các từ gần nghĩa khác nhau tinh tế |

  Thêm mã mới: sửa `SKILLS` trong `assets/validate.js` **và** `SKILL_CODES` trong `apps-script/Content.js` (cần triển khai lại Apps Script).
- `addedIn` (tùy chọn, chuỗi): `"base"` cho bộ câu gốc, `"batch-NN"` cho câu thêm trong đợt NN. Bộ lọc "Chỉ câu mới" lấy câu có `addedIn` khác `"base"`.

### Định dạng đề thi thử cố định

`data/mocks/index.json` liệt kê các đề theo thứ tự hiển thị; mỗi đề một file `data/mocks/<id>.json`:

```json
{ "schemaVersion": 1, "id": "mock-01", "title": "Đề thi thử 1",
  "clusters": ["praise-criticism", "clarity-obscurity"],
  "description": "Mô tả ngắn hiện trên thẻ đề.",
  "sections": [
    { "title": "Section 1", "minutes": 18, "items": ["wc101", "wc107", "..."] },
    { "title": "Section 2", "minutes": 23, "items": ["se06", "co01", "..."] } ] }
```

`npm run check` kiểm tra: mọi đề trong index có file và ngược lại; `id` đề khớp tên file (6–40 ký tự chữ, số, `-`, `_`); có `title`; `clusters` (nếu có) là id cụm có thật; 1–2 section (giới hạn của tab `mocks`), mỗi section có `title`, `minutes` > 0, danh sách câu không rỗng (tối đa 40); mọi `id` câu tồn tại; không câu nào lặp lại trong cùng một đề. Thứ tự câu khi làm bài đúng như file; thứ tự phương án xáo trộn.

## `npm run check` kiểm tra gì

- Mọi file trong `data/clusters/` đều có trong `data/index.json` và ngược lại; `id` cụm trùng tên file; `schemaVersion` = 1.
- Không trùng `id` từ, `id` nhóm, `id` bài giữa các cụm; `group` của từ phải tồn tại; `priority` là 1–3; nhóm `scale` thì mọi từ phải có `level` 1–4.
- Mỗi nhóm phải có `direction` là `"positive"`, `"negative"` hoặc `"neutral"`.
- `confusables` và `targets` trỏ tới id có thật (được phép trỏ sang từ ở cụm khác).
- TC: số chỗ `{n}` bằng số `blanks`, đánh số liên tục từ `{0}`; 1 chỗ trống cần 5 phương án, 2–3 chỗ trống cần 3 phương án mỗi chỗ; `answer` nằm trong `options`.
- SE: đúng 6 phương án, đúng 2 đáp án khác nhau, đáp án nằm trong `options`.
- Không có phương án trùng nhau.
- `difficulty`, `skills`, `addedIn` đúng định dạng (nếu có); đề cố định trong `data/mocks/` hợp lệ (xem trên).

## Schema của nhóm

```json
{ "id": "praise-verbs", "title": "Thang khen ngợi", "direction": "positive", "scale": true, "note": "Động từ khen, xếp từ nhẹ (1) đến mạnh (4)." }
```

- `direction` (bắt buộc): hướng nghĩa của cả nhóm, là `"positive"` (khen, tích cực), `"negative"` (chê, tiêu cực) hoặc `"neutral"` (trung tính). Trang Từ vựng hiện hướng này trên thẻ nhóm bằng ký hiệu kèm chữ (+ Khen, − Chê, ○ Trung tính).
- `scale`: `true` nếu nhóm là thang mức độ; khi đó mọi từ phải có `level` 1–4.
- `note`: ghi chú phân biệt; thẻ nhóm hiện rút gọn một dòng, trang nhóm hiện đầy đủ.

## Phương án nhiễu (Nghĩa → Từ)

Thứ tự ưu tiên khi chọn phương án nhiễu:

1. `confusables` của từ đúng (có thể ở cụm khác).
2. Cùng nhóm, `level` gần nhất.
3. Cùng cụm và cùng `direction`.
4. Cùng `direction` ở cụm khác.
5. Nếu vẫn thiếu thì lấy từ khác hướng.

Nhóm `neutral` được coi là hợp với mọi hướng ở các bước cùng `direction`. Phương án có `meaning` giống hệt từ đúng luôn bị loại.

## Ánh xạ phương án GRE về `id` từ

Phương án trong câu GRE được ánh xạ về `id` từ để cập nhật lịch ôn và ghi nhầm lẫn. Các dạng được xử lý:

- Đuôi chia: `lauded` → `laud`.
- Trạng từ `-ly`: `frugally` → `frugal`.
- Danh từ `-acy`, `-ity`, `-ness`: `obstinacy` → `obstinate`.
- `id` có hậu tố: `obscure` → `obscure-v`.
- Cụm có giới từ: `gloss over` → `gloss`, `shore up` → `shore-up`.
- Chữ có dấu: `clichéd` → `cliched`.

- Đuôi `-ying` → `-ie`: `belying` → `belie`; dạng số ít của từ gốc số nhiều: `plaudit` → `plaudits`.

Khi có nhiều ứng viên, luôn ưu tiên `id` nằm trong `targets` của bài.

Mọi phương án (không chỉ đáp án) được ánh xạ khi tải dữ liệu: `optionWordIds` (id từ), `relatedGroups` (nhóm của các từ đó, dùng cho nhãn nhóm, màn Từ vựng cần biết và bộ lọc "Có dùng nhóm…"), `outsideWords` (phương án chưa có trên web).

## Sửa nội dung trên web và đưa bản sửa vào dữ liệu gốc

Sửa nghĩa, sắc thái, ví dụ, bài tập: dùng **Chế độ sửa** ngay trên web (tài khoản quản lý). Mọi người thấy nội dung mới ở lần tải trang tiếp theo, không cần chạy lại code. Bản sửa nằm trong Sheet (tab `content_overrides`), file JSON không đổi.

Thỉnh thoảng (không bắt buộc) đưa các bản sửa vào file JSON cho gọn:

1. Trang **Quản lý** → **Xuất các bản sửa**: tải file `overrides-YYYY-MM-DD.json`.
2. Trên máy: `node scripts/apply-overrides.js overrides-YYYY-MM-DD.json --dry-run` để xem trước, rồi chạy lại không có `--dry-run`. Script chỉ đổi đúng trường được sửa, giữ định dạng file, tự chạy `npm run check` và trả lại file cũ nếu có lỗi. Chạy lại lần hai thì báo "đã giống dữ liệu gốc".
3. Commit, push, chờ GitHub Pages cập nhật.
4. Trang **Quản lý** → **Đánh dấu đã đưa vào dữ liệu gốc**: tắt (`active = FALSE`) các bản sửa đã trùng dữ liệu gốc. Nút này chỉ bật khi web đã tải được dữ liệu gốc mới; chỉ tắt đúng phiên bản đã xuất (bản sửa mới hơn vẫn giữ). Giao diện không thay đổi; lịch sử vẫn còn.

Không bao giờ xóa dòng trong `content_history`.

## Danh sách hôm nay (trang Hôm nay ↔ Luyện tập)

Khối "Danh sách hôm nay" nằm dưới nút Bắt đầu ôn, gồm ba thẻ (logic thuần ở `assets/todaylist.js`, test ở `tests/todaylist.test.js`):

- **Đến hạn**: ảnh chụp các từ đến hạn (`dueDate ≤ hôm nay`, hộp ≥ 1) lúc mở web lần đầu trong ngày, cộng các từ trở thành đến hạn trong ngày (vd trả lời sai ở Luyện tập). Từ đã ôn xong vẫn ở lại danh sách với dấu ✓ thay vì biến mất. Từ mới hôm nay trả lời sai không lặp lại ở thẻ này.
- **Từ mới**: đúng các từ mà phiên ôn hôm nay giới thiệu. Chọn **một lần mỗi ngày** (thứ tự cụm, mức ưu tiên như trước; số từ = số từ mới mỗi ngày trừ số từ mới đã học hôm nay trước khi chọn), lưu ở cài đặt người dùng. Phiên Bắt đầu ôn dùng chung danh sách này; đổi "số từ mới mỗi ngày" chỉ có tác dụng từ hôm sau. Nút "Học thêm 5 từ mới" lấy từ ngoài danh sách.
- **Hay quên**: các từ đang trong sổ hay quên.

Lưu trên server (tab `settings`, mỗi khóa một dòng): `todayNew:<YYYY-MM-DD>` và `todayDue:<YYYY-MM-DD>`, giá trị là mảng id từ. Server chỉ nhận khóa đúng mẫu này (ngoài 5 khóa cài đặt cũ), lọc id không hợp lệ, tối đa 80 id. Web chỉ ghi danh sách khi đã tải trạng thái từ server trong ngày (máy đang dùng bộ nhớ đệm cũ không ghi đè danh sách đã chọn ở máy khác). Khóa cũ hơn 7 ngày bị bỏ qua khi đọc; dòng trong Sheet không bị xóa.

**KPI**: một từ là "đã ôn hôm nay" khi trạng thái của nó có `lastReviewed` trong hôm nay (giờ Việt Nam, theo đồng hồ server). Mọi câu trả lời đều ghi `lastReviewed`: phiên ôn, Luyện tập, bài GRE, thi thử. Với bài GRE, chỉ các từ ở **đáp án** được ghi (các từ đích khác chỉ được tính một lượt gặp, không đổi `lastReviewed`); ngoại lệ là từ đang được ôn trong phiên hôm nay bằng một câu GRE mà nó không phải đáp án (hiếm, khi từ không có câu nào làm đáp án): từ đó được chấm nên cũng tính. Ô số liệu hiện "đã ôn / tổng" từng thẻ; thanh "Hoàn thành hôm nay: x/y" đếm cả ba thẻ, không đếm trùng.

**Liên kết sang Luyện tập**: mỗi thẻ có "Luyện tập GRE với các từ này" và "Ôn nghĩa các từ này" (Từ → Nghĩa), cuối khối có "Luyện tập toàn bộ danh sách hôm nay". Bấm vào mở Luyện tập với phạm vi **Danh sách hôm nay** (cả danh sách hoặc một thẻ; chọn lại được trong ô Phạm vi), bỏ các bộ lọc GRE cũ. Dạng GRE lấy các câu có ít nhất một từ của danh sách là đáp án (trừ câu đang giữ cho đề thi thử chưa làm), chọn để phủ được nhiều từ nhất trong giới hạn số câu; từ không có câu GRE nào được bổ sung một thẻ Nghĩa → Từ.

Trên điện thoại (≤ 640px) khối thu gọn mặc định; mở ra là thẻ đầu tiên còn từ chưa ôn. Bấm một ô số liệu mở khối ở thẻ tương ứng (ô "ngày ôn liên tục" mở thẻ đầu tiên còn từ chưa ôn).
