# Chuẩn bị gói mô phỏng trên Windows

Công cụ `prepare-simulation-package.ps1` tự tải bộ cài từ liên kết đã tìm
thấy, hoặc dùng tệp RAR đã có trên máy; chia thành phần 200 MiB và tạo bảng
SHA-256 để kiểm tra khi ghép lại. Không chạy bộ cài, không giải mã nội dung,
không tải dữ liệu lên mạng và không đổi chính sách PowerShell.

Tải script về máy, mở PowerShell tại thư mục chứa script:

```powershell
powershell -NoProfile -File .\prepare-simulation-package.ps1
```

Nếu máy chủ tải trực tiếp không hoạt động, dùng bản RAR đã tải từ Drive:

```powershell
powershell -NoProfile -File .\prepare-simulation-package.ps1 -ArchivePath "C:\Users\YOUR_NAME\Downloads\OnTapMoPhongSetup_v200_x64.rar"
```

Cần khoảng 12 GB trống khi tải và chia bộ cài 5,86 GB. Thư mục kết quả mới
được tạo trên Desktop. Chỉ tải `archive.part*` và `parts.json` vào thư mục
Drive được chia sẻ; không tải lại tệp RAR lớn. Những phần này là các đoạn
byte để ghép lại, không phải archive có thể giải nén riêng từng phần.

Nếu lỗi xảy ra, script dừng và giữ dữ liệu đã tải để kiểm tra. Không có
chức năng tiếp tục phần tải dở; khi chạy lại sẽ tạo thư mục kết quả khác.
Không chạy bộ cài lấy từ nguồn chưa kiểm chứng.

Giới hạn kiểm tra: script được rà soát tĩnh; môi trường làm việc hiện tại
không có Windows PowerShell để chạy thử. Link tải trực tiếp trả 502 từ
phiên máy chủ của trợ lý ngày 2026-09-15, nên chưa xác nhận tải thành công.
Chia tệp giải quyết giới hạn truyền 256 MiB/tệp của kết nối, không xác nhận
quyền tái phân phối hoặc tính chính xác của video/mốc điểm.
