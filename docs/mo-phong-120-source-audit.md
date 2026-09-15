# Nguồn dữ liệu mô phỏng 120 tình huống

Ngày kiểm tra: 2026-09-15. Trạng thái: **chưa nhập video hoặc mốc chấm điểm**.

## Hiện trạng repository

Ở commit `a50fc300004c85e7bce211ac001051de8ae6c7a9`,
`public/data/mo-phong-120-media.json` có `version: "pending"` và `scenarios: []`.
Tìm kiếm trong mã nguồn checkout không thấy loader tham chiếu manifest này.
Vì vậy chưa thể khẳng định schema tương thích với module đang được mô tả;
cần mã nguồn loader thực tế trước khi lựa chọn tên trường hoặc thay đổi giao diện.

## Nguồn tìm được

- Trang Trung tâm GDNN Nam Sơn hướng dẫn bộ cài v2.0.0:
  https://laixenamson.edu.vn/blog/huong-dan-tai-phan-mem-mo-phong-v200-tren-may-tinh
- Thư mục được trang này dẫn tới:
  https://drive.google.com/drive/folders/1o5lwvMCaRbyAHcBdrn3n3Xn_WDP799AA
- `OnTapMoPhongSetup_v200_x64.rar`: 5,858,455,565 bytes theo metadata Drive.
  https://drive.google.com/file/d/1vdBP2NJV29tUCimf3Nk1ubN6gH5gd2Po/view
- `UpdateOnTap_v2.0.0_x64.rar`: 241,824 bytes theo metadata Drive.
  https://drive.google.com/file/d/1lteAIGUPs2yQRN-ds2A62G7tghEcZ2d7/view

Thử tải bản gốc bằng kết nối Google Drive bị từ chối HTTP 413:
giới hạn 268,435,456 bytes mỗi tệp. Chưa đọc nội dung archive, chưa kiểm tra
video, bảng điểm, tính toàn vẹn hoặc giấy phép trong gói. Metadata và bài
hướng dẫn không phải bằng chứng xác thực chữ ký số hoặc quyền tái phân phối.

Đã tìm được cả link đúng tên bản cũ người dùng nhắc tới:
https://drive.google.com/file/d/1XGOeAWZFkfD8HDu3wLaxV2anRjLCmYnh/view
Nguồn dẫn: https://www.vniteach.com/2022/09/20/phan-mem-mo-phong-cac-tinh-huong-giao-thong-thi-sat-hach-o-to-moi-nhat/
Không nên dùng mốc điểm bản 1.2.2 cho video/bộ chấm điểm khác phiên bản.

## Bộ cài từng được cung cấp

https://drive.google.com/drive/folders/1H5yMotUkwbunHdeTK_dygjqRWcYOAsPA

Danh sách đọc được ở cấp ngoài chỉ có Setup.exe, Setup.msi và hai thư mục
phần mềm phụ trợ. Chuỗi trong MSI nhắc tới Setup1.cab–Setup9.cab và các tên
chapterN_thM.pt. Đây là tham chiếu tên tệp, không chứng minh dữ liệu video
đã có hoặc định dạng bên trong đã được giải mã. Trường Author là DRVN cũng
không tự chứng minh nguồn chính thức hay quyền đưa video lên website.

## Điều kiện hoàn tất nhập dữ liệu

1. Có gói nguyên vẹn có thể tải qua kênh được hỗ trợ, hoặc các video và bảng
   chấm điểm được cung cấp riêng trong giới hạn tải của kết nối.
2. Xác định phiên bản, xuất xứ và phạm vi quyền sử dụng video trên website.
3. Đối chiếu loader thực tế; giữ ID 1–120 ổn định và đủ sáu chương.
4. Gắn mỗi video với mốc điểm của đúng phiên bản và đúng điểm bắt đầu video;
   ghi rõ đơn vị thời gian, phần đếm ngược và quy tắc bao gồm/loại trừ biên.
5. Kiểm tra đủ 120 ID không trùng, video phát được và tua được, các mốc tăng
   dần và nằm trong thời lượng; kiểm thử ngay trước/tại/sau mỗi mốc điểm.
6. Chỉ cập nhật version phát hành sau khi đủ dữ liệu; không thay URL bằng
   liên kết trang xem Drive và không điền mốc điểm ước lượng.

PR này ghi nhận nguồn và trở ngại tải. Nó không kích hoạt module mô phỏng,
không đổi dữ liệu production và không tuyên bố đã hoàn thiện 120 tình huống.
