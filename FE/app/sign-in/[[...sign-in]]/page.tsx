import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import Logo from "@/app/ui/Logo";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white px-4 py-10">
      <Logo />
      <SignIn />
      <Link
        href="/"
        className="text-sm text-zinc-500 transition hover:text-zinc-900"
      >
        ← Về trang chủ
      </Link>
    </div>
  );
}
