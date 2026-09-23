"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import useSWR from "swr";
import { authedFetcher } from "@/lib/swr";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  FileText,
  History,
  ListChecks,
  Loader2,
  Maximize2,
  Minimize2,
  Play,
  Plus,
  RotateCcw,
  Send,
  Terminal,
  X,
  XCircle,
} from "lucide-react";
import CodeEditor from "@/app/ui/Editor";
import Logo from "@/app/ui/Logo";
import type { Problem, ProblemTest } from "@/app/data/problems";
import { markSolved, useSolvedSlugs, useServerSolvedSlugs } from "../solved";
import { recordActivity } from "../activity";
import { topics } from "@/app/data/topics";
import { useProblem } from "@/app/hooks/useProblems";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Giới hạn CPU mỗi submission (giây) — code vòng lặp vô hạn sẽ bị
// Judge0 ngắt sau ngần này. BE kẹp cứng tối đa 5s nên gửi bao nhiêu
// cũng không chiếm worker được.
const CPU_TIME_LIMIT = 2;

// Chu kỳ poll batch (ms) — Judge0 chạy trên VM 1 OCPU/1GB nên poll
// thưa để nhẹ tải, kết quả live vẫn mượt vì test xong là hiện ngay.
const BATCH_POLL_INTERVAL_MS = 2000;

const LANGUAGES = [
  {
    id: 71,
    name: "Python 3",
    version: "3.10",
    short: "Py",
    tile: "from-sky-400 to-blue-600",
    starter: `print("Hello, GoCode!")`,
  },
  {
    id: 63,
    name: "JavaScript",
    version: "Node 22",
    short: "JS",
    tile: "from-amber-400 to-orange-600",
    starter: `console.log("Hello, GoCode!");`,
  },
  {
    id: 74,
    name: "TypeScript",
    version: "5.x",
    short: "TS",
    tile: "from-blue-500 to-indigo-700",
    starter: `console.log("Hello, GoCode!");`,
  },
  {
    id: 54,
    name: "C++ 17",
    version: "GCC",
    short: "C++",
    tile: "from-rose-400 to-red-600",
    starter: `#include <bits/stdc++.h>
using namespace std;
int main() {
    cout << "Hello, GoCode!";
    return 0;
}`,
  },
  {
    id: 68,
    name: "PHP",
    version: "8.x",
    short: "PHP",
    tile: "from-violet-400 to-purple-700",
    starter: `<?php
echo "Hello, GoCode!";`,
  },
  {
    id: 62,
    name: "Java",
    version: "JDK",
    short: "Ja",
    tile: "from-orange-400 to-red-600",
    starter: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, GoCode!");
    }
}`,
  },
  {
    id: 51,
    name: "C#",
    version: "Mono",
    short: "C#",
    tile: "from-purple-400 to-fuchsia-700",
    starter: `using System;
class Program {
    static void Main() {
        Console.WriteLine("Hello, GoCode!");
    }
}`,
  },
  {
    id: 60,
    name: "Go",
    version: "1.2x",
    short: "Go",
    tile: "from-cyan-400 to-sky-700",
    starter: `package main
import "fmt"
func main() {
    fmt.Println("Hello, GoCode!")
}`,
  },
];

type Submission = {
  status?: { id?: number; description?: string };
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  message?: string | null;
  time?: string | null;
  memory?: number | null;
  exit_code?: number | null;
  exit_signal?: number | null;
};

type TestResult = {
  index: number;
  stdin: string;
  expected: string;
  actual: string;
  passed: boolean;
  status: string;
  statusId: number | undefined;
  time?: string | null;
  memoryKb?: number | null;
};

const DIFFICULTY_STYLES: Record<string, string> = {
  Dễ: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Trung bình": "bg-amber-50 text-amber-700 border-amber-200",
  Khó: "bg-rose-50 text-rose-700 border-rose-200",
};

const STATUS_VN: Record<number, string> = {
  1: "Đang xếp hàng",
  2: "Đang chạy",
  3: "Chấp nhận",
  4: "Sai đáp án",
  5: "Quá thời gian",
  6: "Lỗi biên dịch",
  7: "Lỗi runtime (tràn bộ nhớ)",
  8: "Lỗi runtime (file quá lớn)",
  9: "Lỗi runtime (chia cho 0)",
  10: "Lỗi runtime (abort)",
  11: "Lỗi runtime (NZEC)",
  12: "Lỗi runtime",
  13: "Lỗi máy chấm",
  14: "Lỗi định dạng",
};

/** Gợi ý khắc phục theo từng loại lỗi Judge0, hiện cho người dùng. */
function statusHint(statusId: number | undefined): string | null {
  switch (statusId) {
    case 5:
      return "Gợi ý: chương trình chạy quá 2s giới hạn — kiểm tra vòng lặp vô hạn hoặc thuật toán quá chậm.";
    case 6:
      return "Gợi ý: kiểm tra cú pháp, dấu ngoặc, tên hàm main và phiên bản ngôn ngữ đang dùng.";
    case 7:
      return "Gợi ý: chương trình truy cập vùng nhớ không hợp lệ (thường do tràn mảng hoặc con trỏ sai).";
    case 9:
      return "Gợi ý: có thể chương trình đã chia cho 0.";
    case 11:
      return "Gợi ý: chương trình ném exception khi chạy — đọc kỹ phần stderr ở trên.";
    case 8:
    case 10:
    case 12:
      return "Gợi ý: chương trình dừng đột ngột khi chạy — kiểm tra truy cập mảng, đệ quy và phép chia.";
    case 13:
    case 14:
      return "Máy chấm gặp sự cố nội bộ — hãy bấm chạy lại sau ít phút.";
    default:
      return null;
  }
}

function formatRunMeta(
  time: string | null | undefined,
  memoryKb: number | null | undefined,
): string | null {
  const parts: string[] = [];
  if (time !== null && time !== undefined && time !== "") {
    parts.push(`${time}s`);
  }
  if (typeof memoryKb === "number") {
    parts.push(`${(memoryKb / 1024).toFixed(1)} MB`);
  }
  return parts.length > 0 ? parts.join(" • ") : null;
}

/** Dịch lỗi hạ tầng/BE thành câu dễ hiểu cho người dùng cuối. */
function toUserErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Đã có lỗi xảy ra.";
  if (
    /không thể kết nối tới judge0|bad gateway|failed to fetch|load failed|networkerror|http 502|http 504|http 503|quá thời gian chờ judge0/i.test(
      raw,
    )
  ) {
    return "Máy chấm đang bận hoặc không phản hồi. Thử chạy lại sau ít phút — code của bạn vẫn còn nguyên trong editor.";
  }
  return raw;
}

function normalizeOutput(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function rawOutputOf(submission: Submission): string {
  return (
    submission.compile_output ??
    submission.stderr ??
    submission.message ??
    submission.stdout ??
    ""
  );
}

/** Bóc message lỗi từ mọi hình dạng BE/Judge0 trả về (tránh "[object Object]"). */
function readErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload) return payload;
  if (Array.isArray(payload) && payload.length > 0) {
    return payload.map((item) => String(item)).join(", ");
  }
  if (payload && typeof payload === "object") {
    const nested = (payload as { message?: unknown }).message;
    if (typeof nested === "string" && nested) return nested;
    try {
      const text = JSON.stringify(payload);
      if (text && text !== "{}") return text;
    } catch {
      // bỏ qua, dùng fallback bên dưới
    }
  }
  return fallback;
}

/**
 * Chuẩn hoá stdin cho Judge0: nhiều chương trình đọc input theo dòng nên
 * cần newline ở cuối; thiếu nó một số bài có thể đọc thiếu dòng cuối.
 */
function normalizeStdin(input: string): string {
  if (input === "") return "";
  return input.endsWith("\n") ? input : `${input}\n`;
}

function isFinished(submission: Submission): boolean {
  return submission.status?.id === undefined || submission.status.id > 2;
}

/**
 * Tab ở nửa phải thì lăn hết về cuối phải, tab ở nửa trái thì lăn hết
 * về đầu trái — thay vì dừng lưng chừng như inline:"nearest".
 */
function snapTabsToEnd(
  container: HTMLDivElement | null,
  element: HTMLElement,
) {
  if (!container) return;
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const elementCenter = elementRect.left + elementRect.width / 2;
  const containerCenter = containerRect.left + containerRect.width / 2;
  container.scrollTo({
    left: elementCenter >= containerCenter ? container.scrollWidth : 0,
    behavior: "smooth",
  });
}

function toTestResult(
  test: ProblemTest,
  submission: Submission,
  index: number,
): TestResult {
  const actual = rawOutputOf(submission);
  return {
    index: index + 1,
    stdin: test.stdin,
    expected: test.expected,
    actual,
    passed:
      submission.status?.id === 3 &&
      normalizeOutput(actual) === normalizeOutput(test.expected),
    status:
      STATUS_VN[submission.status?.id ?? 0] ??
      submission.status?.description ??
      "Không rõ",
    statusId: submission.status?.id,
    time: submission.time ?? null,
    memoryKb: submission.memory ?? null,
  };
}

function StatusHint({ statusId }: { statusId: number | undefined }) {
  const hint = statusHint(statusId);
  if (!hint) return null;
  return (
    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700">
      {hint}
    </p>
  );
}

function RunMeta({
  time,
  memoryKb,
}: {
  time?: string | null;
  memoryKb?: number | null;
}) {
  const meta = formatRunMeta(time, memoryKb);
  if (!meta) return null;
  return (
    <span className="ml-auto font-mono text-[11px] font-normal tabular-nums text-zinc-400">
      {meta}
    </span>
  );
}

type AuthHeaders = {
  headers: Record<string, string>;
  bareHeaders: Record<string, string> | undefined;
};

export default function ProblemWorkspace() {
  const params = useParams();
  const slug = typeof params.slug === "string" ? params.slug : "";
  const { problem, loading, error } = useProblem(slug);

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-5 py-8 sm:px-10">
        <div className="mx-auto max-w-6xl animate-pulse">
          <div className="mb-8 h-12 w-72 rounded-lg bg-zinc-200" />
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="h-[60vh] rounded-2xl bg-zinc-100" />
            <div className="h-[60vh] rounded-2xl bg-zinc-100" />
          </div>
        </div>
      </main>
    );
  }

  if (error || !problem) {
    notFound();
  }

  // key theo slug: đổi bài là mount mới, mọi state (code, test, kết quả)
  // reset sạch thay vì kẹt state bài cũ.
  return <Workspace key={slug} slug={slug} problem={problem} />;
}

function Workspace({ slug, problem }: { slug: string; problem: Problem }) {
  const router = useRouter();
  const { getToken, isLoaded, isSignedIn } = useAuth();

  const [languageId, setLanguageId] = useState(LANGUAGES[0].id);
  const [sourceCode, setSourceCode] = useState(LANGUAGES[0].starter);
  const [error, setError] = useState("");
  const [runningTests, setRunningTests] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [customTests, setCustomTests] = useState<ProblemTest[]>(problem.tests);
  const [activeTest, setActiveTest] = useState(0);
  const [activeResult, setActiveResult] = useState(0);
  const resultTouchedRef = useRef(false);
  const stdinRef = useRef<HTMLTextAreaElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const resultTabsRef = useRef<HTMLDivElement>(null);
  const testCardRef = useRef<HTMLDivElement>(null);
  const prevTestCountRef = useRef(customTests.length);
  const [submitting, setSubmitting] = useState(false);
  const [submitVerdict, setSubmitVerdict] = useState<{
    passed: number;
    total: number;
    failedIndex: number | null;
  } | null>(null);
  const localSolved = useSolvedSlugs();
  const serverSolved = useServerSolvedSlugs();
  const solved =
    localSolved.includes(problem.slug) || serverSolved.includes(problem.slug);
  const [langOpen, setLangOpen] = useState(false);
  // focus full-ngang: "statement" ẩn cột editor, "editor" ẩn cột đề bài.
  const [focus, setFocus] = useState<"none" | "statement" | "editor">("none");
  const [leftTab, setLeftTab] = useState<"description" | "submissions">("description");
  type HistoryItem = { id: string; status: string | null; statusId: number | null; passed: boolean | null; passedCount: number | null; totalCount: number | null; languageId: number; sourceCode: string; createdAt: string };
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Thêm case mới thì lăn thanh tabs ngang tới cuối để lộ tab mới.
    if (customTests.length > prevTestCountRef.current) {
      tabsRef.current?.scrollTo({
        left: tabsRef.current.scrollWidth,
        behavior: "smooth",
      });
    }
    prevTestCountRef.current = customTests.length;
  }, [customTests.length]);

  useEffect(() => {
    if (!langOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLangOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [langOpen]);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace(`/sign-in?redirect_url=/problem/${slug}`);
    }
  }, [isLoaded, isSignedIn, router, slug]);

  const buildAuth = useCallback(async (): Promise<AuthHeaders> => {
    const clerkToken = await getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(clerkToken ? { Authorization: `Bearer ${clerkToken}` } : {}),
    };
    return {
      headers,
      bareHeaders: clerkToken
        ? { Authorization: `Bearer ${clerkToken}` }
        : undefined,
    };
  }, [getToken]);

  const submitBatch = useCallback(
    async (code: string, inputs: string[]): Promise<string[]> => {
      const { headers } = await buildAuth();
      const response = await fetch(`${API_URL}/api/submissions/batch`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          submissions: inputs.map((input) => ({
            language_id: languageId,
            source_code: code,
            stdin: normalizeStdin(input),
            cpu_time_limit: CPU_TIME_LIMIT,
          })),
        }),
      });
      const created = await response.json();
      if (
        !response.ok ||
        !Array.isArray(created) ||
        created.length !== inputs.length ||
        created.some((item) => !item?.token)
      ) {
        throw new Error(
          `${readErrorMessage(!Array.isArray(created) ? (created?.message ?? created) : undefined, "Không thể gửi batch đến server.")} (HTTP ${response.status})`,
        );
      }
      return created.map((item) => item.token as string);
    },
    [buildAuth, languageId],
  );

  const pollBatch = useCallback(
    async (
      tokens: string[],
      onProgress?: (list: Submission[]) => void,
    ): Promise<Submission[]> => {
      const { bareHeaders } = await buildAuth();
      const query = tokens.map(encodeURIComponent).join(",");
      const started = Date.now();
      for (;;) {
        if (Date.now() - started > 90_000) {
          throw new Error("Quá thời gian chờ Judge0 (90s).");
        }
        await new Promise((resolve) =>
          setTimeout(resolve, BATCH_POLL_INTERVAL_MS),
        );
        const poll = await fetch(
          `${API_URL}/api/submissions/batch?tokens=${query}`,
          { headers: bareHeaders },
        );
        if (!poll.ok)
          throw new Error(
            `Không thể lấy trạng thái bài chạy. (HTTP ${poll.status})`,
          );
        const body = (await poll.json()) as { submissions?: Submission[] };
        const list = body.submissions ?? [];
        onProgress?.(list);
        if (
          list.length === tokens.length &&
          list.every((item) => isFinished(item))
        ) {
          return list;
        }
      }
    },
    [buildAuth],
  );

  const historyFetcher = useMemo(() => authedFetcher(getToken), [getToken]);
  const historyKey = isSignedIn ? `${API_URL}/api/history?slug=${encodeURIComponent(slug)}` : null;
  const { mutate: mutateHistory } = useSWR<HistoryItem[]>(historyKey, historyFetcher, {
    onSuccess: (data) => {
      if (mountedRef.current) setHistory(Array.isArray(data) ? data : []);
    },
  });
  const fetchHistory = useCallback(() => {
    mutateHistory();
  }, [mutateHistory]);

  async function runSampleTests() {
    if (runningTests) return;
    if (customTests.length === 0) {
      setError("Hãy thêm ít nhất 1 test mẫu trước khi chạy.");
      return;
    }
    setError("");
    setResults(null);
    setSubmitVerdict(null);
    setActiveResult(0);
    resultTouchedRef.current = false;
    setRunningTests(true);
    setProgress({ done: 0, total: customTests.length });
    try {
      // Gửi toàn bộ test trong 1 batch thay vì từng request lẻ.
      const tokens = await submitBatch(
        sourceCode,
        customTests.map((test) => test.stdin),
      );
      if (!mountedRef.current) return;
      const submissions = await pollBatch(tokens, (list) => {
        if (!mountedRef.current) return;
        // Vẽ kết quả live: test nào xong trước hiện trước.
        const partial: TestResult[] = [];
        customTests.forEach((test, i) => {
          const sub = list[i];
          if (sub && isFinished(sub)) {
            partial.push(toTestResult(test, sub, i));
          }
        });
        setProgress({ done: partial.length, total: tokens.length });
        if (partial.length > 0) {
          setResults(partial);
          if (!resultTouchedRef.current) {
            setActiveResult(partial.length - 1);
          }
        }
      });
      if (!mountedRef.current) return;
      const collected = customTests.map((test, i) =>
        toTestResult(test, submissions[i] ?? {}, i),
      );
      if (!resultTouchedRef.current) {
        const firstFailed = collected.findIndex((r) => !r.passed);
        setActiveResult(firstFailed === -1 ? 0 : firstFailed);
      }
      setResults(collected);
      recordActivity(getToken);
    } catch (runError) {
      if (mountedRef.current) {
        setError(toUserErrorMessage(runError));
      }
    } finally {
      if (mountedRef.current) setRunningTests(false);
    }
  }

  async function submitSolution() {
    if (runningTests || submitting) return;
    setError("");
    setResults(null);
    setSubmitVerdict(null);
    setSubmitting(true);
    try {
      // Test ẩn lấy từ DB (BE), không lộ ra client
      const t = await getToken();
      const res = await fetch(`${API_URL}/api/problems/${encodeURIComponent(slug)}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(t ? { Authorization: `Bearer ${t}` } : {}),
        },
        body: JSON.stringify({ languageId, sourceCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Không thể nộp bài");
      if (!mountedRef.current) return;
      setSubmitVerdict({
        passed: data.passedCount,
        total: data.totalCount,
        failedIndex: data.failedIndex,
      });
      // BE đã lưu Submission (kể cả thất bại) và SolvedProblem nếu Accepted
      fetchHistory();
      if (data.passed) {
        markSolved(problem.slug);
        window.dispatchEvent(new Event("gocode-activity-changed"));
      }
      recordActivity(getToken);
    } catch (runError) {
      if (mountedRef.current) {
        setError(toUserErrorMessage(runError));
      }
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  }

  if (!isLoaded || !isSignedIn) {
    return (
      <main className="min-h-screen bg-white px-5 py-8 sm:px-10">
        <div className="mx-auto max-w-6xl animate-pulse">
          <div className="mb-8 h-12 w-72 rounded-lg bg-zinc-200" />
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="h-[60vh] rounded-2xl bg-zinc-100" />
            <div className="h-[60vh] rounded-2xl bg-zinc-100" />
          </div>
        </div>
      </main>
    );
  }

  const topicTitle =
    topics.find((topic) => topic.slug === problem.topic)?.title ??
    problem.topic;
  const selectedLanguage = LANGUAGES.find(
    (language) => language.id === languageId,
  );
  const passedCount = results?.filter((result) => result.passed).length ?? 0;
  const busy = runningTests || submitting;

  const selectedResult = results
    ? (results[Math.min(activeResult, results.length - 1)] ?? null)
    : null;

  const activeTestValue =
    customTests[Math.min(activeTest, Math.max(0, customTests.length - 1))] ?? {
      stdin: "",
      expected: "",
    };

  function addTest() {
    if (customTests.length >= 10) return;
    setCustomTests((tests) => [...tests, { stdin: "", expected: "" }]);
    setActiveTest(customTests.length);
  }

  function removeTest(index: number) {
    if (customTests.length <= 1) return;
    setCustomTests((tests) => tests.filter((_, k) => k !== index));
    setActiveTest((active) => {
      if (index < active) return active - 1;
      if (index === active) {
        return Math.max(0, Math.min(active, customTests.length - 2));
      }
      return active;
    });
  }

  function resetTests() {
    setCustomTests(problem.tests);
    setActiveTest(0);
  }

  function updateActiveTest(patch: Partial<ProblemTest>) {
    setCustomTests((tests) =>
      tests.map((test, k) => (k === activeTest ? { ...test, ...patch } : test)),
    );
  }

  const allPassed =
    results !== null &&
    results.length > 0 &&
    passedCount === results.length;
  const isEmptyResult =
    !results && !submitVerdict && !error && !runningTests && !submitting;
  let resultStatusText = "Chưa có kết quả";
  if (runningTests || submitting) {
    resultStatusText = `Đang chấm ${progress.done}/${progress.total}...`;
  } else if (results) {
    resultStatusText = allPassed ? "Accepted" : "Chưa đạt";
  } else if (submitVerdict) {
    resultStatusText =
      submitVerdict.failedIndex === null ? "Accepted" : "Chưa đạt";
  } else if (error) {
    resultStatusText = "Lỗi";
  }
  let casesStatus: "running" | "pass" | "fail" | "idle" = "idle";
  if (runningTests || submitting) {
    casesStatus = "running";
  } else if (results && results.length > 0) {
    casesStatus = results.every((r) => r.passed) ? "pass" : "fail";
  }

  function selectLanguage(id: number) {
    if (id === languageId) return;
    const language = LANGUAGES.find((lang) => lang.id === id);
    if (!language) return;
    setLanguageId(id);
    setSourceCode(language.starter);
    setResults(null);
    setSubmitVerdict(null);
  }

  return (
    <main className="min-h-screen bg-white px-5 py-8 text-zinc-900 sm:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Logo />
            <Link
              href="/problem"
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50"
            >
              ← Danh sách bài
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-zinc-800 transition"
            >
              <ArrowLeft className="size-4" />
              Trang chủ
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-zinc-950/[0.04] px-3 py-1 text-xs font-medium text-zinc-600">
              {topicTitle}
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-medium ${DIFFICULTY_STYLES[problem.difficulty] ?? "border-zinc-200 text-zinc-600"}`}
            >
              {problem.difficulty}
            </span>
          </div>
        </header>

        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950">
          {problem.title}
        </h1>
        {solved && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="size-4" />
            Bạn đã giải đúng bài này
          </p>
        )}

        <div
          className={
            focus === "none"
              ? "mt-6 grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
              : "mt-6 grid gap-5"
          }
        >
          <section
            className={`h-fit rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.05)] lg:sticky lg:top-6 ${
              focus === "editor" ? "hidden" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2 border-b border-zinc-200/80">
              <div className="flex gap-6">
                <button
                  type="button"
                  onClick={() => setLeftTab("description")}
                  className={`flex items-center gap-1.5 pb-3 text-sm font-medium border-b-2 ${leftTab === "description" ? "border-emerald-600 text-emerald-600" : "border-transparent text-zinc-500 hover:text-zinc-700"}`}
                >
                  <FileText className="size-4" /> Description
                </button>
                <button
                  type="button"
                  onClick={() => setLeftTab("submissions")}
                  className={`flex items-center gap-1.5 pb-3 text-sm font-medium border-b-2 ${leftTab === "submissions" ? "border-emerald-600 text-emerald-600" : "border-transparent text-zinc-500 hover:text-zinc-700"}`}
                >
                  <History className="size-4" /> Submissions ({history.length})
                </button>
              </div>
              <button
                type="button"
                onClick={() =>
                  setFocus(focus === "statement" ? "none" : "statement")
                }
                title={
                  focus === "statement"
                    ? "Thu nhỏ (hiện lại editor)"
                    : "Mở rộng đề bài full chiều ngang"
                }
                className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-950/[0.04] hover:text-zinc-900"
              >
                {focus === "statement" ? (
                  <Minimize2 className="size-4" />
                ) : (
                  <Maximize2 className="size-4" />
                )}
              </button>
            </div>
            {leftTab === "description" ? (
              <>
                <p className="mt-3 text-[15px] leading-relaxed text-zinc-700">
                  {problem.description}
                </p>

            <h3 className="mt-5 text-sm font-semibold text-zinc-900">
              Định dạng đầu vào
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">
              {problem.inputFormat}
            </p>

            <h3 className="mt-4 text-sm font-semibold text-zinc-900">
              Định dạng đầu ra
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">
              {problem.outputFormat}
            </p>

            <h3 className="mt-4 text-sm font-semibold text-zinc-900">
              Ràng buộc
            </h3>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 font-mono text-[13px] text-zinc-600">
              {problem.constraints.map((constraint) => (
                <li key={constraint}>{constraint}</li>
              ))}
            </ul>

            <h3 className="mt-5 text-sm font-semibold text-zinc-900">
              Ví dụ mẫu
            </h3>
            <div className="mt-2 space-y-3">
              {problem.examples.map((example, i) => (
                <div
                  key={i}
                  className="overflow-hidden rounded-xl border border-zinc-200/80"
                >
                  <p className="border-b border-zinc-200/70 bg-zinc-50 px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Ví dụ {i + 1}
                  </p>
                  <div className="grid sm:grid-cols-2">
                    <div className="px-4 py-3">
                      <p className="font-mono text-[11px] text-zinc-400">Input</p>
                      <pre className="mt-1 whitespace-pre-wrap font-mono text-[13px] text-zinc-800">
                        {example.input}
                      </pre>
                    </div>
                    <div className="border-t border-zinc-200/70 px-4 py-3 sm:border-l sm:border-t-0">
                      <p className="font-mono text-[11px] text-zinc-400">
                        Output
                      </p>
                      <pre className="mt-1 whitespace-pre-wrap font-mono text-[13px] text-zinc-800">
                        {example.output}
                      </pre>
                    </div>
                  </div>
                  {example.explanation && (
                    <p className="border-t border-zinc-200/70 bg-zinc-50/60 px-4 py-2.5 text-[13px] text-zinc-600">
                      {example.explanation}
                    </p>
                  )}
                </div>
              ))}
            </div>
              </>
            ) : (
              <div className="mt-3">
                {history.length === 0 ? (
                  <p className="py-8 text-center text-sm text-zinc-500">
                    Chưa có lần nộp nào — chạy test hoặc nộp bài để lưu lịch sử
                  </p>
                ) : (
                  <div className="space-y-2">
                    {history.map((h) => {
                      const lang = LANGUAGES.find((l) => l.id === h.languageId)?.name ?? String(h.languageId);
                      return (
                        <div
                          key={h.id}
                          className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 p-3"
                        >
                          <div>
                            <p className={`text-xs font-bold ${h.passed ? "text-emerald-600" : "text-rose-600"}`}>
                              {h.status ?? (h.passed ? "Accepted" : "Failed")} {h.passedCount ?? ""}/{h.totalCount ?? ""}
                            </p>
                            <p className="font-mono text-[11px] text-zinc-500">
                              {new Date(h.createdAt).toLocaleString("vi-VN")} • {lang}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSourceCode(h.sourceCode);
                              setLeftTab("description");
                            }}
                            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800"
                          >
                            Tải lại
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className={focus === "statement" ? "hidden" : "min-w-0"}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="relative w-fit max-w-full">
                <button
                  type="button"
                  onClick={() => setLangOpen((open) => !open)}
                  className="flex w-full items-center gap-2 rounded-xl border border-zinc-300 bg-white px-2 py-1 text-left shadow-sm transition hover:border-zinc-400"
                >
                  <span
                    className={`flex size-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br font-mono text-[10px] font-bold text-white ${selectedLanguage?.tile ?? ""}`}
                  >
                    {selectedLanguage?.short ?? "?"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-900">
                    {selectedLanguage?.name ?? "Chọn ngôn ngữ"}
                  </span>
                  <ChevronDown
                    className={`ml-auto size-3.5 shrink-0 text-zinc-400 transition-transform duration-300 ${
                      langOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {langOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-20 cursor-default"
                      onClick={() => setLangOpen(false)}
                    />
                    <div className="absolute left-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2.5rem)] rounded-xl border border-zinc-200 bg-white p-2 shadow-xl">
                      <div className="grid grid-cols-2 gap-1.5">
                        {LANGUAGES.map((language) => {
                          const active = language.id === languageId;
                          return (
                            <button
                              key={language.id}
                              type="button"
                              onClick={() => {
                                selectLanguage(language.id);
                                setLangOpen(false);
                              }}
                              className={`flex items-center gap-2 rounded-xl border px-2 py-1 text-left transition ${
                                active
                                  ? "border-emerald-300 bg-emerald-50/60"
                                  : "border-transparent hover:bg-zinc-50"
                              }`}
                            >
                              <span
                                className={`flex size-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br font-mono text-[10px] font-bold text-white ${language.tile}`}
                              >
                                {language.short}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-xs font-semibold text-zinc-900">
                                  {language.name}
                                </span>
                                <span className="block font-mono text-[10px] text-zinc-500">
                                  {language.version}
                                </span>
                              </span>
                              {active && (
                                <Check className="ml-auto size-4 shrink-0 text-emerald-500" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={runSampleTests}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-50"
              >
                {runningTests ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Play className="size-3.5" />
                )}
                {runningTests
                  ? `Đang chấm ${progress.done}/${progress.total}...`
                  : `Chạy ${customTests.length} test mẫu`}
              </button>
              <button
                type="button"
                onClick={submitSolution}
                disabled={busy}
                title="Chấm trên test ẩn, đúng hết mới Accepted"
                className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-amber-400 disabled:cursor-wait disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Send className="size-3.5" />
                )}
                {submitting ? "Đang chấm..." : "Nộp bài"}
              </button>
              <button
                type="button"
                onClick={() => setFocus(focus === "editor" ? "none" : "editor")}
                title={
                  focus === "editor"
                    ? "Thu nhỏ (hiện lại đề bài)"
                    : "Mở rộng editor full chiều ngang"
                }
                className="inline-flex items-center rounded-xl border border-zinc-300 bg-white px-2.5 py-2.5 text-zinc-500 shadow-sm transition hover:border-zinc-400 hover:text-zinc-900"
              >
                {focus === "editor" ? (
                  <Minimize2 className="size-4" />
                ) : (
                  <Maximize2 className="size-4" />
                )}
              </button>
            </div>
            <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl shadow-zinc-950/10">
              <CodeEditor
                code={sourceCode}
                language={selectedLanguage?.name.toLowerCase()}
                onChange={(value) => setSourceCode(value ?? "")}
                onRun={runSampleTests}
              />
            </div>

            <div className="mt-4 grid items-start gap-4 xl:grid-cols-2">
            <div ref={testCardRef} className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-zinc-900">
                  {casesStatus === "running" ? (
                    <Loader2 className="size-4 animate-spin text-zinc-400" />
                  ) : casesStatus === "pass" ? (
                    <CheckCircle2 className="size-4 text-emerald-500" />
                  ) : casesStatus === "fail" ? (
                    <XCircle className="size-4 text-rose-500" />
                  ) : (
                    <ListChecks className="size-4 text-zinc-400" />
                  )}
                  Testcase
                </span>
                <button
                  type="button"
                  onClick={resetTests}
                  title="Khôi phục bộ test gốc"
                  className="inline-flex shrink-0 items-center gap-1 px-1 py-1 font-mono text-xs text-zinc-400 transition hover:text-zinc-800"
                >
                  <RotateCcw className="size-3.5" />
                  Mặc định
                </button>
              </div>
              <div ref={tabsRef} className="mt-2 flex min-w-0 items-center gap-0.5 overflow-x-auto py-0.5">
                  {customTests.map((test, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={(event) => {
                        setActiveTest(i);
                        snapTabsToEnd(tabsRef.current, event.currentTarget);
                      }}
                      className={`group inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-xs transition ${
                        i === activeTest
                          ? "bg-zinc-950/[0.07] font-semibold text-zinc-900"
                          : "text-zinc-500 hover:bg-zinc-950/[0.04] hover:text-zinc-900"
                      }`}
                    >
                      Case {i + 1}
                      {customTests.length > 1 && (
                        <span
                          title="Xóa case này"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeTest(i);
                          }}
                          className={`cursor-pointer text-zinc-300 transition hover:text-rose-500 ${
                            i === activeTest
                              ? "opacity-100"
                              : "opacity-0 group-hover:opacity-100"
                          }`}
                        >
                          <X className="size-3" />
                        </span>
                      )}
                    </button>
                  ))}
                  {customTests.length < 10 && (
                    <button
                      type="button"
                      onClick={addTest}
                      title="Thêm test mới (tối đa 10)"
                      className="inline-flex shrink-0 items-center rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-950/[0.04] hover:text-zinc-900"
                    >
                      <Plus className="size-4" />
                    </button>
                  )}
                </div>

              <div className="my-3 border-t-2 border-zinc-900" />

              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-xs text-zinc-400">
                  {"// Dữ liệu đầu vào (Input):"}
                </p>
                <button
                  type="button"
                  onClick={() => stdinRef.current?.focus()}
                  className="font-mono text-xs text-zinc-400 transition hover:text-zinc-700"
                >
                  Tùy chỉnh giá trị
                </button>
              </div>
              <textarea
                ref={stdinRef}
                value={activeTestValue.stdin}
                onChange={(event) =>
                  updateActiveTest({ stdin: event.target.value })
                }
                onFocus={() =>
                  testCardRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                  })
                }
                rows={6}
                spellCheck={false}
                placeholder="Nhập stdin, mỗi dòng một giá trị..."
                className="mt-2 w-full resize-y rounded-xl border border-zinc-300 bg-white p-3 font-mono text-[13px] leading-relaxed outline-none transition placeholder:text-zinc-300 focus:border-blue-500"
              />
              <p className="mt-3 font-mono text-xs text-zinc-400">
                {"// Kết quả kỳ vọng (Expected):"}
              </p>
              <textarea
                value={activeTestValue.expected}
                onChange={(event) =>
                  updateActiveTest({ expected: event.target.value })
                }
                onFocus={() =>
                  testCardRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                  })
                }
                rows={3}
                spellCheck={false}
                placeholder="Output mong đợi..."
                className="mt-2 w-full resize-y rounded-xl border border-zinc-300 bg-white p-3 font-mono text-[13px] leading-relaxed outline-none transition placeholder:text-zinc-300 focus:border-blue-500"
              />
            </div>
            <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
              <div className="flex items-baseline gap-2 border-b-2 border-zinc-900 px-4 py-3">
                <span className="font-mono text-[13px] font-semibold text-zinc-900">
                  Kết quả:
                </span>
                <span className="font-mono text-xs text-zinc-400">
                  {resultStatusText}
                </span>
              </div>
              <div className="space-y-4 p-4">
              {isEmptyResult && (
                <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-zinc-200/80 px-6 py-10 text-center">
                  <Terminal className="size-7 text-zinc-300" />
                  <p className="text-sm font-semibold text-zinc-700">
                    Chưa có kết quả chạy
                  </p>
                  <p className="max-w-xs text-xs leading-relaxed text-zinc-400">
                    Bấm “Chạy Test” để nộp code và kiểm tra kết quả tức thì.
                  </p>
                  <button
                    type="button"
                    onClick={runSampleTests}
                    disabled={busy || customTests.length === 0}
                    className="mt-2 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Play className="size-4" />
                    Chạy Test ngay
                  </button>
                </div>
              )}
            {submitVerdict && (
              <div
                className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold ${
                  submitVerdict.failedIndex === null
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-rose-200 bg-rose-50 text-rose-700"
                }`}
              >
                {submitVerdict.failedIndex === null ? (
                  <CheckCircle2 className="size-4 shrink-0" />
                ) : (
                  <XCircle className="size-4 shrink-0" />
                )}
                {submitVerdict.failedIndex === null
                  ? `Accepted! Đúng ${submitVerdict.passed}/${submitVerdict.total} test ẩn — đã lưu tiến độ.`
                  : `Sai ở test ẩn #${submitVerdict.failedIndex} (đúng ${submitVerdict.passed}/${submitVerdict.total}). Kiểm tra lại các trường hợp biên nhé.`}
              </div>
            )}

            {error && (
              <p
                role="alert"
                className="rounded-xl border-l-4 border-red-600 bg-red-50 p-3 text-sm text-red-800"
              >
                {error}
              </p>
            )}

            {results && (
              <>
                <div ref={resultTabsRef} className="flex items-center gap-0.5 overflow-x-auto">
                  {results.map((result, i) => (
                    <button
                      key={result.index}
                      type="button"
                      onClick={(event) => {
                        resultTouchedRef.current = true;
                        setActiveResult(i);
                        snapTabsToEnd(resultTabsRef.current, event.currentTarget);
                      }}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-xs transition ${
                        i === activeResult
                          ? "bg-zinc-950/[0.07] font-semibold text-zinc-900"
                          : "text-zinc-500 hover:bg-zinc-950/[0.04] hover:text-zinc-900"
                      }`}
                    >
                      {result.passed ? (
                        <CheckCircle2 className="size-3.5 text-emerald-500" />
                      ) : (
                        <XCircle className="size-3.5 text-rose-500" />
                      )}
                      Case {result.index}
                    </button>
                  ))}
                </div>
                {selectedResult && (
                  <div className="rounded-xl border border-zinc-200/80 p-3">
                    <p className="flex items-center gap-2 text-[13px] font-semibold text-zinc-900">
                      {selectedResult.passed ? (
                        <CheckCircle2 className="size-4 text-emerald-500" />
                      ) : (
                        <XCircle className="size-4 text-rose-500" />
                      )}
                      <span className="font-mono text-[11px] font-normal text-zinc-400">
                        {selectedResult.status}
                      </span>
                      <RunMeta
                        time={selectedResult.time}
                        memoryKb={selectedResult.memoryKb}
                      />
                    </p>
                    {selectedResult.passed ? (
                      <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-emerald-50 p-2 font-mono text-xs text-emerald-700">
                        {selectedResult.actual || "(trống)"}
                      </pre>
                    ) : (
                      <>
                        <div className="mt-2 grid gap-2">
                          <div>
                            <p className="font-mono text-[11px] text-zinc-400">
                              Input
                            </p>
                            <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-zinc-50 p-2 font-mono text-xs text-zinc-700">
                              {selectedResult.stdin}
                            </pre>
                          </div>
                          <div>
                            <p className="font-mono text-[11px] text-zinc-400">
                              Kỳ vọng
                            </p>
                            <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-zinc-50 p-2 font-mono text-xs text-zinc-700">
                              {selectedResult.expected}
                            </pre>
                          </div>
                          <div>
                            <p className="font-mono text-[11px] text-zinc-400">
                              Nhận được
                            </p>
                            <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-rose-50 p-2 font-mono text-xs text-rose-700">
                              {selectedResult.actual || "(trống)"}
                            </pre>
                          </div>
                        </div>
                        <StatusHint statusId={selectedResult.statusId} />
                      </>
                    )}
                  </div>
                )}
              </>
            )}
              </div>
            </div>
          </div>
          </section>
        </div>
      </div>
    </main>
  );
}
