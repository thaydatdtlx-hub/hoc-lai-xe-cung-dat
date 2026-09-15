# Module mô phỏng — trạng thái bản nháp

Trang `/mo-phong-120.html` là trang tĩnh được Vite sao chép từ public.
Chưa thêm liên kết trên trang chính vì chưa có video để phát hành cho học viên.

Đã viết giao diện chọn 120 ID/6 chương, tải manifest, trình phát, ghi một lần
thời điểm phát hiện, tính điểm theo khoảng, thi thử 10 câu ngẫu nhiên không
trùng và lưu tiến độ/lịch sử tại trình duyệt. Thi thử là bài luyện tập,
không khẳng định thuật toán ra đề hoặc quy chế sát hạch hiện hành.

## Hợp đồng dữ liệu mới

Đây là schema đề xuất cho loader mới, không phải schema đã xác minh của một
module ở nơi khác. Manifest giữ `version` và `scenarios`.
Mỗi scenario phải có:

- `id`: số nguyên 1–120; `chapter`: số 1–6 theo ranh giới 29/43/63/73/90/120.
- `title`: tên tình huống.
- `videoUrl`: đường dẫn bắt đầu `/` hoặc HTTPS, phải trỏ tới video phát được.
- `durationSeconds`: thời lượng chính xác của video, đơn vị giây.
- `scoreWindows`: năm khoảng `{score, start, end}` theo thứ tự điểm 5,4,3,2,1.
  Các khoảng nối tiếp, không chồng chéo, start được tính, end không được tính.
  Mốc lấy trên trục thời gian video, gồm phần đếm ngược nếu đã nằm trong video.
- `source`: `{url, version, rightsReference}` để ghi nguồn, phiên bản và căn cứ
  quyền sử dụng. Kiểm tra chuỗi không thay thế xác minh giấy phép thực tế.
- `hint`: gợi ý tùy chọn, chỉ hiện sau khi kết thúc ôn tập.

Thời lượng khác metadata trên 0,25 giây sẽ khóa chấm điểm để kiểm tra. Phải
kiểm chứng ngưỡng này với bản mã hóa video thực tế trước khi phát hành.

## Kiểm tra

`node scripts/test-simulation-media.mjs`: đã PASS với timeline tổng hợp chỉ
nằm trong test; kiểm tra biên thời gian, ID trùng, thiếu nguồn, sai chương,
khoảng điểm sai, thiếu bộ đề, và khóa phát hành manifest pending.
`node --check public/mo-phong/{core,app}.mjs`: kiểm tra riêng từng tệp đã PASS.

Chưa kiểm thử trình duyệt: cloud browser chặn địa chỉ loopback của server
kiểm thử (`ERR_BLOCKED_BY_CLIENT`). Chưa kiểm thử phát video/thao tác/lưu
lịch sử end-to-end. Chưa chạy build toàn repository.

## Chưa hoàn tất

- Manifest production còn rỗng: 0/120 video, chưa có mốc điểm thật.
- Chưa đồng bộ tài khoản: dữ liệu lưu chung theo trình duyệt, được ghi rõ
  trên giao diện; không dùng cookie/token hoặc dữ liệu học viên hiện có.
- Chưa nhập bộ cài và xác minh phạm vi quyền sử dụng, chưa triển khai live.
- Cần kiểm thử browser với video thật, xử lý lỗi mạng, desktop/mobile và
  lưu kết quả trước khi chuyển PR sang sẵn sàng merge.

Đây là phần ứng dụng đang phát triển, không phải dự án hoàn thiện.
