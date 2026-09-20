import { redirect } from "next/navigation";

export default function Home() {
  // Trang gốc của admin luôn chuyển hướng về dashboard (middleware sẽ đẩy về /login nếu chưa đăng nhập)
  redirect("/dashboard");
}
