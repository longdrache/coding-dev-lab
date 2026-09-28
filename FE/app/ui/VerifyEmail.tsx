"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { verifyEmailToken } from "@/lib/auth-form";
import { useSession } from "./AuthProvider";
import { BODY, CARD, FOOTER, FOOTER_LINK, PRIMARY, SPINNER, TITLE } from "./auth-tokens";

/**
 * Màn hiện ra khi mở link xác nhận trong mail.
 *
 * Link gửi đi có dạng `/sign-up?token=…` (`be/src/auth/auth.service.ts:189`),
 * nên nó **phải** được xử lý ở trang đăng ký. Trước đó không ai đọc `token`:
 * bấm link chỉ ra lại form đăng ký, tài khoản vẫn chưa xác minh và người dùng
 * không có đường nào để vào — đúng triệu chứng "bấm link rồi vẫn không đăng nhập
 * được".
 *
 * Gọi xong `GET /api/auth/verify` thì BE **đã set cookie phiên**, nên cần
 * `refresh()` để `useSession()` thấy người dùng.
 *
 * Màn này **không tự render form**, nên không phải lo đăng ký trùng khi người
 * dùng bấm link hai lần.
 */
export default function VerifyEmail({
  token,
  redirectTo = "/",
}: {
  token: string;
  /** Đã qua `safeRedirect` ở server component trước khi tới đây. */
  redirectTo?: string;
}) {
  const { refresh, user } = useSession();
  const router = useRouter();
  const [state, setState] = useState<"busy" | "ok" | "bad">("busy");
  const [message, setMessage] = useState("");

  useEffect(() => {
    // Cố ý KHÔNG chặn lần gọi thứ hai. React StrictMode mount → unmount → mount
    // nên chặn bằng ref sẽ giết hẳn lần đầu (cleanup đặt `cancelled`) rồi bỏ
    // luôn lần sau, kẹt vô hạn ở "đang xác nhận". Gọi thừa thì vô hại: token
    // dùng một lần nên lần hai nhận 400, và nhánh bên dưới thấy đã có phiên.
    void (async () => {
      const r = await verifyEmailToken(token);
      // `refresh()` là bước đồng bộ client, KHÔNG phải điều kiện để hiện màn.
      // Để nó ném ra thì cả chuỗi dừng và trang kẹt vô hạn ở "đang xác nhận" —
      // đúng lúc mạng chập chờn. Cookie đã nằm trong response của `verify` rồi,
      // nên verify thành công thì hiện thành công dù đồng bộ client hỏng.
      try {
        await refresh();
      } catch {
        // im lặng có chủ đích: xem giải thích ở trên.
      }
      if (r.kind === "error") {
        setMessage(r.message);
        setState("bad");
        return;
      }
      setState("ok");
      // Vào luôn, không dừng ở màn "thành công" rồi bắt bấm thêm một cái. Chỉ
      // đợi một nhịp để chữ "Đang xác nhận" không nhảy thẳng sang trang mới —
      // nếu không người dùng thấy màn trắng rồi mới hiện trang đích.
      window.setTimeout(() => router.replace(redirectTo), 600);
    })();
  }, [token, refresh]);

  // Lưới cho việc tải lại trang sau khi đã xác minh: token đã dùng nên verify
  // chắc chắn lỗi, nhưng phiên vẫn còn và người dùng **đã** vào được. Cũng xử lý
  // verify lỗi vì mạng rồi phiên lại vẫn còn.
  //
  // Tính ra lúc render thay vì `setState` trong effect: effect setState đồng bộ
  // sẽ dây chuyền render, và `eslint react-hooks/set-state-in-effect` bắt đúng.
  const shown: "busy" | "ok" | "bad" = state === "bad" && user ? "ok" : state;

  return (
    <div className={CARD}>
      {shown === "busy" && (
        <>
          <h2 className={TITLE}>Đang xác nhận email</h2>
          <p className={BODY}>
            <LoaderCircle aria-hidden className={`${SPINNER} mr-1.5 inline-block align-[-2px]`} />
            Chờ một nhịp. Lần này trang này tự đăng nhập luôn cho bạn.
          </p>
        </>
      )}

      {shown === "ok" && (
        <>
          <h2 className={TITLE}>Đã xác nhận, đang vào…</h2>
          <p className={BODY}>
            Tài khoản đã sẵn sàng. Đang đưa bạn tới trang đã chọn.
          </p>
        </>
      )}

      {shown === "bad" && (
        <>
          <h2 className={TITLE}>Link này không dùng được nữa</h2>
          <p className={BODY}>{message}</p>
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
            <CircleAlert aria-hidden className="mt-px size-4 shrink-0 text-amber-700" />
            <p className="text-sm leading-relaxed text-amber-900">
              {message.includes("hết hạn")
                ? "Mở màn đăng nhập và bấm “Gửi lại link” để nhận link mới — không cần đăng ký lại."
                : "Thử đăng nhập bằng email bạn đã đăng ký. Nếu báo chưa xác minh, bấm “Gửi lại link” để nhận link mới."}
            </p>
          </div>
          <Link href="/sign-in" className={`${PRIMARY} mt-5`}>
            Đăng nhập
          </Link>
          <p className={`${FOOTER} mt-4`}>
            Chưa có tài khoản?{" "}
            <Link href="/sign-up" className={FOOTER_LINK}>
              Đăng ký
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
