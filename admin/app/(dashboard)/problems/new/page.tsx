"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminFetch } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, TestTube, EyeOff, Code2, Clock, ShieldCheck, Hash } from "lucide-react";

const LANGUAGES = [
  { id: "71", label: "Python 3", short: "PY", color: "from-sky-500 to-blue-600" },
  { id: "63", label: "JavaScript", short: "JS", color: "from-amber-400 to-orange-500" },
  { id: "74", label: "TypeScript", short: "TS", color: "from-blue-500 to-indigo-600" },
  { id: "54", label: "C++ 17", short: "C++", color: "from-rose-500 to-red-600" },
  { id: "62", label: "Java", short: "JV", color: "from-orange-500 to-red-500" },
  { id: "51", label: "C#", short: "CS", color: "from-violet-500 to-purple-600" },
  { id: "60", label: "Go", short: "GO", color: "from-cyan-500 to-teal-600" },
  { id: "68", label: "PHP", short: "PHP", color: "from-indigo-400 to-violet-600" },
];

type TestRow = { input: string; output: string };

function makeTests(n: number): TestRow[] {
  return Array.from({ length: n }, () => ({ input: "", output: "" }));
}

export default function NewProblemPage() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] = useState("Dễ");
  const [status, setStatus] = useState("draft");
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [inputFormat, setInputFormat] = useState("");
  const [outputFormat, setOutputFormat] = useState("");
  const [constraints, setConstraints] = useState<string[]>([""]);
  const [examples, setExamples] = useState<{ input: string; output: string; explanation?: string }[]>([{ input: "", output: "" }]);
  const [tests, setTests] = useState<TestRow[]>(makeTests(3));
  const [hiddenTests, setHiddenTests] = useState<TestRow[]>(makeTests(10));
  const [starterCodes, setStarterCodes] = useState<Record<string, string>>({});
  const [timeLimit, setTimeLimit] = useState(1000);
  const [memoryLimit, setMemoryLimit] = useState(256000);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const slugRegex = /^[a-z0-9-]+$/;

  const updateTest = (arr: TestRow[], setArr: (v: TestRow[]) => void, idx: number, field: keyof TestRow, value: string) => {
    const copy = [...arr];
    copy[idx] = { ...copy[idx], [field]: value };
    setArr(copy);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!slugRegex.test(slug)) {
      setError("Slug phải khớp /^[a-z0-9-]+$/ (chỉ chữ thường, số, dấu -)");
      return;
    }
    if (!title.trim() || !topic.trim() || !description.trim()) {
      setError("Title, topic và description là bắt buộc");
      return;
    }
    if (tests.length !== 3) {
      setError("Cần đúng 3 test visible");
      return;
    }
    if (hiddenTests.length !== 10) {
      setError("Cần đúng 10 hidden test");
      return;
    }
    for (let i = 0; i < tests.length; i++) {
      if (!tests[i].input.trim()) {
        setError(`Visible test #${i + 1}: input (stdin) không được rỗng — output (expected) được phép rỗng`);
        setTimeout(() => document.getElementById("form-error-top")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
        return;
      }
    }
    for (let i = 0; i < hiddenTests.length; i++) {
      if (!hiddenTests[i].input.trim()) {
        setError(`Hidden test #${i + 1}: input (stdin) không được rỗng — output (expected) được phép rỗng`);
        setTimeout(() => document.getElementById("form-error-top")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
        return;
      }
    }
    if (!inputFormat.trim() || !outputFormat.trim()) {
      setError("InputFormat và OutputFormat là bắt buộc");
      return;
    }
    const cleanConstraints = constraints.map((c) => c.trim()).filter(Boolean);
    if (cleanConstraints.length === 0) {
      setError("Cần ít nhất 1 constraint");
      return;
    }
    const cleanExamples = examples.filter((ex) => ex.input.trim() && ex.output.trim());
    if (cleanExamples.length === 0) {
      setError("Cần ít nhất 1 example");
      return;
    }

    const payload: Record<string, unknown> = {
      slug: slug.trim(),
      title: title.trim(),
      difficulty,
      status,
      topic: topic.trim(),
      description: description.trim(),
      inputFormat: inputFormat.trim(),
      outputFormat: outputFormat.trim(),
      constraints: cleanConstraints,
      examples: cleanExamples,
      tests,
      hiddenTests,
      starterCodes,
      timeLimit: Number(timeLimit),
      memoryLimit: Number(memoryLimit),
    };

    setSubmitting(true);
    try {
      const res = await adminFetch("/api/admin/problems", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg = data?.message;
        const text = Array.isArray(msg) ? msg.join(", ") : msg || `Failed: ${res.status}`;
        throw new Error(text);
      }
      router.push("/problems");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  const visibleDone = tests.filter((t) => t.input.trim()).length;
  const hiddenDone = hiddenTests.filter((t) => t.input.trim()).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10 font-sans">
      <div>
        <h1 className="font-display text-[32px] font-bold leading-tight text-slate-900">Tạo bài tập</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          Điền đầy đủ các thành phần của đề bài
          <span className="rounded bg-emerald-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.5px] text-emerald-700">{visibleDone}/3 visible</span>
          <span className="rounded bg-yellow-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.5px] text-yellow-700">{hiddenDone}/10 hidden</span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div id="form-error-top" className="rounded-lg border-2 border-red-500 bg-white px-3.5 py-2.5 text-sm text-red-600">{error}</div>
        )}

        <Card className="border-slate-200 bg-white">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-lg bg-slate-900 text-white">
                <Hash className="size-4" />
              </div>
              <div>
                <CardTitle className="font-display text-xl font-semibold text-slate-900">Thông tin cơ bản</CardTitle>
                <CardDescription className="text-sm text-slate-500">Slug, tiêu đề, độ khó và chủ đề</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-900">Slug *</Label>
              <Input value={slug} onChange={(ev) => setSlug(ev.target.value)} placeholder="vd: two-sum" className="h-[42px] font-mono border-slate-200 placeholder:text-slate-400 focus-visible:border-slate-900 focus-visible:ring-[3px] focus-visible:ring-slate-900/10" required />
              <p className="text-xs text-slate-500">/^[a-z0-9-]+$/ — dùng làm URL</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-900">Difficulty *</Label>
              <Select value={difficulty} onValueChange={(v) => { if (v) setDifficulty(v); }}>
                <SelectTrigger className="h-[42px] border-slate-200 bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Dễ">Dễ</SelectItem>
                  <SelectItem value="Trung bình">Trung bình</SelectItem>
                  <SelectItem value="Khó">Khó</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-900">Trạng thái *</Label>
              <Select value={status} onValueChange={(v) => { if (v) setStatus(v); }}>
                <SelectTrigger className="h-[42px] border-slate-200 bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Nháp — chưa xuất bản</SelectItem>
                  <SelectItem value="pending">Chờ duyệt</SelectItem>
                  <SelectItem value="published">Xuất bản ngay</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-900">Title *</Label>
              <Input value={title} onChange={(ev) => setTitle(ev.target.value)} placeholder="Two Sum" className="h-[42px] border-slate-200 focus-visible:border-slate-900 focus-visible:ring-[3px] focus-visible:ring-slate-900/10" required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-900">Topic *</Label>
              <Input value={topic} onChange={(ev) => setTopic(ev.target.value)} placeholder="vd: Array, DP, Graph..." className="h-[42px] border-slate-200 placeholder:text-slate-400" required />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-lg bg-slate-900 text-white">
                <FileText className="size-4" />
              </div>
              <div>
                <CardTitle className="font-display text-xl font-semibold text-slate-900">Đề bài chi tiết</CardTitle>
                <CardDescription className="text-sm text-slate-500">Mô tả, format, ràng buộc và ví dụ</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-900">Description *</Label>
              <Textarea value={description} onChange={(ev) => setDescription(ev.target.value)} rows={6} placeholder="Mô tả chi tiết bài toán, có thể dùng markdown..." className="min-h-[140px] border-slate-200 placeholder:text-slate-400" required />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-900">Input Format *</Label>
                <Textarea value={inputFormat} onChange={(ev) => setInputFormat(ev.target.value)} rows={3} placeholder="Dòng đầu n, dòng sau mảng a..." className="border-slate-200 placeholder:text-slate-400" required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-900">Output Format *</Label>
                <Textarea value={outputFormat} onChange={(ev) => setOutputFormat(ev.target.value)} rows={3} placeholder="In ra một số nguyên..." className="border-slate-200 placeholder:text-slate-400" required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-900">Constraints *</Label>
              <div className="space-y-2">
                {constraints.map((c, i) => (
                  <div key={i} className="flex gap-2">
                    <Input value={c} onChange={(ev) => { const copy = [...constraints]; copy[i] = ev.target.value; setConstraints(copy); }} placeholder={`1 ≤ n ≤ 10^5`} className="h-[42px] flex-1 border-slate-200" />
                    <Button type="button" variant="outline" size="sm" onClick={() => setConstraints(constraints.filter((_, idx) => idx !== i))} disabled={constraints.length <= 1} className="h-[42px]">Xóa</Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setConstraints([...constraints, ""])} className="border-slate-200">+ Thêm ràng buộc</Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-900">Examples *</Label>
              <div className="space-y-3">
                {examples.map((ex, i) => (
                  <div key={i} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
                    <Input value={ex.input} onChange={(ev) => { const copy = [...examples]; copy[i] = { ...copy[i], input: ev.target.value }; setExamples(copy); }} placeholder="Input" className="h-[42px] bg-white" />
                    <Input value={ex.output} onChange={(ev) => { const copy = [...examples]; copy[i] = { ...copy[i], output: ev.target.value }; setExamples(copy); }} placeholder="Output" className="h-[42px] bg-white" />
                    <Input value={ex.explanation ?? ""} onChange={(ev) => { const copy = [...examples]; copy[i] = { ...copy[i], explanation: ev.target.value }; setExamples(copy); }} placeholder="Giải thích (optional)" className="h-[42px] col-span-2 bg-white" />
                    <Button type="button" variant="ghost" size="sm" onClick={() => setExamples(examples.filter((_, idx) => idx !== i))} disabled={examples.length <= 1} className="col-span-2 justify-start text-red-600 hover:text-red-700 hover:bg-red-500/10 h-8">Xóa example</Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setExamples([...examples, { input: "", output: "" }])} className="border-slate-200">+ Thêm example</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
                  <TestTube className="size-4" />
                </div>
                <div>
                  <CardTitle className="font-display text-xl font-semibold text-slate-900">Visible Tests <span className="font-mono text-emerald-700">3 bắt buộc</span></CardTitle>
                  <CardDescription className="text-sm text-slate-500">Hiện cho người làm bài — chấm mẫu</CardDescription>
                </div>
              </div>
              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">{visibleDone}/3</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {tests.map((t, i) => (
              <div key={i} className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-900">Input (stdin) #{i + 1} *</Label>
                  <Textarea value={t.input} onChange={(ev) => updateTest(tests, setTests, i, "input", ev.target.value)} rows={2} placeholder="vd: 3&#10;1 2 3" className="font-mono border-slate-200 bg-slate-50" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-900">Output (expected) #{i + 1} <span className="font-normal text-slate-500">— có thể để trống</span></Label>
                  <Textarea value={t.output} onChange={(ev) => updateTest(tests, setTests, i, "output", ev.target.value)} rows={2} placeholder="vd: 6 (để trống nếu không có output)" className="font-mono border-slate-200 bg-slate-50" />
                </div>
              </div>
            ))}
            <p className="text-xs text-slate-500">Đúng 3 test — input bắt buộc, output được phép rỗng.</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-lg bg-slate-900 text-white">
                  <EyeOff className="size-4" />
                </div>
                <div>
                  <CardTitle className="font-display text-xl font-semibold text-slate-900">Hidden Tests <span className="font-mono text-slate-500">10 bắt buộc</span></CardTitle>
                  <CardDescription className="text-sm text-slate-500">Chấm kín — không hiện cho user</CardDescription>
                </div>
              </div>
              <Badge variant="secondary" className="bg-slate-100 text-slate-900 hover:bg-slate-100">{hiddenDone}/10</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {hiddenTests.map((t, i) => (
                <div key={i} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-[0.5px] text-slate-500">Hidden #{i + 1}</p>
                  <div className="space-y-2">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-slate-900">Input (stdin) *</Label>
                      <Textarea value={t.input} onChange={(ev) => updateTest(hiddenTests, setHiddenTests, i, "input", ev.target.value)} rows={2} placeholder="stdin — bắt buộc" className="font-mono border-slate-200 bg-white placeholder:text-slate-400" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-slate-900">Output (expected) <span className="font-normal text-slate-500">— có thể để trống</span></Label>
                      <Textarea value={t.output} onChange={(ev) => updateTest(hiddenTests, setHiddenTests, i, "output", ev.target.value)} rows={2} placeholder="expected — để trống nếu không có output" className="font-mono border-slate-200 bg-white placeholder:text-slate-400" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500">Đúng 10 test — input bắt buộc, output được phép rỗng.</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-lg bg-slate-900 text-white">
                <Code2 className="size-4" />
              </div>
              <div>
                <CardTitle className="font-display text-xl font-semibold text-slate-900">Starter Codes</CardTitle>
                <CardDescription className="text-sm text-slate-500">Gợi ý ban đầu cho 8 ngôn ngữ — có thể để trống</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {LANGUAGES.map((lang) => (
              <div key={lang.id} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="inline-flex size-6 items-center justify-center rounded bg-slate-900 font-mono text-[10px] font-bold text-white">{lang.short}</span>
                  <Label className="text-sm font-medium text-slate-900">{lang.label}</Label>
                </div>
                <Textarea
                  value={starterCodes[lang.id] ?? ""}
                  onChange={(ev) => setStarterCodes((prev) => ({ ...prev, [lang.id]: ev.target.value }))}
                  rows={3}
                  placeholder={`// Starter for ${lang.label}`}
                  className="font-mono text-xs border-slate-200 bg-slate-50 placeholder:text-slate-400"
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-lg bg-slate-900 text-white">
                <Clock className="size-4" />
              </div>
              <CardTitle className="font-display text-xl font-semibold text-slate-900">Giới hạn</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-900">Time limit (ms)</Label>
              <Input type="number" value={timeLimit} onChange={(ev) => setTimeLimit(Number(ev.target.value))} className="h-[42px] border-slate-200 font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-900">Memory limit (KB)</Label>
              <Input type="number" value={memoryLimit} onChange={(ev) => setMemoryLimit(Number(ev.target.value))} className="h-[42px] border-slate-200 font-mono" />
            </div>
          </CardContent>
        </Card>

        {error && (
          <div id="form-error-bottom" className="rounded-lg border-2 border-red-500 bg-white px-3.5 py-2.5 text-sm text-red-600">{error}</div>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={submitting} className="h-[42px] flex-1 bg-slate-900 text-sm font-semibold text-white hover:bg-slate-950 disabled:opacity-40 sm:flex-none sm:px-7">
            {submitting ? "Đang tạo..." : "Tạo Problem"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push("/problems")} className="h-[42px] border-slate-900 bg-transparent px-[22px] text-sm font-semibold text-slate-900 hover:bg-slate-900/5">
            Hủy
          </Button>
          <div className="ml-auto hidden items-center gap-2 text-xs text-slate-500 sm:flex">
            <ShieldCheck className="size-4 text-emerald-600" /> Input bắt buộc, output được phép rỗng
          </div>
        </div>
      </form>
    </div>
  );
}
