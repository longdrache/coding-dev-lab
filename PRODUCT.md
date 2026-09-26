# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Tiếng Việt, học sinh và sinh viên luyện cấu trúc dữ liệu và giải thuật. Tình huống: ngồi luyện một bài đang mắc, cần chạy thử code ngay và biết mình đã giải được bao nhiêu bài.

## Product Purpose

GoCode cho phép luyện giải thuật với phản hồi tức thì và ghi nhớ tiến độ. Thành công là người dùng giải được bài, thấy streak tích luỹ, và quay lại ngày mai.

## Positioning

Miễn phí hoàn toàn, không cần thẻ tín dụng. Chấm cả lô test ẩn trong một lần gọi Judge0 nên không phải chờ từng test. Toàn bộ giao diện, tên bài và thông báo lỗi bằng tiếng Việt.

## Operating Context

Luyện tập cá nhân, thường mỗi ngày một lần để giữ chuỗi ngày (streak). Judge0 là dịch vụ chấm code bên thứ ba, giới hạn số test ẩn mỗi bài tối đa 10. Phần trả phí dùng Stripe và có bảng quản trị riêng.

## Capabilities and Constraints

- 56 bài đã xuất bản, 8 ngôn ngữ lập trình.
- Chấm batch tức thì; không test ẩn nào lộ ra cho client.
- 12 huy hiệu, streak, lịch sử nộp bài, yêu thích bài, bản đồ nhiệt 35 ngày.
- Có gói trả phí (VIP) và bảng quản trị tách riêng, đăng nhập riêng.
- Mật khẩu và phiên do hệ thống tự quản lý; hệ thống không lưu IP thô, chỉ lưu hash.
- Vai trò và hạn VIP lưu trong bảng `User` (`role`, `vipExpiresAt`), không nằm ở dịch vụ xác thực bên ngoài. Chi tiết ở `docs/superpowers/specs/2026-09-27-custom-auth-design.md`.

## Brand Commitments

- Tên sản phẩm: GoCode. Không đổi từ này.
- Copy tiếng Việt, viết sentence case, không all-caps trừ nhãn mono.
- Không dùng emoji trong giao diện.
- Không đưa số liệu mẫu lên như số thật. `DESIGN.md` là nguồn chân lý cho thế giới hình ảnh, kể cả việc đã ghim Inter làm font hiển thị; đừng đổi phần đó khi thấy nó thuộc loại font quen thuộc.

## Evidence on Hand

- Dữ liệu bài thật: `FE/app/data/problems.ts` (56 bài, kèm test mẫu).
- Bảng giá thật: `FE/app/data/pricing.ts`.
- Dữ liệu người dùng thật trên Neon (một tài khoản, lịch sử luyện tập).
- Có sẵn hạ tầng gửi mail qua Mailtrap và `nodemailer` trong backend.

Những thứ chưa có, và không được bịa ra: không có testimonial, không có logo chính thức ngoài component `Logo`, không có số liệu người dùng, không có ảnh chụp sản phẩm thật.

## Product Principles

1. Miễn phí và không rào cản thẻ tín dụng. Không bao giờ biến việc luyện tập thành điều kiện trả trước.
2. Phản hồi tức thì. Một vòng chờ dài hơn nhu cầu là lỗi, không phải đặc điểm.
3. Tiếng Việt là tiếng mẹ của sản phẩm, kể cả ở nơi dễ bỏ sót nhất: tên trường hợp lỗi.
4. Tiến độ thuộc về người dùng. Đăng nhập xong là thấy lại đúng chỗ đang dở, ở máy khác cũng vậy.
5. Thành thật về số liệu. Số nào không có thật thì không hiện.
