# Chính sách bảo mật

**Cập nhật lần cuối:** 2026-10-01

## 1. Thông tin chúng tôi thu thập

### Khi bạn đăng ký
- Email (bắt buộc)
- Mật khẩu (mã hoá bcrypt, không lưu plaintext)
- Tên hiển thị (tùy chọn)
- Ảnh đại diện từ Google (nếu đăng nhập bằng Google)

### Khi bạn sử dụng dịch vụ
- Lịch sử nộp bài (mã nguồn, kết quả, thời gian chạy)
- Tiến độ học tập (streak, huy hiệu, bài đã giải)
- Lượt xem trang (đường dẫn, thời gian)
- Lượt đăng nhập (quốc gia, thời gian)

### Thông tin kỹ thuật
- **IP hash**: chỉ lưu `sha256(salt + IP)`, không lưu IP thô
- **User-Agent**: nhận diện trình duyệt/thiết bị
- **Cookie phiên**: access token (15 phút) + refresh token (30 ngày)

## 2. Cách chúng tôi sử dụng thông tin

- **Cung cấp dịch vụ**: chấm bài, lưu tiến độ, đồng bộ giữa các thiết bị
- **Gửi email**: xác minh tài khoản, đặt lại mật khẩu, trả lời hỏi đáp
- **Cải thiện sản phẩm**: thống kê lượt xem, phân tích hành vi sử dụng
- **Bảo mật**: phát hiện đăng nhập bất thường, chống lạm dụng

## 3. Thông tin chúng tôi **không** thu thập

- Không lưu IP thô
- Không bán thông tin cho bên thứ ba
- Không theo dõi trên các trang web khác
- Không thu thập thông tin từ trẻ em dưới 13 tuổi

## 4. Quyền của bạn

- **Truy cập**: xem thông tin tài khoản của bạn
- **Sửa đổi**: cập nhật email, tên, mật khẩu
- **Xoá**: yêu cầu xoá tài khoản và toàn bộ dữ liệu liên quan
- **Xuất**: yêu cầu bản sao dữ liệu của bạn

Để thực hiện các quyền trên, gửi email tới: **privacy@gocode.vn**

## 5. Lưu trữ và bảo mật

- Mật khẩu: mã hoá bcrypt
- Token: JWT RS256, refresh token xoay vòng theo thiết bị
- Kết nối: HTTPS/TLS
- Cơ sở dữ liệu: Postgres (Neon), backup định kỳ

## 6. Thay đổi chính sách

Chúng tôi có thể cập nhật chính sách này. Thay đổi quan trọng sẽ được thông báo qua email trước 7 ngày.

## 7. Liên hệ

- Email: **privacy@gocode.vn**
- Trang web: https://go-code-vn.vercel.app/
