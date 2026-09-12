"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";

import CodeEditor from "@/app/ui/editer";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const languages = [
  { id: 71, name: "Python 3", starter: 'print("Hello, world!")' },
  { id: 63, name: "JavaScript", starter: 'console.log("Hello, world!");' },
  {
    id: 54,
    name: "C++ 17",
    starter:
      '#include <iostream>\n\nint main() {\n  std::cout << "Hello, world!";\n}',
  },
];

type Submission = {
  status?: { id?: number; description?: string };
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  message?: string | null;
};

export default function ProblemPage() {
  const router = useRouter();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [languageId, setLanguageId] = useState(languages[0].id);
  const [sourceCode, setSourceCode] = useState(languages[0].starter);
  const [stdin, setStdin] = useState("");
  const [token, setToken] = useState("");
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/sign-in?redirect_url=/problem");
    }
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (
      !token ||
      !submission ||
      submission.status?.id === undefined ||
      submission.status.id > 2
    )
      return;

    const timer = window.setTimeout(async () => {
      try {
        const clerkToken = await getToken();
        const response = await fetch(`${API_URL}/api/submissions/${token}`, {
          headers: clerkToken
            ? { Authorization: `Bearer ${clerkToken}` }
            : undefined,
        });
        if (!response.ok) throw new Error("Không thể lấy trạng thái bài chạy.");
        setSubmission(await response.json());
      } catch (pollError) {
        setError(
          pollError instanceof Error ? pollError.message : "Đã có lỗi xảy ra.",
        );
      }
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [getToken, submission, token]);

  async function submitCode() {
    setIsSubmitting(true);
    setError("");
    setSubmission(null);
    setToken("");

    try {
      const clerkToken = await getToken();
      const response = await fetch(`${API_URL}/api/submissions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(clerkToken ? { Authorization: `Bearer ${clerkToken}` } : {}),
        },
        body: JSON.stringify({
          language_id: languageId,
          source_code: sourceCode,
          stdin,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.token) {
        const message = Array.isArray(result.message)
          ? result.message.join(", ")
          : result.message;
        throw new Error(message ?? "Không thể gửi code đến server.");
      }
      setToken(result.token);
      setSubmission({ status: { id: 1, description: "Đang chờ chạy" } });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Đã có lỗi xảy ra.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const selectedLanguage = languages.find(
    (language) => language.id === languageId,
  );
  const output =
    submission?.compile_output ??
    submission?.stderr ??
    submission?.message ??
    submission?.stdout ??
    "";
  const isRunning =
    submission?.status?.id !== undefined && submission.status.id <= 2;

  if (!isLoaded || !isSignedIn) {
    return (
      <main className="min-h-screen bg-[#f5f1e8] px-5 py-8 sm:px-10">
        <div className="mx-auto max-w-6xl animate-pulse">
          <div className="mb-8 h-12 w-72 bg-[#17211b]/10" />
          <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
            <div className="h-[60vh] bg-[#202a24]/15" />
            <div className="space-y-5">
              <div className="h-12 bg-[#17211b]/10" />
              <div className="h-28 bg-[#17211b]/10" />
              <div className="h-12 bg-[#d65a3a]/20" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f1e8] px-5 py-8 text-[#17211b] sm:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex items-end justify-between border-b border-[#17211b]/20 pb-5">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-[#d65a3a]">
              Coding Dev Lab
            </p>
            <h1 className="font-serif text-4xl tracking-tight sm:text-5xl">
              Run your idea.
            </h1>
          </div>
          <Link
            href="/"
            className="border border-[#17211b]/20 px-4 py-2 text-sm font-semibold transition hover:border-[#d65a3a] hover:text-[#d65a3a]"
          >
            ← Trang chủ
          </Link>
        </header>

        <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
          <section className="overflow-hidden rounded-sm border border-[#17211b]/15 bg-[#202a24] shadow-[8px_8px_0_#d65a3a]">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3 text-xs text-white/60">
              <span>
                main.
                {languageId === 71 ? "py" : languageId === 63 ? "js" : "cpp"}
              </span>
              <span>{selectedLanguage?.name}</span>
            </div>
            <CodeEditor
              code={sourceCode}
              language={selectedLanguage?.name.toLowerCase()}
              onChange={(value) => setSourceCode(value ?? "")}
            />
          </section>

          <aside className="space-y-5">
            <label className="block text-sm font-semibold">
              Language
              <select
                value={languageId}
                onChange={(event) => {
                  const id = Number(event.target.value);
                  setLanguageId(id);
                  setSourceCode(
                    languages.find((language) => language.id === id)?.starter ??
                      "",
                  );
                }}
                className="mt-2 w-full border border-[#17211b]/20 bg-white/60 px-3 py-3 outline-none focus:border-[#d65a3a]"
              >
                {languages.map((language) => (
                  <option key={language.id} value={language.id}>
                    {language.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold">
              Standard input
              <textarea
                value={stdin}
                onChange={(event) => setStdin(event.target.value)}
                placeholder="Input for your program..."
                className="mt-2 min-h-28 w-full resize-y border border-[#17211b]/20 bg-white/60 p-3 font-mono text-sm outline-none focus:border-[#d65a3a]"
              />
            </label>
            <button
              type="button"
              onClick={submitCode}
              disabled={isSubmitting || isRunning}
              className="w-full bg-[#d65a3a] px-4 py-3 font-bold text-white transition hover:bg-[#b9462b] disabled:cursor-wait disabled:opacity-50"
            >
              {isSubmitting || isRunning ? "Running..." : "Run code  →"}
            </button>
            {error && (
              <p
                role="alert"
                className="border-l-4 border-red-600 bg-red-50 p-3 text-sm text-red-800"
              >
                {error}
              </p>
            )}
          </aside>
        </div>

        <section className="mt-12 border-t border-[#17211b]/20 pt-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-serif text-2xl">Output</h2>
            {submission?.status?.description && (
              <span className="text-sm text-[#d65a3a]">
                {submission.status.description}
              </span>
            )}
          </div>
          <pre className="min-h-32 whitespace-pre-wrap border border-[#17211b]/15 bg-white/55 p-5 font-mono text-sm text-[#17211b]/80">
            {output ||
              (isRunning
                ? "Waiting for Judge0..."
                : "Run your code to see the output here.")}
          </pre>
        </section>
      </div>
    </main>
  );
}
