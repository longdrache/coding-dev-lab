"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { adminFetch } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sparkles, FileText, TestTube, EyeOff, Code2, Clock, ShieldCheck, Hash } from "lucide-react";

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

function toInputOutput(t: any): TestRow {
  if (t?.stdin !== undefined) return { input: t.stdin, output: t.expected ?? "" };
  return { input: t?.input ?? "", output: t?.output ?? "" };
}

export default function EditProblemPage() {
  const params = useParams<{ slug: string }>();
  const slugParam = params.slug;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] = useState("Dễ");
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [inputFormat, setInputFormat] = useState("");
  const [outputFormat, setOutputFormat] = useState("");
  const [constraints, setConstraints] = useState<string[]>([""]);
  const [examples, setExamples] = useState<{ input: string; output: string; explanation?: string }[]>([{ input: "", output: "" }]);
  const [tests, setTests] = useState<TestRow[]>(Array.from({ length: 3 }, () => ({ input: "", output: "" })));
  const [hiddenTests, setHiddenTests] = useState<TestRow[]>(Array.from({ length: 10 }, () => ({ input: "", output: "" })));
  const [starterCodes, setStarterCodes] = useState<Record<string, string>>({});
  const [timeLimit, setTimeLimit] = useState(1000);
  const [memoryLimit, setMemoryLimit] = useState(256000);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await adminFetch(`/api/admin/problems/${encodeURIComponent(slugParam)}`);
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const p: any = await res.json();
        if (cancelled) return;
        setSlug(p.slug ?? "");
        setTitle(p.title ?? "");
        setDifficulty(p.difficulty ?? "Dễ");
        setTopic(p.topic ?? "");
        setDescription(p.description ?? "");
        setInputFormat(p.inputFormat ?? "");
        setOutputFormat(p.outputFormat ?? "");
        setConstraints(Array.isArray(p.constraints) && p.constraints.length ? p.constraints : [""]);
        setExamples(Array.isArray(p.examples) && p.examples.length ? p.examples : [{ input: "", output: "" }]);
        const t = Array.isArray(p.tests) ? p.tests.map(toInputOutput) : [];
        setTests(t.length === 3 ? t : Array.from({ length: 3 }, (_, i) => t[i] ?? { input: "", output: "" }));
        const ht = Array.isArray(p.hiddenTests) ? p.hiddenTests.map(toInputOutput) : [];
        setHiddenTests(ht.length === 10 ? ht : Array.from({ length: 10 }, (_, i) => ht[i] ?? { input: "", output: "" }));
        setStarterCodes(p.starterCodes ?? {});
        setTimeLimit(p.timeLimit ?? 1000);
        setMemoryLimit(p.memoryLimit ?? 256000);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slugParam]);

  const updateTest = (arr: TestRow[], setArr: (v: TestRow[]) => void, idx: number, field: keyof TestRow, value: string) => {
    const copy = [...arr];
    copy[idx] = { ...copy[idx], [field]: value };
    setArr(copy);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^[a-z0-9-]+$/.test(slug)) { setError("Slug must match /^[a-z0-9-]+$/"); return; }
    if (!title.trim() || !topic.trim() || !description.trim()) { setError("Title, topic và description là bắt buộc"); return; }
    if (tests.length !== 3) { setError(`Cần đúng 3 visible test (đang có ${tests.length}/3)`); document.getElementById("form-error-top")?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    if (hiddenTests.length !== 10) { setError(`Cần đúng 10 hidden test (đang có ${hiddenTests.length}/10)`); document.getElementById("form-error-top")?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    for (let i = 0; i < 3; i++) if (!tests[i].input.trim()) { setError(`Visible test #${i+1}: input (stdin) không được rỗng — output được phép rỗng`); document.getElementById("form-error-top")?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    for (let i = 0; i < 10; i++) if (!hiddenTests[i].input.trim()) { setError(`Hidden test #${i+1}: input (stdin) không được rỗng — output được phép rỗng`); document.getElementById("form-error-top")?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    const cleanConstraints = constraints.map((c) => c.trim()).filter(Boolean);
    if (cleanConstraints.length === 0) { setError("Cần ít nhất 1 constraint"); return; }
    const cleanExamples = examples.filter((ex) => ex.input.trim() && ex.output.trim());
    if (cleanExamples.length === 0) { setError("Cần ít nhất 1 example"); return; }

    const payload: Record<string, unknown> = {
      slug: slug.trim(),
      title: title.trim(),
      difficulty,
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
      const res = await adminFetch(`/api/admin/problems/${encodeURIComponent(slugParam)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg = data?.message;
        throw new Error(Array.isArray(msg) ? msg.join(", ") : msg || `Failed: ${res.status}`);
      }
      router.push("/problems");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Update failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="mx-auto max-w-5xl p-6 text-sm font-medium text-zinc-600">Loading...</div>;
  if (error && !slug) return <div className="mx-auto max-w-5xl p-6"><p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p></div>;

  const visibleDone = tests.filter((t) => t.input.trim()).length;
  const hiddenDone = hiddenTests.filter((t) => t.input.trim()).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-950 via-zinc-900 to-black p-6 text-white shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(600px_circle_at_0%_0%,rgba(255,255,255,0.08),transparent_50%)]" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
              <Sparkles className="size-3.5 text-amber-300" /> Chỉnh sửa bài tập
            </div>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">Edit: {slugParam}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-white/20 bg-white/10 text-white">{visibleDone}/3 visible</Badge>
            <Badge variant="outline" className="border-white/20 bg-white/10 text-white">{hiddenDone}/10 hidden</Badge>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <div id="form-error-top" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}

        <Card className="border-zinc-200 bg-white shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-zinc-950 text-white"><Hash className="size-4" /></div>
              <div><CardTitle className="text-base font-bold tracking-tight text-zinc-950">Thông tin cơ bản</CardTitle></div>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-2"><Label className="font-semibold text-zinc-900">Slug *</Label><Input value={slug} onChange={(ev) => setSlug(ev.target.value)} className="font-mono border-zinc-300" required /></div>
            <div className="space-y-2"><Label className="font-semibold text-zinc-900">Difficulty *</Label>
              <Select value={difficulty} onValueChange={(v) => { if (v) setDifficulty(v); }}><SelectTrigger className="border-zinc-300 bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Dễ">Dễ</SelectItem><SelectItem value="Trung bình">Trung bình</SelectItem><SelectItem value="Khó">Khó</SelectItem></SelectContent></Select>
            </div>
            <div className="space-y-2"><Label className="font-semibold text-zinc-900">Title *</Label><Input value={title} onChange={(ev) => setTitle(ev.target.value)} className="border-zinc-300" required /></div>
            <div className="space-y-2"><Label className="font-semibold text-zinc-900">Topic *</Label><Input value={topic} onChange={(ev) => setTopic(ev.target.value)} className="border-zinc-300" required /></div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white shadow-sm">
          <CardHeader className="pb-4"><div className="flex items-center gap-2"><div className="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-white"><FileText className="size-4" /></div><CardTitle className="text-base font-bold tracking-tight text-zinc-950">Đề bài chi tiết</CardTitle></div></CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2"><Label className="font-semibold text-zinc-900">Description *</Label><Textarea value={description} onChange={(ev) => setDescription(ev.target.value)} rows={6} className="min-h-[140px] border-zinc-300" required /></div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="space-y-2"><Label className="font-semibold text-zinc-900">Input Format *</Label><Textarea value={inputFormat} onChange={(ev) => setInputFormat(ev.target.value)} rows={3} className="border-zinc-300" required /></div>
              <div className="space-y-2"><Label className="font-semibold text-zinc-900">Output Format *</Label><Textarea value={outputFormat} onChange={(ev) => setOutputFormat(ev.target.value)} rows={3} className="border-zinc-300" required /></div>
            </div>
            <div className="space-y-2"><Label className="font-semibold text-zinc-900">Constraints *</Label>
              <div className="space-y-2">
                {constraints.map((c, i) => (
                  <div key={i} className="flex gap-2"><Input value={c} onChange={(ev) => { const copy = [...constraints]; copy[i] = ev.target.value; setConstraints(copy); }} className="flex-1 border-zinc-300" /><Button type="button" variant="outline" size="sm" onClick={() => setConstraints(constraints.filter((_, idx) => idx !== i))} disabled={constraints.length <= 1}>Xóa</Button></div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setConstraints([...constraints, ""])} className="border-zinc-300">+ Thêm ràng buộc</Button>
              </div>
            </div>
            <div className="space-y-2"><Label className="font-semibold text-zinc-900">Examples *</Label>
              <div className="space-y-3">
                {examples.map((ex, i) => (
                  <div key={i} className="grid grid-cols-1 gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-2">
                    <Input value={ex.input} onChange={(ev) => { const copy = [...examples]; copy[i] = { ...copy[i], input: ev.target.value }; setExamples(copy); }} placeholder="Input" className="bg-white" />
                    <Input value={ex.output} onChange={(ev) => { const copy = [...examples]; copy[i] = { ...copy[i], output: ev.target.value }; setExamples(copy); }} placeholder="Output" className="bg-white" />
                    <Input value={ex.explanation ?? ""} onChange={(ev) => { const copy = [...examples]; copy[i] = { ...copy[i], explanation: ev.target.value }; setExamples(copy); }} placeholder="Giải thích (optional)" className="col-span-2 bg-white" />
                    <Button type="button" variant="ghost" size="sm" onClick={() => setExamples(examples.filter((_, idx) => idx !== i))} disabled={examples.length <= 1} className="col-span-2 justify-start text-red-600">Xóa example</Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setExamples([...examples, { input: "", output: "" }])} className="border-zinc-300">+ Thêm example</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-emerald-200 bg-gradient-to-b from-emerald-50/60 to-white shadow-sm">
          <CardHeader className="pb-3"><div className="flex items-center gap-2"><div className="flex size-8 items-center justify-center rounded-lg bg-emerald-600 text-white"><TestTube className="size-4" /></div><div><CardTitle className="text-base font-bold tracking-tight text-zinc-950">Visible Tests <span className="font-mono text-emerald-700">3 bắt buộc</span></CardTitle><CardDescription className="font-medium text-zinc-600">Input (stdin) bắt buộc — Output (expected) được phép rỗng</CardDescription></div></div></CardHeader>
          <CardContent className="space-y-3">
            {tests.map((t, i) => (
              <div key={i} className="grid grid-cols-1 gap-3 rounded-xl border border-emerald-200 bg-white p-4 shadow-sm sm:grid-cols-2">
                <div className="space-y-1"><Label className="text-xs font-bold tracking-wide text-emerald-700">Input (stdin) #{i + 1} <span className="text-red-600">*</span></Label><Textarea value={t.input} onChange={(ev) => updateTest(tests, setTests, i, "input", ev.target.value)} rows={2} placeholder="stdin — bắt buộc" className="font-mono border-zinc-300 bg-zinc-50 focus-visible:ring-emerald-600" /></div>
                <div className="space-y-1"><Label className="text-xs font-bold tracking-wide text-emerald-700">Output (expected) #{i + 1} <span className="font-normal text-zinc-500">— có thể để trống</span></Label><Textarea value={t.output} onChange={(ev) => updateTest(tests, setTests, i, "output", ev.target.value)} rows={2} placeholder="expected — để trống nếu không có output" className="font-mono border-zinc-300 bg-zinc-50 focus-visible:ring-emerald-600" /></div>
              </div>
            ))}
            <p className="text-xs font-medium text-emerald-700">Đúng 3 test — input bắt buộc, output được phép rỗng.</p>
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-gradient-to-b from-amber-50/60 to-white shadow-sm">
          <CardHeader className="pb-3"><div className="flex items-center gap-2"><div className="flex size-8 items-center justify-center rounded-lg bg-amber-500 text-white"><EyeOff className="size-4 text-white" /></div><div><CardTitle className="text-base font-bold tracking-tight text-zinc-950">Hidden Tests <span className="font-mono text-amber-600">10 bắt buộc</span></CardTitle><p className="text-xs font-medium text-zinc-600">Input (stdin) bắt buộc — Output (expected) được phép rỗng</p></div></div></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {hiddenTests.map((t, i) => (
                <div key={i} className="rounded-xl border border-amber-200 bg-white p-3 shadow-sm">
                  <p className="mb-2 text-xs font-bold tracking-wide text-amber-700">HIDDEN #{i + 1}</p>
                  <div className="space-y-2">
                    <div className="space-y-1"><Label className="text-[11px] font-bold tracking-wide text-zinc-700">Input (stdin) <span className="text-red-600">*</span></Label><Textarea value={t.input} onChange={(ev) => updateTest(hiddenTests, setHiddenTests, i, "input", ev.target.value)} rows={2} placeholder="stdin — bắt buộc" className="font-mono border-zinc-300 bg-zinc-50 placeholder:text-zinc-400 focus-visible:ring-amber-500" /></div>
                    <div className="space-y-1"><Label className="text-[11px] font-bold tracking-wide text-zinc-600">Output (expected) <span className="font-normal">— có thể để trống</span></Label><Textarea value={t.output} onChange={(ev) => updateTest(hiddenTests, setHiddenTests, i, "output", ev.target.value)} rows={2} placeholder="expected — để trống nếu không có output" className="font-mono border-zinc-300 bg-zinc-50 placeholder:text-zinc-400 focus-visible:ring-amber-500" /></div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs font-medium text-amber-700">Đúng 10 test — input bắt buộc, output được phép rỗng.</p>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white shadow-sm">
          <CardHeader className="pb-3"><div className="flex items-center gap-2"><div className="flex size-8 items-center justify-center rounded-lg bg-violet-600 text-white"><Code2 className="size-4" /></div><CardTitle className="text-base font-bold tracking-tight text-zinc-950">Starter Codes</CardTitle></div></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {LANGUAGES.map((lang) => (
              <div key={lang.id} className="space-y-1">
                <div className="flex items-center gap-2"><span className={`inline-flex size-6 items-center justify-center rounded-md bg-gradient-to-br text-[10px] font-bold text-white ${lang.color}`}>{lang.short}</span><Label className="text-xs font-bold tracking-wide text-zinc-800">{lang.label}</Label></div>
                <Textarea value={starterCodes[lang.id] ?? ""} onChange={(ev) => setStarterCodes((prev) => ({ ...prev, [lang.id]: ev.target.value }))} rows={3} className="font-mono text-xs border-zinc-300 bg-zinc-50" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white shadow-sm">
          <CardHeader className="pb-3"><div className="flex items-center gap-2"><div className="flex size-8 items-center justify-center rounded-lg bg-amber-500 text-white"><Clock className="size-4" /></div><CardTitle className="text-base font-bold tracking-tight text-zinc-950">Giới hạn</CardTitle></div></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label className="font-semibold text-zinc-900">Time limit (ms)</Label><Input type="number" value={timeLimit} onChange={(ev) => setTimeLimit(Number(ev.target.value))} className="border-zinc-300 font-mono" /></div>
            <div className="space-y-2"><Label className="font-semibold text-zinc-900">Memory limit (KB)</Label><Input type="number" value={memoryLimit} onChange={(ev) => setMemoryLimit(Number(ev.target.value))} className="border-zinc-300 font-mono" /></div>
          </CardContent>
        </Card>

        {error && <div id="form-error-bottom" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}
        <Separator />
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={submitting} className="flex-1 bg-zinc-950 py-6 text-base font-bold hover:bg-black sm:flex-none sm:px-10">{submitting ? "Đang cập nhật..." : "Cập nhật Problem"}</Button>
          <Button type="button" variant="outline" onClick={() => router.push("/problems")} className="border-zinc-300 font-semibold">Hủy</Button>
          <div className="ml-auto hidden items-center gap-2 text-xs font-medium text-zinc-500 sm:flex"><ShieldCheck className="size-4 text-emerald-600" /> Input bắt buộc, output được phép rỗng</div>
        </div>
      </form>
    </div>
  );
}
