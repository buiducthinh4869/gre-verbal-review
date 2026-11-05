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
| Dữ liệu người dùng | Google Sheet | Tab `users`, `sessions`, `progress`, `log`, `custom_words`, `settings` |
| Dữ liệu từ vựng | `data/` trong repo, tải trực tiếp từ GitHub Pages | Không qua Apps Script |

Giao diện là HTML/CSS/JavaScript thuần (ES modules), không framework, không bước build.

```
index.html              khung trang (định tuyến bằng hash #today, #vocab, ...)
config.js               API_URL của Apps Script, ngày thi
assets/
  app.js                khởi động, tải dữ liệu, định tuyến, sự kiện chung
  auth.js               đăng nhập, phiên, làm mới trạng thái
  api.js                gọi Apps Script, hàng đợi lưu tự động
  state.js              trạng thái dùng chung, ghi nhận kết quả, điều hướng
  srs.js                hộp Leitner, sổ hay quên, phiên hôm nay (thuần, test bằng node)
  vocab.js              chỉ mục dữ liệu, ánh xạ phương án GRE, chấm bài (thuần)
  distractors.js        sinh phương án nhiễu (thuần)
  render.js             render ví dụ *...* / **...** an toàn
  views/                today, vocab, practice, session, notebook, addword, account, admin, login, settings
apps-script/            rootDir của clasp: Api.js, Auth.js, Store.js, Admin.js, Migrate.js
data/                   index.json + clusters/*.json
scripts/                check-data, deploy-api, admin-cli, e2e-api, dev-server
tests/                  srs, distractors, api (server chạy trong giả lập Apps Script)
```

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
node scripts/e2e-api.js           # kiểm thử đầu cuối trên API thật bằng user02/user03, tự dọn sau khi chạy
```

Trên Windows dùng `npm.cmd` / `clasp.cmd`. `scripts/admin-cli.js` cần file `.admin-key` (chỉ có trên máy quản trị, đã gitignore); bản băm của khóa nằm trong `apps-script/AdminKey.js` (cũng gitignore, chỉ clasp đẩy lên Apps Script). Không có hai file này thì các lệnh `cli.*` trên API bị tắt; web vẫn chạy bình thường. Tạo khóa mới: `node scripts/admin-cli.js init-key` rồi `npm run deploy-api`.

## Lưu tự động

Mỗi câu trả lời cập nhật giao diện ngay, rồi vào hàng đợi (ghi tạm `localStorage` theo `userId`). Hàng đợi gửi `saveEvents` sau 2 giây không thao tác, hoặc đủ 10 sự kiện, hoặc khi trang bị ẩn (`pagehide` dùng `sendBeacon`). Lỗi mạng thì thử lại sau 5, 15, 60 giây. Server gộp theo `updatedAt` (bản mới hơn thắng) và bỏ qua sự kiện gửi trùng trong 6 giờ. Quay lại tab sau hơn 10 phút thì tự lấy dữ liệu mới. Phiên hết hạn: giữ hàng đợi, đăng nhập lại thì gửi tiếp.

## An toàn dữ liệu trong Sheet

- Server đọc/ghi theo **tên cột**, chỉ sửa đúng các dòng của người dùng đó và thêm dòng mới ở cuối. Không `clear()`, không ghi lại cả bảng, không sắp xếp lại.
- Từ tự thêm khi xóa chỉ được đánh dấu `deletedAt`, dòng vẫn còn.
- `apps-script/Migrate.js` chuyển dữ liệu bản cũ (một người dùng) sang `u01`: chèn cột `userId` vào đầu các tab cũ, điền `u01`, tạo tab `users`, `sessions`. Chạy lại vô hại.

## Lịch sử

- Bản 1 (giao diện chạy trong Apps Script, một người dùng): code ở nhánh `v1-apps-script`. Deployment giao diện cũ `AKfycbxPyL9…` đã được gỡ ngày 04/11/2026 khi chuyển sang bản 2 (phiên bản 2 của project vẫn còn trong Apps Script).
- Chuyển dữ liệu 04/11/2026: 12 dòng progress, 16 dòng log, 3 dòng settings của bản cũ → `u01`, khớp 100% với bản sao lưu "GRE Verbal - Tiến độ ôn tập (sao lưu 2026-11-04)".
- Thêm cụm từ mới: xem [UPDATE.md](UPDATE.md).
