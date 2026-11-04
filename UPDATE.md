# Thêm cụm từ mới

Khi có file JSON mới cùng schema (vd. `X.json`), yêu cầu: *"Thêm cụm từ mới trong file X vào web"*. Quy trình:

1. Chép file vào `data/clusters/` (tên file phải trùng `id` của cụm), thêm id cụm vào `data/index.json` theo đúng thứ tự.
2. `npm run build`. Lệnh này kiểm tra schema: trùng `id` từ giữa các cụm, `group` không tồn tại, `confusables`/`targets` trỏ tới id không có, số `{n}` khác số `blanks`, `answer` không nằm trong `options`, SE không đủ 6 phương án / 2 đáp án, phương án trùng, TC một chỗ trống không đủ 5 phương án (nhiều chỗ: 3 phương án mỗi chỗ). **Nếu lỗi thì báo lại, không tự sửa nội dung từ vựng.**
3. `npm test`.
4. `npm run deploy` (URL giữ nguyên nhờ `.deployment-id`).
5. Commit với thông điệp `Thêm cụm: <title>` và push lên GitHub (`git push`).
6. Mở web kiểm tra cụm mới hiển thị đúng ở Từ vựng và Tiến độ theo cụm; báo số từ và số bài đã thêm (`npm run build` in ra hai con số này).

Tiến độ cũ trong Sheet không bị ảnh hưởng. Từ mới bắt đầu ở hộp 0 và được giới thiệu theo thứ tự `order` của cụm, `priority` cao trước.

## Hướng nghĩa cho phương án nhiễu

Bài Nghĩa → Từ ưu tiên phương án cùng hướng nghĩa. Với cụm Khen & Chê, hướng được suy từ id nhóm (`praise-*`, `lukewarm`, `excess`, `flattery` = khen; `belittle`, `reprove`, `denounce`, `ridicule`, `quibble` = chê). Cụm mới có thể khai báo hướng trên từng nhóm bằng trường tùy chọn `"direction": "<tên hướng>"` (vd. `"positive"`/`"negative"`); không khai báo thì phương án nhiễu lấy trong cùng cụm.
