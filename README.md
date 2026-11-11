# Sổ GRE Verbal

Web ôn từ vựng GRE Verbal (thi 18/12/2026). Mỗi người một tài khoản và một lộ trình ôn riêng (lặp lại ngắt quãng theo hộp Leitner). Tiến độ tự lưu và đồng bộ giữa các thiết bị.

- **Web:** https://buiducthinh4869.github.io/gre-verbal-review/
- **API:** Google Apps Script (URL trong `config.js`, deployment ID trong `.deployment-id`)
- **Dữ liệu người dùng:** Google Sheet "GRE Verbal - Tiến độ ôn tập" của tài khoản bui.thinh@depocen.org

## Kiến trúc

| Phần | Ở đâu | Vai trò |
|---|---|---|
| Giao diện | GitHub Pages, phục vụ thẳng từ nhánh `main`, **thư mục gốc** | Toàn bộ trang, từ vựng, bài tập, logic ôn |
| API | Google Apps Script (`apps-script/`), chỉ trả JSON | Đăng nhập, đọc/ghi tiến độ, quản lý tài khoản |
| Dữ liệu người dùng | Google Sheet | Tab `users`, `sessions`, `progress`, `log`, `custom_words`, `settings`, `mocks` |
| Dữ liệu từ vựng | `data/` trong repo, tải trực tiếp từ GitHub Pages | Không qua Apps Script |

Giao diện là HTML/CSS/JavaScript thuần (ES modules), không framework, không bước build.

```
index.html              khung trang (định tuyến bằng hash #today, #vocab/<cụm>/<nhóm>, #mock, ...)
config.js               API_URL của Apps Script, ngày thi
assets/
  app.js                khởi động, tải dữ liệu, định tuyến, sự kiện chung
  auth.js               đăng nhập, phiên, làm mới trạng thái
  api.js                gọi Apps Script, hàng đợi lưu tự động
  state.js              trạng thái dùng chung, ghi nhận kết quả, điều hướng
  srs.js                hộp Leitner, sổ hay quên, phiên hôm nay (thuần, test bằng node)
  vocab.js              chỉ mục dữ liệu, ánh xạ phương án GRE, chấm bài (thuần)
  distractors.js        sinh phương án nhiễu theo "direction" của nhóm (thuần)
  mock.js               Thi thử: chọn câu, thích ứng theo section, chấm (thuần)
  bank.js               ngân hàng câu: bộ lọc, bảng theo cụm/dạng, từ vựng cần biết, giữ câu cho đề cố định, thẻ ôn nhanh (thuần)
  validate.js           quy tắc hợp lệ của từ, câu, đề cố định (dùng chung: npm run check, trình duyệt, chế độ sửa)
  render.js             render ví dụ *...* / **...** an toàn
  views/                today, vocab, practice, mock, session, notebook, addword, account, admin, login, settings,
                        content (chế độ sửa), grevocab (độ khó, kỹ năng, nhóm liên quan, các từ trong câu, từ vựng cần biết)
apps-script/            rootDir của clasp: Api.js, Auth.js, Store.js, Admin.js, Migrate.js
data/                   index.json + clusters/*.json + mocks/ (đề thi thử cố định)
scripts/                check-data, deploy-api, admin-cli, e2e-api, dev-server, backup-csv
tests/                  srs, distractors, mock, bank, content, api (server chạy trong giả lập Apps Script)
```

## Các trang

- **Từ vựng** có ba cấp, định tuyến bằng hash (nút Quay lại của trình duyệt đi đúng giữa các cấp):
  - `#vocab`: lưới thẻ cụm.
  - `#vocab/<cụm>`: lưới thẻ nhóm, kèm nút **Xem tất cả từ của cụm** (`#vocab/<cụm>/all`).
  - `#vocab/<cụm>/<nhóm>/<từ>`: danh sách từ của nhóm, mở sẵn chi tiết từ.

  Ô tìm kiếm ở mọi cấp tìm trên toàn bộ các cụm, mỗi kết quả kèm nhãn `Cụm › Nhóm`. Trang nhớ cấp xem gần nhất theo từng tài khoản.
- **Luyện tập**: phạm vi gồm nhiều cụm, một nhóm, chỉ ★★★, hoặc chỉ sổ từ hay quên. Dạng GRE chuẩn lấy bài có `targets` thuộc phạm vi đã chọn.
- **Thi thử** (section Verbal, chỉ gồm TC và SE):
  - Cấu trúc như đề thật: Section 1 có 12 câu trong 18 phút, Section 2 có 15 câu trong 23 phút; chế độ Đầy đủ làm cả hai.
  - Chọn câu: khoảng 55% TC và 45% SE, TC trộn 1, 2, 3 chỗ trống. Ưu tiên câu chưa làm hoặc đã làm sai; tránh câu đã làm đúng trong 7 ngày gần nhất.
  - Ở chế độ Đầy đủ, Section 2 thích ứng gần đúng theo Section 1: đúng từ 70% trở lên thì ưu tiên TC nhiều chỗ trống và câu từng sai; dưới 70% thì ưu tiên TC một chỗ trống.
  - Khi làm bài:
    - Đồng hồ đếm ngược có nút ẩn/hiện; hết giờ thì tự nộp.
    - Có nút Trước/Tiếp, Đánh dấu và màn Xem lại.
    - Không có gợi ý và không báo đúng sai trong lúc làm.
    - Chấm như đề thật: câu nhiều chỗ trống phải đúng toàn bộ mới được tính; SE phải chọn đúng 2 ô.
  - Bài đang làm lưu trong `localStorage`, nên tải lại trang vẫn làm tiếp được, và đồng hồ chạy theo thời gian thực.
  - Kết quả cập nhật lịch ôn theo quy tắc cũ (câu bỏ trống không tính) và lưu vào tab `mocks` (action `saveMock`, `getMocks`, lọc theo `userId` của phiên). Trang Hôm nay hiện lần thi gần nhất.

- **Đợt bài tập 01** (07/11/2026): 222 câu GRE (thêm 67 câu cho 4 cụm đầu), mỗi câu có độ khó, kỹ năng, đợt thêm.
  - Luyện tập, dạng GRE chuẩn: lọc theo **dạng câu**, **độ khó**, **kỹ năng** (chọn nhiều, câu có ít nhất một kỹ năng đã chọn), **chỉ câu mới**, **có dùng nhóm…**; hiện số câu thỏa điều kiện; bảng **Ngân hàng câu hỏi** theo cụm và dạng (cụm in nghiêng có dưới 10 câu).
  - Trên câu: độ khó (ba chấm + chữ Dễ/Vừa/Khó) hiện trước khi làm; nhãn kỹ năng chỉ hiện sau khi chấm; dòng **nhóm liên quan** (chỉ ở Luyện tập, không ở chế độ thi và thi thử; nhóm thuộc cụm khác có ký hiệu ↗ và chữ "cụm khác"); sau khi chấm có khung **Các từ trong câu này** (mỗi phương án: từ, nghĩa, nhóm, đã thuộc / đang học / chưa học; từ ngoài web có link Merriam-Webster; bấm từ mở chi tiết trong khung, không rời phiên).
  - Màn **Từ vựng cần biết cho bộ bài này** trước bộ bài GRE của Luyện tập và trước khi thi thử: nhóm liên quan sắp theo số câu dùng tới, số từ đã học / tổng, nút **Ôn nhanh nhóm này**, danh sách từ ngoài web. Tắt bằng ô "Không hiện lại màn này", bật lại trong Cài đặt (khóa `skipVocabIntro`). Thi thử ngẫu nhiên đầy đủ: danh sách tính theo Section 1 (Section 2 chọn sau theo kết quả).
  - **Luyện lại ngay khi sai** (Luyện tập): sai một câu GRE thì mỗi từ đáp án bị sai (TC: chỗ trống chọn sai; SE: đáp án không được chọn) có một thẻ **Ôn lại từ vừa sai** sau 3–5 thẻ thường: Nghĩa → Từ nếu từ đang ở hộp 0–2 *trước khi* trả lời câu đó, Từ → Nghĩa nếu ở hộp 3 trở lên; mỗi từ tối đa một lần mỗi phiên; kết quả tính lặp lại ngắt quãng như mọi thẻ. Cuối phiên: **Làm câu khác có cùng từ** (tối đa 10 câu khác có các từ đó trong `targets`, chưa làm trong phiên). Từ → Nghĩa / Nghĩa → Từ sai thì từ quay lại sau 3–5 thẻ (như ôn hôm nay).
  - **Đề cố định** (Thi thử): đọc từ `data/mocks/`; mỗi đề hiện tên, mô tả, cụm, số câu, thời gian, trạng thái ("Chưa làm" / "Lần gần nhất: x/27, ngày…"), nút Làm đề / Làm lại, bảng các lần làm. Dùng đúng bộ máy thi thử; thứ tự câu theo file đề, phương án vẫn xáo trộn, không thích ứng. Lưu vào tab `mocks` với `mode = "fixed"`, `mockId` = id đề; màn kết quả so sánh với lần làm trước và có bảng **theo kỹ năng và độ khó**.
  - **Giữ câu cho đề chưa làm**: với mỗi người, câu của đề cố định chưa làm lần nào không xuất hiện ở Luyện tập, thi thử ngẫu nhiên, ôn hôm nay và danh sách "Câu GRE có từ này" (trừ khi quản lý bật Chế độ sửa). Nộp đề xong thì các câu quay lại. Luyện tập hiện "x câu đang được giữ cho đề thi thử bạn chưa làm".
  - Chế độ sửa: sửa được **Độ khó** (ô chọn) và **Kỹ năng** (danh sách tích chọn) của câu.
- **Sửa nội dung** (cập nhật tổng hợp):
  - Quản lý bật **Chế độ sửa** (nút ở thanh trên cùng) rồi bấm biểu tượng bút cạnh từng trường trong chi tiết từ (nghĩa, sắc thái, ví dụ, collocation, từ dễ nhầm, mức ưu tiên, mức trên thang…). `Ctrl/Cmd + S` lưu, `Esc` hủy, có ô ghi chú và xem trước.
  - Mỗi câu GRE (trong chi tiết từ, màn kết quả luyện tập và thi thử) có **Sửa câu này** (biểu mẫu kèm xem trước) và **Ẩn câu này** (câu ẩn không còn trong luyện tập, thi thử).
  - Mục đã sửa có nhãn **đã đính chính**; quản lý bấm nhãn để xem **lịch sử** và **khôi phục** (khôi phục là một thay đổi mới, lịch sử không bị xóa).
  - Người dùng gửi **Đề xuất sửa** (từ) hoặc **Báo lỗi câu này** (câu); sửa nghĩa / sắc thái bắt buộc kèm nguồn; tối đa 20 đề xuất mỗi người mỗi ngày. Trạng thái xem ở **Đề xuất của tôi** (menu tài khoản).
  - Quản lý duyệt ở trang **Quản lý** (huy hiệu số đề xuất trên menu): so sánh cũ / mới theo từng từ, Chấp nhận, Sửa rồi chấp nhận, Từ chối (kèm lý do), Để sau.
  - Bản sửa lưu trong Sheet (tab `content_overrides`), web ghép đè lên file JSON khi tải trang (`assets/overrides.js`); không cần triển khai lại. Quy tắc hợp lệ dùng chung ở `assets/validate.js` (cũng dùng cho `npm run check`), server kiểm tra lại (`apps-script/Content.js`).

## Tài khoản

- 10 tài khoản cố định `u01` … `u10` (tên đăng nhập ban đầu `user01` … `user10`). Tiến độ gắn với `userId`, không đổi khi đổi tên đăng nhập.
- `user01` là quản lý. `user02` … `user10` bị khóa cho đến khi mở ở trang **Quản lý**.
- Mật khẩu: SHA-256 lặp 1000 lần trên (salt + mật khẩu), salt 16 byte. Phiên: token ngẫu nhiên, Sheet chỉ lưu bản băm, hạn 180 ngày kể từ lần dùng gần nhất.
- Lần đăng nhập đầu (hoặc sau khi được đặt lại mật khẩu) phải đặt mật khẩu mới.
- Sai mật khẩu 5 lần trong 15 phút: tạm khóa đăng nhập tên đó 15 phút.
- Server xác định người dùng **chỉ** từ token; `userId` trong payload bị bỏ qua.

## Lệnh

```bash
npm run check        # kiểm tra schema dữ liệu từ vựng
npm test             # test logic client + test server trong giả lập Apps Script
npm run dev          # chạy thử trên máy: http://localhost:8787 (API giả lập, KHÔNG đụng Sheet thật)
                     #   tài khoản thử cục bộ: user01 / thu-user01, user02 / thu-user02, ...
npm run deploy-api -- "ghi chú"   # clasp push + clasp deploy -i <.deployment-id> (URL API không đổi)
node scripts/admin-cli.js status  # xem các tab và số dòng của Sheet thật (chỉ đọc)
node scripts/admin-cli.js counts  # số dòng từng tab, một dòng JSON (đối chiếu trước / sau khi triển khai)
node scripts/backup-csv.js        # xuất các tab tiến độ ra backups/YYYY-MM-DD/*.csv (chỉ đọc, gitignore)
node scripts/admin-cli.js ensure-content  # tạo 3 tab content_overrides, content_history, suggestions (ở cuối, chạy lại vô hại)
node scripts/apply-overrides.js overrides-YYYY-MM-DD.json [--dry-run]  # đưa bản sửa đã xuất vào data/clusters (xem UPDATE.md)
node scripts/e2e-api.js           # kiểm thử đầu cuối trên API thật bằng user09/user10 (tự dừng nếu 2 tài khoản này đang dùng), tự dọn
```

Trên Windows dùng `npm.cmd` / `clasp.cmd`. `scripts/admin-cli.js` cần file `.admin-key` (chỉ có trên máy quản trị, đã gitignore); bản băm của khóa nằm trong `apps-script/AdminKey.js` (cũng gitignore, chỉ clasp đẩy lên Apps Script). Không có hai file này thì các lệnh `cli.*` trên API bị tắt; web vẫn chạy bình thường. Tạo khóa mới: `node scripts/admin-cli.js init-key` rồi `npm run deploy-api`.

## Lưu tự động

Mỗi câu trả lời cập nhật giao diện ngay, rồi vào hàng đợi (ghi tạm `localStorage` theo `userId`). Hàng đợi gửi `saveEvents` sau 2 giây không thao tác, hoặc đủ 10 sự kiện, hoặc khi trang bị ẩn (`pagehide` dùng `sendBeacon`). Lỗi mạng thì thử lại sau 5, 15, 60 giây. Server gộp theo `updatedAt` (bản mới hơn thắng) và bỏ qua sự kiện gửi trùng trong 6 giờ. Quay lại tab sau hơn 10 phút thì tự lấy dữ liệu mới. Phiên hết hạn: giữ hàng đợi, đăng nhập lại thì gửi tiếp.

## An toàn dữ liệu trong Sheet

- Server đọc/ghi theo **tên cột**, chỉ sửa đúng các dòng của người dùng đó và thêm dòng mới ở cuối. Không `clear()`, không ghi lại cả bảng, không sắp xếp lại.
- Từ tự thêm khi xóa chỉ được đánh dấu `deletedAt`, dòng vẫn còn.
- Đề cố định (đợt bài tập 01) cũng lưu vào tab `mocks`, không thêm cột: `mode = "fixed"`, `mockId` = id đề (vd `mock-01`). Vì làm lại cùng `mockId`, server phân biệt từng lần làm bằng (`mockId`, `startedAt`) khi chống ghi trùng và khi gộp section trong `getMocks`; `getMocks` luôn trả mọi lần làm đề cố định (giới hạn `limit` chỉ áp cho đề ngẫu nhiên).
- Tab `mocks` (cập nhật 02) được tạo riêng bằng `node scripts/admin-cli.js ensure-mocks` (chạy lại vô hại), mỗi section của một bài thi thử là một dòng: `userId, mockId, startedAt, finishedAt, mode, section, score, total, durationSec, items` (`items` là JSON gọn `[{i: id câu, c: đáp án, ok, t: giây}]`). Gửi lại cùng `mockId` + `section` thì bỏ qua.
- Ba tab sửa nội dung, tạo bằng `ensure-content`:
  - `content_overrides`: targetType, targetId, field, value (JSON), version, active, editedBy, editedAt, note. Mỗi (mục, trường) một dòng.
  - `content_history`: changeId, targetType, targetId, field, before, after, source (`admin-edit` / `suggestion:<id>` / `revert:<changeId>`), changedBy, changedAt. **Chỉ thêm dòng**, không bao giờ sửa hay xóa.
  - `suggestions`: suggestionId, userId, targetType, targetId, field, currentValue, proposedValue, reason, sourceUrl, status, reviewerNote, createdAt, reviewedAt, changeId.
- Lệnh dọn dữ liệu thử `cli.purgeTestUser` từ chối nếu tài khoản có tiến độ từ trước lúc bắt đầu kiểm thử (tránh xóa nhầm dữ liệu người thật).
- Kết quả gần nhất của từng bài GRE nằm trong dòng settings `_exRes` của mỗi người (dùng để chọn câu thi thử).
- Danh sách hôm nay (đợt 02): dòng settings `todayNew:<YYYY-MM-DD>` (từ mới cố định của ngày) và `todayDue:<YYYY-MM-DD>` (từ đến hạn đầu ngày), giá trị là mảng id từ (tối đa 80). Mỗi ngày thêm tối đa 2 dòng cho mỗi người; dòng cũ giữ nguyên, web bỏ qua khóa cũ hơn 7 ngày. Xem UPDATE.md.
- `apps-script/Migrate.js` chuyển dữ liệu bản cũ (một người dùng) sang `u01`: chèn cột `userId` vào đầu các tab cũ, điền `u01`, tạo tab `users`, `sessions`. Chạy lại vô hại.

## Lịch sử

- Bản 1 (giao diện chạy trong Apps Script, một người dùng): code ở nhánh `v1-apps-script`. Deployment giao diện cũ `AKfycbxPyL9…` đã được gỡ ngày 04/11/2026 khi chuyển sang bản 2 (phiên bản 2 của project vẫn còn trong Apps Script).
- Chuyển dữ liệu 04/11/2026: 12 dòng progress, 16 dòng log, 3 dòng settings của bản cũ → `u01`, khớp 100% với bản sao lưu "GRE Verbal - Tiến độ ôn tập (sao lưu 2026-11-04)".
- Cập nhật 02 (05/11/2026): 7 cụm, 259 từ, 83 bài GRE; trường `direction` của nhóm; trang Từ vựng dạng thẻ; phạm vi Luyện tập mới; chế độ Thi thử và tab `mocks`. Trước khi triển khai đã sao lưu "GRE Verbal - Tiến độ ôn tập (sao lưu 2026-11-05)"; số dòng các tab cũ trước và sau bằng nhau.
- Đợt bài tập 01 (07/11/2026): dữ liệu 222 câu (67 câu mới), trường `difficulty`, `skills`, `addedIn`, đề cố định `mock-01`; Apps Script sửa tối thiểu (mode `fixed` trong `saveMock`/`getMocks`, khóa cài đặt `skipVocabIntro`, cho sửa `difficulty`/`skills`). Trước khi triển khai đã xuất CSV mọi tab (`backups/2026-11-07*`); số dòng các tab và tiến độ `user01` trước và sau bằng nhau.
- Thêm cụm từ mới, đợt bài tập mới: xem [UPDATE.md](UPDATE.md).
