"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Crown, LogOut, Zap } from "lucide-react";
import { avatarMenu, avatarSource, INITIAL_AVATAR_MENU, isOutside } from "@/lib/account";
import { signOut } from "@/lib/api";
import { useSession } from "./AuthProvider";

/**
 * Avatar kèm dropdown tài khoản. Đăng xuất nằm trong dropdown này (kiểu Clerk),
 * không phải một nút rời ở header.
 *
 * **Component này không có logic đáng test được, và đó là chủ đích.** Mọi quyết
 * định — ảnh hay chữ cái, tên gọi, khi nào đóng menu, có trả focus không — đều ở
 * `@/lib/account` và có test. Ở đây chỉ còn nối DOM với máy trạng thái đó, vì
 * `vitest.config.ts` chạy `environment: 'node'` (không có jsdom) nên không dựng
 * được component.
 */
export default function AccountMenu() {
  const { user, refresh } = useSession();
  const pathname = usePathname();
  const [state, setState] = useState(INITIAL_AVATAR_MENU);
  const [signOutError, setSignOutError] = useState("");
  /** Bọc cả nút lẫn panel: `pointerdown` bên trong vùng này không đóng menu. */
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  /** Menu item theo id, dùng cho điều hướng bằng phím mũi tên. */
  const itemRefs = useRef(new Map<string, HTMLElement>());

  const send = useCallback(
    (event: Parameters<typeof avatarMenu>[1]) => setState((s) => avatarMenu(s, event)),
    [],
  );

  /**
   * Đăng xuất: xoá dòng phiên ở BE rồi đọc lại `/me`.
   *
   * Bước `refresh()` là bắt buộc, không phải cho đẹp: nó mới là chỗ xoá cache
   * SWR và hạ user về `null` (`AuthProvider.applyUser`). Bỏ nó thì UI vẫn hiện
   * tài khoản cũ tới lần làm mới kế tiếp (tối đa 15 phút), và dữ liệu của tài
   * khoản đó vẫn nằm lại trong cache.
   */
  async function onSignOut() {
    setSignOutError("");
    const r = await signOut();
    if (r === "retry") {
      setSignOutError("Chưa đăng xuất được. Kiểm tra mạng rồi thử lại.");
      return;
    }
    await refresh();
  }

  // Đóng khi đổi trang. Đây là điều kiện dễ sót nhất: header nằm sát mép trên
  // nên một dropdown còn mở sẽ trôi theo sang trang mới và đè lên nội dung.
  useEffect(() => {
    // `setState` trong effect là chính xác trường hợp rule
    // `react-hooks/set-state-in-effect` cảnh báo — nhưng đây là *phản ứng với
    // điều hướng*, không phải set-state để dựng dữ liệu lần đầu. Tương tự cách
    // `page.tsx` và `AuthProvider.tsx` tắt rule này có lý do.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    send({ type: "ROUTE_CHANGED" });
  }, [pathname, send]);

  // `pointerdown`, KHÔNG phải `click`: xem `isOutside` trong `@/lib/account`.
  useEffect(() => {
    if (!state.open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (isOutside(rootRef.current, e.target)) send({ type: "OUTSIDE_POINTER_DOWN" });
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [state.open, send]);

  // Escape đóng và đưa focus về nút avatar.
  useEffect(() => {
    if (!state.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") send({ type: "ESCAPE" });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [state.open, send]);

  // Chỉ `Escape` bật cờ này, nên focus không bao giờ bị cướp đi ngoài ý muốn.
  useEffect(() => {
    if (state.returnFocus) buttonRef.current?.focus();
  }, [state.returnFocus]);

  // Mở menu thì focus phải vào mục đầu, đúng hợp đồng của Menu Button: không có
  // bước này thì focus vẫn nằm trên nút avatar và phím Tab sẽ đi thẳng ra khỏi
  // menu chứ không đi vào trong nó.
  useEffect(() => {
    if (state.open) visibleItems()[0]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chạy đúng một lần mỗi lần menu mở
  }, [state.open]);

  const avatar = avatarSource(user);
  const isVip = user?.role === "vip";
  const label = `Tài khoản: ${avatar.kind === "initial" ? avatar.letter : user?.email ?? ""}`;
  /** Thứ tự hiển thị: mục "Nâng cấp lên VIP" chỉ tồn tại khi chưa VIP. */
  const itemOrder: string[] = isVip ? ["signout"] : ["vip", "signout"];

  /** Menu item theo thứ tự hiển thị, bỏ mục đã bị gỡ khỏi DOM. */
  function visibleItems(): HTMLElement[] {
    return itemOrder
      .map((id) => itemRefs.current.get(id))
      .filter((el): el is HTMLElement => el !== undefined);
  }

  /**
   * Điều hướng bàn phím theo WAI-ARIA Menu Button.
   *
   * Bắt buộc đi kèm `role="menu"`: đặt vai trò menu mà không có phím mũi tên thì
   * screen reader hứa cho người dùng một cách điều hướng mà bàn phím không có —
   * tệ hơn cả lúc không khai vai trò. `Tab` đóng menu vì trong menu, Tab là
   * "ra khỏi", không phải "mục kế tiếp".
   */
  function onMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const items = visibleItems();
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (next: number) => {
      e.preventDefault();
      items[((next % items.length) + items.length) % items.length]?.focus();
    };
    switch (e.key) {
      case "ArrowDown":
        go(at + 1);
        break;
      case "ArrowUp":
        go(at <= 0 ? items.length - 1 : at - 1);
        break;
      case "Home":
        go(0);
        break;
      case "End":
        go(items.length - 1);
        break;
      case "Tab":
        send({ type: "TOGGLE" });
        break;
    }
  }

  return (
    <div className="relative flex items-center" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => send({ type: "TOGGLE" })}
        aria-haspopup="menu"
        aria-expanded={state.open}
        aria-controls={menuId}
        aria-label={label}
        className="relative flex size-9 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 focus-visible:ring-offset-2"
      >
        {/* Vòng tròn gradient/avatar. `aria-hidden` vì nút đã có `aria-label`:
            để lại nhãn ở đây sẽ khiến screen reader đọc trùng. */}
        <span
          aria-hidden
          className={
            isVip
              ? "flex size-9 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-amber-300 to-orange-500 text-sm font-bold text-white ring-2 ring-white"
              : "flex size-9 items-center justify-center overflow-hidden rounded-full bg-zinc-200 text-sm font-bold text-zinc-700"
          }
        >
          {avatar.kind === "image" ? (
            /* eslint-disable-next-line @next/next/no-img-element --
             * Cố ý KHÔNG dùng `next/image`. Ảnh Google là URL có chữ ký và hạn
             * ngắn; cache của image optimizer của Next là bền, nên nó có thể giữ
             * một URL đã hết hạn và avatar vĩnh viễn vỡ. Avatar chỉ 36px nên
             * không được gì từ tối ưu ảnh. `alt=""` vì nút đã mang nhãn. */
            <img
              src={avatar.src}
              alt={avatar.alt}
              width={36}
              height={36}
              referrerPolicy="no-referrer"
              className="size-9 object-cover"
            />
          ) : (
            avatar.letter
          )}
        </span>
        {isVip && (
          <span className="pointer-events-none absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow ring-2 ring-white">
            <Crown className="size-3 fill-white" />
          </span>
        )}
      </button>

      {state.open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Tài khoản"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-11 z-50 w-60 overflow-hidden rounded-xl border border-zinc-200 bg-white p-1 shadow-lg shadow-zinc-900/10"
        >
          <div className="border-b border-zinc-100 px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-zinc-900">
              {user?.name?.trim() || user?.email}
            </p>
            <p className="truncate text-xs text-zinc-500">{user?.email}</p>
          </div>

          {!isVip && (
            <Link
              href="/premium"
              role="menuitem"
              ref={(el) => {
                if (el) itemRefs.current.set("vip", el);
                else itemRefs.current.delete("vip");
              }}
              onClick={() => send({ type: "TOGGLE" })}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-50 focus-visible:bg-amber-50 focus-visible:outline-none"
            >
              <Zap aria-hidden className="size-4" />
              Nâng cấp lên VIP
            </Link>
          )}

          <button
            type="button"
            role="menuitem"
            ref={(el) => {
              if (el) itemRefs.current.set("signout", el);
              else itemRefs.current.delete("signout");
            }}
            onClick={() => {
              send({ type: "TOGGLE" });
              void onSignOut();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 focus-visible:bg-zinc-100 focus-visible:outline-none"
          >
            <LogOut aria-hidden className="size-4" />
            Đăng xuất
          </button>

          {signOutError && (
            <p role="alert" className="px-3 py-2 text-xs text-rose-600">
              {signOutError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
