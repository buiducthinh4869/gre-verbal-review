# Thêm cụm từ mới

Khi có file JSON mới cùng schema (vd. `X.json`), yêu cầu: *"Thêm cụm từ mới trong file X vào web"*. Quy trình:

1. Chép file vào `data/clusters/` (tên file trùng `id` của cụm), thêm id cụm vào `data/index.json` theo đúng thứ tự.
2. Chạy `npm run check` và `npm test`. Có lỗi dữ liệu thì báo lại, **không tự sửa nội dung từ vựng**.
3. Commit `Thêm cụm: <title>` và push lên `main`. GitHub Pages tự cập nhật sau 1–2 phút; **không cần triển khai lại Apps Script**.
4. Mở web, kiểm tra cụm mới hiện thành một thẻ trong Từ vựng, có trong bộ chọn cụm của Luyện tập và Thi thử; báo số từ và số bài GRE đã thêm.

Tiến độ của mọi người trong Sheet không bị ảnh hưởng; từ mới bắt đầu ở hộp 0 và được giới thiệu dần theo số từ mới mỗi ngày.

## `npm run check` kiểm tra gì

- Mọi file trong `data/clusters/` đều có trong `data/index.json` và ngược lại; `id` cụm trùng tên file; `schemaVersion` = 1.
- Không trùng `id` từ, `id` nhóm, `id` bài giữa các cụm; `group` của từ phải tồn tại; `priority` là 1–3; nhóm `scale` thì mọi từ phải có `level` 1–4.
- Mỗi nhóm phải có `direction` là `"positive"`, `"negative"` hoặc `"neutral"`.
- `confusables` và `targets` trỏ tới id có thật (được phép trỏ sang từ ở cụm khác).
- TC: số chỗ `{n}` bằng số `blanks`, đánh số liên tục từ `{0}`; 1 chỗ trống cần 5 phương án, 2–3 chỗ trống cần 3 phương án mỗi chỗ; `answer` nằm trong `options`.
- SE: đúng 6 phương án, đúng 2 đáp án khác nhau, đáp án nằm trong `options`.
- Không có phương án trùng nhau.

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

Khi có nhiều ứng viên, luôn ưu tiên `id` nằm trong `targets` của bài.

## Sửa nội dung trên web và đưa bản sửa vào dữ liệu gốc

Sửa nghĩa, sắc thái, ví dụ, bài tập: dùng **Chế độ sửa** ngay trên web (tài khoản quản lý). Mọi người thấy nội dung mới ở lần tải trang tiếp theo, không cần chạy lại code. Bản sửa nằm trong Sheet (tab `content_overrides`), file JSON không đổi.

Thỉnh thoảng (không bắt buộc) đưa các bản sửa vào file JSON cho gọn:

1. Trang **Quản lý** → **Xuất các bản sửa**: tải file `overrides-YYYY-MM-DD.json`.
2. Trên máy: `node scripts/apply-overrides.js overrides-YYYY-MM-DD.json --dry-run` để xem trước, rồi chạy lại không có `--dry-run`. Script chỉ đổi đúng trường được sửa, giữ định dạng file, tự chạy `npm run check` và trả lại file cũ nếu có lỗi. Chạy lại lần hai thì báo "đã giống dữ liệu gốc".
3. Commit, push, chờ GitHub Pages cập nhật.
4. Trang **Quản lý** → **Đánh dấu đã đưa vào dữ liệu gốc**: tắt (`active = FALSE`) các bản sửa đã trùng dữ liệu gốc. Nút này chỉ bật khi web đã tải được dữ liệu gốc mới; chỉ tắt đúng phiên bản đã xuất (bản sửa mới hơn vẫn giữ). Giao diện không thay đổi; lịch sử vẫn còn.

Không bao giờ xóa dòng trong `content_history`.
