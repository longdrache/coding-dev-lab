/// <reference types="@cloudflare/workers-types" />

interface Env {
  RAG_KB?: KVNamespace;
}

interface ChatBody {
  message?: string;
  history?: Array<{ role: string; content: string }>;
  context?: { problemSlug?: string };
}

let kbCache: { text: string; fetchedAt: number } | null = null;
const KB_TTL_MS = 10 * 60 * 1000;

const KB_NOT_CONFIGURED =
  "Tài liệu RAG chưa được cấu hình trên bot. Vui lòng liên hệ quản trị viên để nạp tailieu.txt vào KV RAG_KB.";

async function getKnowledgeBase(env: Env): Promise<string> {
  const now = Date.now();
  if (kbCache && now - kbCache.fetchedAt < KB_TTL_MS) return kbCache.text;

  let text = "";
  if (env?.RAG_KB) {
    const value = await env.RAG_KB.get("tailieu", "text");
    if (value) text = value;
  }

  kbCache = { text, fetchedAt: now };
  return text;
}

function findProblemSection(kb: string, title: string): string | null {
  const want = title.trim().toLowerCase();
  if (!want) return null;
  let searchFrom = 0;
  for (;;) {
    const markerIdx = kb.indexOf("[PROBLEM:", searchFrom);
    if (markerIdx === -1) return null;
    const lineEnd = kb.indexOf("\n", markerIdx);
    const sectionStart = lineEnd === -1 ? kb.length : lineEnd + 1;
    const nextMarker = kb.indexOf("[PROBLEM:", sectionStart);
    const section = nextMarker === -1 ? kb.slice(sectionStart) : kb.slice(sectionStart, nextMarker);
    const firstLine = section.trim().split(/\s+-\s+/)[0].trim().toLowerCase();
    if (firstLine.startsWith(want) || want.startsWith(firstLine)) {
      return section.trim();
    }
    searchFrom = markerIdx + 1;
  }
}

function extractHint(section: string): string | null {
  const lines = section.split("\n").map((l) => l.trim()).filter(Boolean);
  const hintIdx = lines.findIndex((l) =>
    /^(gợi ý|hint|mẹo|lưu ý|yêu cầu|đầu vào|đầu ra|định dạng)/i.test(l)
  );
  const target = hintIdx === -1 ? lines : lines.slice(hintIdx);
  const joined = target.join(" ").trim();
  return joined ? joined.slice(0, 500) : null;
}

function buildAnswer(kb: string, message: string, problem?: string, language?: string): string {
  if (!kb) return KB_NOT_CONFIGURED;

  if (problem) {
    const section = findProblemSection(kb, problem);
    if (section) {
      const hint = extractHint(section);
      const body = hint ?? section.slice(0, 500);
      const langPart = language ? ` (dùng ${language})` : "";
      return `Về bài "${problem}"${langPart}: ${body}`;
    }
    return `Tôi chưa có tài liệu cho bài "${problem}". Bạn có thể mô tả lại câu hỏi?`;
  }

  const lower = (message ?? "").toLowerCase().trim();
  if (!lower) return "Hãy nhập câu hỏi của bạn về bài tập.";

  const lowerKb = kb.toLowerCase();
  const keywords = ["nộp bài", "chấm điểm", "viết code", "hướng làm", "độ phức tạp", "lỗi", "submission", "accepted"];
  const hit = keywords.find((k) => lower.includes(k));
  if (hit) {
    const idx = lowerKb.indexOf(hit);
    const window = kb.slice(Math.max(0, idx - 200), idx + 400).trim().replace(/\s+/g, " ");
    return `Về "${hit}": ${window.slice(0, 400)}`;
  }

  return "Xin chào, mình là trợ lý GoCode. Bạn hỏi về bài tập nào, mình sẽ gợi ý hướng làm dựa trên tài liệu khung.";
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/chat" || request.method !== "POST") {
      return json({ error: "Gọi POST /chat" }, 405);
    }

    let body: ChatBody = {};
    try {
      body = (await request.json()) as ChatBody;
    } catch {
      return json({ error: "Dữ liệu gửi lên không hợp lệ" }, 400);
    }

    const kb = await getKnowledgeBase(env);
    const answer = buildAnswer(kb, body.message, body.context?.problem, body.context?.language);
    return json({ answer });
  },
} satisfies ExportedHandler<Env>;
