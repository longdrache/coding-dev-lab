import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chính sách bảo mật — GoCode",
  description: "Cách GoCode thu thập, sử dụng và bảo vệ thông tin của bạn.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-950">
        Chính sách bảo mật
      </h1>
      <p className="mt-2 text-sm text-zinc-500">Cập nhật lần cuối: 2026-10-01</p>

      <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-zinc-700">
        <section>
          <h2 className="text-lg font-semibold text-zinc-900">1. Thông tin chúng tôi thu thập</h2>
          <h3 className="mt-4 font-medium text-zinc-900">Khi bạn đăng ký</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Email (bắt buộc)</li>
            <li>Mật khẩu (mã hoá bcrypt, không lưu plaintext)</li>
            <li>Tên hiển thị (tùy chọn)</li>
            <li>Ảnh đại diện từ Google (nếu đăng nhập bằng Google)</li>
          </ul>
          <h3 className="mt-4 font-medium text-zinc-900">Khi bạn sử dụng dịch vụ</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Lịch sử nộp bài (mã nguồn, kết quả, thời gian chạy)</li>
            <li>Tiến độ học tập (streak, huy hiệu, bài đã giải)</li>
            <li>Lượt xem trang (đường dẫn, thời gian)</li>
            <li>Lượt đăng nhập (quốc gia, thời gian)</li>
          </ul>
          <h3 className="mt-4 font-medium text-zinc-900">Thông tin kỹ thuật</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><strong>IP hash</strong>: chỉ lưu <code className="rounded bg-zinc-100 px-1">sha256(salt + IP)</code>, không lưu IP thô</li>
            <li><strong>User-Agent</strong>: nhận diện trình duyệt/thiết bị</li>
            <li><strong>Cookie phiên</strong>: access token (15 phút) + refresh token (30 ngày)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-900">2. Cách chúng tôi sử dụng thông tin</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><strong>Cung cấp dịch vụ</strong>: chấm bài, lưu tiến độ, đồng bộ giữa các thiết bị</li>
            <li><strong>Gửi email</strong>: xác minh tài khoản, đặt lại mật khẩu, trả lời hỏi đáp</li>
            <li><strong>Cải thiện sản phẩm</strong>: thống kê lượt xem, phân tích hành vi sử dụng</li>
            <li><strong>Bảo mật</strong>: phát hiện đăng nhập bất thường, chống lạm dụng</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-900">3. Thông tin chúng tôi không thu thập</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Không lưu IP thô</li>
            <li>Không bán thông tin cho bên thứ ba</li>
            <li>Không theo dõi trên các trang web khác</li>
            <li>Không thu thập thông tin từ trẻ em dưới 13 tuổi</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-900">4. Quyền của bạn</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><strong>Truy cập</strong>: xem thông tin tài khoản của bạn</li>
            <li><strong>Sửa đổi</strong>: cập nhật email, tên, mật khẩu</li>
            <li><strong>Xoá</strong>: yêu cầu xoá tài khoản và toàn bộ dữ liệu liên quan</li>
            <li><strong>Xuất</strong>: yêu cầu bản sao dữ liệu của bạn</li>
          </ul>
          <p className="mt-3">
            Để thực hiện các quyền trên, gửi email tới:{" "}
            <a href="mailto:privacy@gocode.vn" className="text-blue-600 underline">
              privacy@gocode.vn
            </a>
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-900">5. Lưu trữ và bảo mật</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Mật khẩu: mã hoá bcrypt</li>
            <li>Token: JWT RS256, refresh token xoay vòng theo thiết bị</li>
            <li>Kết nối: HTTPS/TLS</li>
            <li>Cơ sở dữ liệu: Postgres (Neon), backup định kỳ</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-900">6. Thay đổi chính sách</h2>
          <p className="mt-2">
            Chúng tôi có thể cập nhật chính sách này. Thay đổi quan trọng sẽ được thông báo qua email trước 7 ngày.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-900">7. Liên hệ</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Email: <a href="mailto:privacy@gocode.vn" className="text-blue-600 underline">privacy@gocode.vn</a></li>
            <li>Trang web: <a href="https://go-code-vn.vercel.app/" className="text-blue-600 underline">https://go-code-vn.vercel.app/</a></li>
          </ul>
        </section>
      </div>
    </main>
  );
}
