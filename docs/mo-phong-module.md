# Module mô phỏng — trạng thái bản nháp

Trang `/mo-phong-120.html` là trang tĩnh được Vite sao chép từ `public`.
Chưa thêm liên kết trên trang 600 câu vì media production chưa được gắn.

## Đã triển khai

- Chọn 120 tình huống theo 6 chương; player desktop/mobile; Space hoặc nút phát hiện nguy hiểm.
- Ghi một lần thời điểm phát hiện và chấm theo năm khoảng 5→4→3→2→1.
- Thi thử 10 tình huống không trùng theo cơ cấu chương 2/1/2/1/2/2, tối đa 50, mục tiêu 35.
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

Nguồn v2.0.0 cung cấp hai mốc `start` và `end` cho mỗi tình huống. `start` là đầu vùng nguy hiểm/5 điểm, `end` là đầu vùng 0 điểm. Tài liệu hướng dẫn công khai mô tả thang 5→4→3→2→1 trải đều giữa hai mốc; manifest phát hành sẽ chia đều khoảng này thành năm vùng liên tiếp.

Player khóa chấm điểm nếu metadata thời lượng video lệch dữ liệu trên 0,25 giây. Mẫu `chapter1_th1.pt` đã được xác minh có thể chuyển thành MP4 H.264/AAC 1920×1080 60fps và khớp thời lượng nguồn.

## Kiểm tra

CI trên nhánh chạy:

- `node --check public/mo-phong/core.mjs`
- `node --check public/mo-phong/app.mjs`
- `node scripts/test-simulation-media.mjs`
- `npm run build`
- kiểm tra `dist/mo-phong-120.html`, module JS và manifest đều được đóng gói.

Build gần nhất PASS. Test bao gồm biên điểm, schema lỗi, mapping chương, 10 ID không trùng, cơ cấu đề 2/1/2/1/2/2 và khóa phát hành khi manifest còn `pending`.

## Còn chặn phát hành

- Chưa có media/object-storage do dự án kiểm soát để website phát 120 MP4 trực tiếp; vì vậy manifest production vẫn `pending`.
- Chưa kiểm thử end-to-end player với đủ video thật trên desktop/mobile.
- Chưa thêm link module vào trang 600 câu và chưa merge/deploy production.

Không đưa video lớn vào Git repository. Chỉ chuyển PR sang sẵn sàng merge sau khi có URL media hợp lệ, đủ 120 tình huống và kiểm thử player thật.
