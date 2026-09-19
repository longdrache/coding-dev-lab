"use client";
import Link from "next/link";
import {
  Search,
  ChevronDown,
  HelpCircle,
  MessageSquare,
  Send,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";
import { useState, useMemo } from "react";
import Logo from "@/app/ui/Logo";
import { EXTENDED_FAQS } from "@/app/data/faq";

export default function Page() {
  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [openFaqId, setOpenFaqId] = useState<string | null>("f1");

  // Contact form state
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactQuestion, setContactQuestion] = useState("");
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const filteredFaqs = useMemo(() => {
    return EXTENDED_FAQS.filter((faq) => {
      const matchQuery =
        faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
        faq.answer.toLowerCase().includes(searchTerm.toLowerCase()) ||
        faq.tags.some((t) =>
          t.toLowerCase().includes(searchTerm.toLowerCase()),
        );

      const matchCategory =
        selectedCategory === "all" || faq.category === selectedCategory;

      return matchQuery && matchCategory;
    });
  }, [searchTerm, selectedCategory]);

  const toggleFaq = (id: string) => {
    setOpenFaqId(openFaqId === id ? null : id);
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!contactName.trim() || !contactEmail.trim() || !contactQuestion.trim()) return;
    try {
      const res = await fetch(`${API_URL}/api/qna`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: contactName.trim(),
          email: contactEmail.trim(),
          question: contactQuestion.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Gửi thất bại");
      setContactSubmitted(true);
      setTimeout(() => {
        setContactName("");
        setContactEmail("");
        setContactQuestion("");
        setContactSubmitted(false);
      }, 4000);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Đã có lỗi xảy ra");
    }
  };

  return (
    <div className="bg-[#FAFAFA] min-h-screen py-12">
      <div className="max-w-4xl mx-auto px-6">
        {/* Navigation Breadcrumbs & Back Button */}
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Logo />
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-zinc-800 transition"
            >
              <ArrowLeft className="size-4" />
              Trang chủ
            </Link>
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono">
            <span className="hover:text-zinc-800 cursor-pointer">
              Trang chủ
            </span>
            <span>/</span>
            <span className="text-zinc-950 font-medium">Trung tâm Hỏi đáp</span>
          </div>
        </div>

        {/* Page Editorial Header */}
        <div className="mb-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-100 border border-zinc-200/80 text-[11px] font-mono text-zinc-600 mb-4">
            <HelpCircle className="w-3.5 h-3.5 text-zinc-900" />
            <span>Hỏi &amp; Đáp Kỹ Thuật (Knowledge Base)</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-zinc-950 leading-[1.15]">
            Trung tâm Hỏi Đáp.{" "}
            <span className="block  italic font-normal text-zinc-500 text-2xl sm:text-4xl mt-1">
              Giải đáp mọi thắc mắc về hạ tầng &amp; học tập.
            </span>
          </h1>
          <p className="mt-4 text-base text-zinc-600 leading-relaxed">
            Tra cứu nhanh các thông số kỹ thuật về sandbox thực thi, các chuẩn
            ngôn ngữ, định hướng lộ trình học tập và chuẩn bị phỏng vấn công
            nghệ cao.
          </p>
        </div>

        {/* Search Bar with Quick Filter Pills */}
        <div className="bg-white p-4 rounded-xl border border-zinc-200 mb-8 space-y-3 shadow-2xs">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm kiếm câu hỏi (ví dụ: sandbox, c++, memory limit, GoCode, system design)..."
              className="w-full pl-9 pr-4 py-2.5 text-xs sm:text-sm bg-zinc-50/60 border border-zinc-200 rounded-lg text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-950 focus:bg-white"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-xs font-mono text-zinc-400 mr-1">
              Chủ đề:
            </span>
            {[
              { id: "all", label: "Tất cả" },
              { id: "sandbox", label: "Sandbox & Runtimes" },
              { id: "tracks", label: "Lộ trình & Thuật toán" },
              { id: "interview", label: "Phỏng vấn Tech" },
              { id: "account", label: "Tài khoản & Tiến độ" },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  selectedCategory === cat.id
                    ? "bg-zinc-950 text-white shadow-2xs"
                    : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100 bg-transparent"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* FAQ Accordion List */}
        <div className="bg-white rounded-xl border border-zinc-200 divide-y divide-zinc-100 overflow-hidden shadow-2xs mb-12">
          {filteredFaqs.map((faq) => {
            const isOpen = openFaqId === faq.id;
            return (
              <div
                key={faq.id}
                className="p-5 sm:p-6 transition-colors hover:bg-zinc-50/40"
              >
                <button
                  onClick={() => toggleFaq(faq.id)}
                  className="w-full text-left flex items-start justify-between gap-4 font-semibold text-zinc-900 text-sm sm:text-base group"
                >
                  <span className="group-hover:text-zinc-950 transition-colors leading-snug">
                    {faq.question}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-zinc-400 shrink-0 mt-1 transition-transform duration-200 ${
                      isOpen
                        ? "rotate-180 text-zinc-950"
                        : "group-hover:text-zinc-700"
                    }`}
                  />
                </button>

                {isOpen && (
                  <div className="pt-3.5 pr-4 text-xs sm:text-sm text-zinc-600 leading-relaxed animate-in fade-in duration-150">
                    <p>{faq.answer}</p>
                    <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-zinc-100">
                      {faq.tags.map((t) => (
                        <span
                          key={t}
                          className="px-2 py-0.5 rounded bg-zinc-100 text-[10px] font-mono text-zinc-500"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {filteredFaqs.length === 0 && (
            <div className="p-8 text-center text-zinc-500 text-xs sm:text-sm">
              {`Không tìm thấy câu hỏi phù hợp với từ khó  "${searchTerm}" Bạn có
              thể gửi câu hỏi mới bên dưới!`}
            </div>
          )}
        </div>

        {/* Submit Question Box */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6 sm:p-8 shadow-2xs mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 text-white flex items-center justify-center">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-950">
                Bạn có câu hỏi hoặc đề xuất khác?
              </h3>
              <p className="text-xs text-zinc-500">
                Đội ngũ kỹ thuật sẽ giải đáp và cập nhật câu hỏi vào cơ sở tri
                thức trong vòng 24 giờ.
              </p>
            </div>
          </div>

          {contactSubmitted ? (
            <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-3 animate-in fade-in">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <strong className="font-semibold block">
                  Đã gửi câu hỏi thành công!
                </strong>
                <span>
                  Cảm ơn bạn. Câu trả lời sẽ được gửi về hộp thư email của bạn
                  sớm nhất.
                </span>
              </div>
            </div>
          ) : (
            <form onSubmit={handleContactSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-mono text-zinc-600 block mb-1">
                    Họ và tên *
                  </label>
                  <input
                    type="text"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Nguyễn Văn A"
                    className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-950"
                  />
                </div>
                <div>
                  <label className="text-xs font-mono text-zinc-600 block mb-1">
                    Địa chỉ Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="ban@domain.com"
                    className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-950"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-mono text-zinc-600 block mb-1">
                  Nội dung thắc mắc / Đề xuất tính năng *
                </label>
                <textarea
                  required
                  rows={3}
                  value={contactQuestion}
                  onChange={(e) => setContactQuestion(e.target.value)}
                  placeholder="Mô tả chi tiết câu hỏi của bạn về compiler, thuật toán hoặc hệ thống..."
                  className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-950 resize-none"
                />
              </div>

              {submitError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {submitError}
                </p>
              )}
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-950 text-white text-xs font-medium hover:bg-zinc-800 transition-colors shadow-2xs active:scale-[0.98]"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Gửi câu hỏi</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
