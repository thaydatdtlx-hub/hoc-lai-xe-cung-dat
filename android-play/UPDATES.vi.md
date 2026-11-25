# Phát hành APK cập nhật ngoài CH Play
Kênh sideload (build type sideload) có package com.hoclaixecungdat.app; bản debug cũ có package .test và không thể cập nhật đè lên bản chính thức. Bản Play release không kiểm tra/tải APK ngoài cửa hàng.
## Luồng cập nhật
Khi mở icon ứng dụng sideload, UpdateActivity đọc JSON HTTPS từ nhánh android-play-release-20261125. Nếu phiên bản mới lớn hơn VERSION_CODE và link APK hợp lệ thuộc GitHub Releases chính repo, app hiển thị thông báo. minimumVersionCode lớn hơn phiên bản cài đặt thì yêu cầu cập nhật hoặc thoát; lỗi mạng/metadata cho phép tiếp tục. Không tự cài đặt, không tải APK từ tên miền lạ, không lưu thông tin cá nhân trong feed.
## Phát hành bản kế tiếp
1. Tăng versionCode và versionName trong app/build.gradle (không đổi applicationId).
2. Build :app:assembleSideload; ký bằng cùng keystore release do chủ sở hữu bảo quản, không sử dụng debug key, không đưa keystore hoặc mật khẩu lên repo công khai.
3. Kiểm tra apksigner verify --verbose --print-certs và xác nhận fingerprint khớp APK trước, thử cài đè trên Android thật. Không bao giờ công bố bản chưa ký hoặc ký khác.
4. Tạo GitHub Release (tag ví dụ apk-v1.1.1) và tải file APK đã ký lên. Link phải có dạng https://github.com/thaydatdtlx-hub/hoc-lai-xe-cung-dat/releases/download/apk-v1.1.1/Hoc-lai-xe-cung-Dat-1.1.1.apk .
5. Cập nhật android-play/updates/latest.json trên đúng nhánh: versionCode, versionName, apkUrl, notes; minimumVersionCode chỉ tăng nếu thật sự cần. Đảm bảo link tải công khai HTTP 200 trước khi công bố metadata.
6. Bản mới có thể nhận cập nhật đè bằng trình cài đặt Android khi cùng mã gói và chữ ký. Android sẽ yêu cầu người dùng xác nhận. Nếu mất khóa ký, không thể bảo đảm cập nhật đè.
Feed ban đầu ghi 1.1.0, apkUrl trống vì chưa phát hành bản mới hơn. Không đưa link giả hoặc bắt buộc cập nhật trước khi APK sẵn sàng.
