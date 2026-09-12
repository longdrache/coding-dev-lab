import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 text-center text-[#17211b]">
      <section className="flex max-w-xl flex-col items-center">
        <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-xl bg-[#41e0c1] text-3xl font-bold text-white shadow-[0_8px_24px_rgba(65,224,193,0.25)]">
          ∞
        </div>
        <p className="text-4xl font-medium tracking-tight text-[#258bf0] sm:text-6xl">
          Sorry, this page is unavailable
        </p>
        <p className="mt-5 max-w-md text-sm leading-6 text-[#17211b]/55">
          The page you are looking for does not exist or may have moved.
        </p>
        <Link
          href="/"
          className="mt-8 bg-[#17211b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#d65a3a]"
        >
          Back to homepage
        </Link>
      </section>
    </main>
  );
}
