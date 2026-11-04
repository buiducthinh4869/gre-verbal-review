# GRE Verbal Review

Web app ôn từ vựng GRE Verbal theo chủ đề, có bài Từ → Nghĩa, Nghĩa → Từ, Text Completion, Sentence Equivalence, xếp thang mức độ và lặp lại ngắt quãng (hộp Leitner). Tiến độ tự lưu vào Google Sheet và đồng bộ giữa các thiết bị đăng nhập cùng tài khoản Google.

- **Web app:** https://script.google.com/a/macros/depocen.org/s/AKfycbxPyL9_gJE-6GoZQevHX6KD1pxyV6s1nhLeZ93YjgstixPTP-lKuPHcqMudO3ltGUlDwQ/exec
  (dùng đường dẫn `/a/macros/depocen.org/...`: nếu trình duyệt đăng nhập nhiều tài khoản Google, đường dẫn `/macros/s/...` thường báo "không thể mở tệp")
- **Sheet tiến độ:** https://docs.google.com/spreadsheets/d/14cWY51hffQebysXhtm0haKknPW7c3FJXC7LDkEedeS4/edit
- Chỉ tài khoản bui.thinh@depocen.org mở được web (`executeAs: USER_DEPLOYING`, `access: MYSELF`).

## Kiến trúc

| Thành phần | Vai trò |
|---|---|
| `data/clusters/*.json`, `data/index.json` | Dữ liệu từ vựng và bài GRE (nguồn gốc, không sửa nội dung) |
| `scripts/build.js` | Kiểm tra schema, gộp dữ liệu thành `src/Data.js`, bọc `src/Srs.js` thành `src/srs.html` |
| `src/Srs.js` | Lõi logic dùng chung cho server, client và test: Leitner, sổ hay quên, phiên ôn, phương án nhiễu, ánh xạ đáp án GRE |
| `src/Code.js` | `doGet` (nhúng dữ liệu + tiến độ vào trang), `include`, `setup`, tạo Sheet |
| `src/Api.js` | `saveEvents` (LockService, gộp theo `updatedAt`), `getState`, từ tự thêm, cài đặt |
| `src/index.html`, `styles.html`, `app.html` | Giao diện (HTML/CSS/JS thuần) |
| `tests/srs.test.js` | Test bằng `node --test` |

Client giữ một hàng đợi sự kiện (cũng ghi vào `localStorage`), tự gửi lên server sau 2 giây không thao tác, khi đủ 10 sự kiện, hoặc khi ẩn trang; gửi lỗi thì thử lại sau 5, 15, 60 giây. Server ghi mỗi sự kiện một dòng vào tab `log` và cập nhật tab `progress`.

## Lệnh

```bash
npm run build     # kiểm tra dữ liệu + sinh src/Data.js, src/srs.html
npm test          # build + chạy test
npm run deploy    # build → clasp push -f → clasp deploy -i <ID trong .deployment-id> (URL giữ nguyên)
node scripts/deploy.js "ghi chú"   # như trên, kèm ghi chú phiên bản
node scripts/preview.js            # dựng preview/index.html để xem giao diện cục bộ (giả lập google.script.run)
```

Trên Windows cần `C:\Users\User\AppData\Roaming\npm` trong PATH (`clasp.cmd`). clasp đăng nhập bằng tài khoản bui.thinh@depocen.org.

## Ghi chú vận hành

- `setup()` chạy lại được nhiều lần: chỉ tạo tab hoặc cột còn thiếu, không ghi đè dữ liệu. Sheet ID nằm trong Script Properties (`SHEET_ID`).
- Triển khai lại không đụng tới tab `progress`.
- Mở `.../exec?admin=1`, vào Cài đặt để thấy nút xóa toàn bộ tiến độ (phải gõ `XOA`). Không có nút này ở giao diện thường.
- Thêm cụm từ mới: xem [UPDATE.md](UPDATE.md).
