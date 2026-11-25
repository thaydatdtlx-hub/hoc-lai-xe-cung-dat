# Học lái xe cùng Đạt — Android (TWA)
Ứng dụng dùng Trusted Web Activity (Android Browser Helper). Website và dữ liệu hiện tại dùng chung; không nhúng khóa Supabase hay mật khẩu. Android 6+ (minSdk 23), target API 36. Package release com.hoclaixecungdat.app; debug com.hoclaixecungdat.app.test.
## Build
Android Studio / JDK 17 / Android SDK 36 / Gradle 8.13:
```
cd android-play
gradle :app:assembleDebug :app:bundleRelease
```
Debug APK được ký bằng khóa debug, chỉ để thử, có thể hiển thị thanh Chrome do chưa xác minh domain. AAB release chưa ký, không thể upload ngay. Tạo và giữ riêng upload keystore, ký AAB bằng Android Studio (Generate Signed Bundle/APK) hoặc jarsigner; tuyệt đối không commit/upload khóa riêng hoặc mật khẩu vào repo công khai. Bật Play App Signing; lấy SHA-256 của **app signing key certificate** (không phải upload key).
```
node android-play/scripts/generate-assetlinks.mjs 'PUBLIC_SHA256_FINGERPRINT'
```
Sau đó đưa riêng public/.well-known/assetlinks.json lên website đã kiểm tra, xác nhận HTTP 200, Content-Type application/json và không chuyển hướng; không tắt bảo vệ Vercel Preview. App mở https://www.hoclaixecungdat.com/ (domain production). Trước xác minh TWA sẽ fallback Custom Tab.
## Kiểm thử
Android thật: mở app, 250/600, đăng nhập bằng tài khoản thử nghiệm, lịch A1/A/B/C1, đăng xuất, biên lai, Back, sáng/tối, mạng lỗi, deep links. Kiểm tra thanh Chrome biến mất sau xác minh domain. Đảm bảo không ghi dữ liệu học viên thật trong ảnh chụp và không dùng thông tin đăng nhập sản xuất khi quay video.
## Release
Đăng ký Google Play Console ($25 một lần), tạo ứng dụng, thêm hồ sơ STORE-LISTING.vi.md, ký và tải AAB, khai báo chính sách, kiểm thử nội bộ/kín theo yêu cầu tài khoản. Với tài khoản cá nhân mới thuộc diện áp dụng: ít nhất 12 tester tham gia liên tục 14 ngày. Sau đó xin Production access và gửi xét duyệt. Không có bảo đảm duyệt.
