# Module mô phỏng — trạng thái bản nháp

Trang `/mo-phong-120.html` là trang tĩnh được Vite sao chép từ `public`. Liên kết vào module đã được thêm trên trang `600-cau-hoi.html`.

> Cập nhật pháp lý: từ 01/07/2026, phần mô phỏng trên máy tính không còn là nội dung sát hạch GPLX. Module này được duy trì như công cụ luyện kỹ năng nhận biết và xử lý tình huống nguy hiểm, không giới thiệu như một phần thi sát hạch hiện hành.

## Đã triển khai

- Chọn 120 tình huống theo 6 chương; player desktop/mobile; Space hoặc nút phát hiện nguy hiểm.
- Ghi một lần thời điểm phát hiện và chấm theo năm khoảng 5→4→3→2→1 để phục vụ luyện tập.
- Luyện đề 10 tình huống không trùng theo cơ cấu chương 2/1/2/1/2/2, tối đa 50, mục tiêu luyện tập 35.
- Lưu tiến độ, lịch sử, tiếp tục học và phân loại 4–5 / 1–3 / 0 / chưa luyện.
- Đồng bộ tài khoản học viên qua `app_student_get_simulation_progress`, `app_student_save_simulation_progress`, `app_student_save_simulation_exam`; localStorage là dự phòng khi chưa đăng nhập hoặc mất mạng.
- `public/data/mo-phong-120-timing-source.json` chứa đủ 120 ID từ `tss.db` v2.0.0: chương, tên file, thời lượng, mốc bắt đầu nguy hiểm, mốc 0 điểm và mô tả.

## Hợp đồng manifest

`public/data/mo-phong-120-media.json` giữ `version` và `scenarios`. Mỗi scenario cần:

- `id`: 1–120; `chapter`: 1–6 theo ranh giới 29/43/63/73/90/120.
- `title`: tên tình huống.
- `videoUrl`: HTTPS hoặc đường dẫn tuyệt đối cùng website tới video phát được.
- `durationSeconds`: thời lượng chính xác theo trục video.
- `scoreWindows`: năm khoảng `{score,start,end}` cho 5,4,3,2,1; khoảng `[start,end)`, nối tiếp và không chồng lấn.
- `source`: `{url,version,rightsReference}`.
- `hint`: gợi ý tùy chọn, chỉ hiện sau khi kết thúc ôn tập.

Nguồn v2.0.0 cung cấp hai mốc `start` và `end` cho mỗi tình huống. `start` là đầu vùng nguy hiểm/5 điểm, `end` là đầu vùng 0 điểm. Vì `tss.db` không lưu năm ranh giới điểm riêng, manifest web nội suy tuyến tính khoảng này thành năm vùng liên tiếp 5→4→3→2→1 để phục vụ luyện tập; không mô tả phép nội suy này như quy tắc sát hạch hiện hành.

Player khóa chấm điểm nếu metadata thời lượng video lệch dữ liệu trên 0,25 giây. Pipeline phát hành giải mã phần đầu được bảo vệ của media, xác minh thời lượng nguồn, chuyển mã H.264/AAC và kiểm tra lại thời lượng trước khi upload.

## Kiểm tra

CI trên nhánh chạy:

- `node --check public/mo-phong/core.mjs`
- `node --check public/mo-phong/app.mjs`
- `node scripts/test-simulation-media.mjs`
- `npm run build`
- kiểm tra `dist/mo-phong-120.html`, module JS và manifest đều được đóng gói.

Test bao gồm biên điểm, schema lỗi, mapping chương, 10 ID không trùng, cơ cấu đề 2/1/2/1/2/2 và khóa phát hành khi manifest còn `pending`.

## Còn chặn phát hành

- Manifest production chỉ được mở sau khi Storage có đủ 120 MP4 và toàn bộ URL public vượt kiểm tra.
- Cần kiểm thử end-to-end player với media thật sau khi manifest production được tạo.
- Chỉ chuyển PR sang sẵn sàng merge sau khi media, manifest, build và player đều vượt kiểm tra.

Không đưa video lớn vào Git repository.