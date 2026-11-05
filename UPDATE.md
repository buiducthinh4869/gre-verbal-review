# Thêm cụm từ mới

Khi có file JSON mới cùng schema (vd. `X.json`), yêu cầu: *"Thêm cụm từ mới trong file X vào web"*. Quy trình:

1. Chép file vào `data/clusters/` (tên file trùng `id` của cụm), thêm id cụm vào `data/index.json` theo đúng thứ tự.
2. Chạy `npm run check` và `npm test`. Có lỗi dữ liệu thì báo lại, **không tự sửa nội dung từ vựng**.
3. Commit `Thêm cụm: <title>` và push lên `main`. GitHub Pages tự cập nhật sau 1–2 phút; **không cần triển khai lại Apps Script**.
4. Mở web, kiểm tra cụm mới hiện trong Từ vựng và Luyện tập; báo số từ và số bài GRE đã thêm.

Tiến độ của mọi người trong Sheet không bị ảnh hưởng; từ mới bắt đầu ở hộp 0 và được giới thiệu dần theo số từ mới mỗi ngày.

## `npm run check` kiểm tra gì

- Mọi file trong `data/clusters/` đều có trong `data/index.json` và ngược lại; `id` cụm trùng tên file; `schemaVersion` = 1.
- Không trùng `id` từ, `id` nhóm, `id` bài giữa các cụm; `group` của từ phải tồn tại; `priority` là 1–3; nhóm `scale` thì mọi từ phải có `level` 1–4.
- `confusables` và `targets` trỏ tới id có thật.
- TC: số chỗ `{n}` bằng số `blanks`, đánh số liên tục từ `{0}`; 1 chỗ trống cần 5 phương án, 2–3 chỗ trống cần 3 phương án mỗi chỗ; `answer` nằm trong `options`.
- SE: đúng 6 phương án, đúng 2 đáp án khác nhau, đáp án nằm trong `options`.
- Không có phương án trùng nhau.

## Hướng nghĩa cho phương án nhiễu

Bài Nghĩa → Từ lấy phương án nhiễu cùng hướng nghĩa. Cụm Khen & Chê đã được khai báo sẵn trong `assets/vocab.js`. Cụm mới muốn có hướng nghĩa riêng thì thêm `"direction": "<tên hướng>"` vào từng nhóm trong file JSON. Không khai thì phương án nhiễu được lấy trong cùng cụm.
