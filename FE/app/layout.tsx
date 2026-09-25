import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ClerkProvider } from "@clerk/nextjs";
import { viVN } from "@clerk/localizations";
import NextTopLoader from "nextjs-toploader";
import FooterWrapper from "./ui/FooterWrapper";
import Providers from "./providers";
import { getSiteUrl } from "@/lib/site";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "GoCode — Rèn tư duy giải thuật",
    template: "%s | GoCode",
  },
  description:
    "Hệ thống chấm mã nguồn độc lập, tuyển chọn bài toán DSA cốt lõi, chấm batch 10, streak & heatmap, lưu Neon.",
  metadataBase: new URL(getSiteUrl()),
  icons: { icon: "/favicon.ico" },
  openGraph: {
    title: "GoCode — Luyện thuật toán tối giản",
    description:
      "Tuyển chọn 20 bài Easy/Trung bình, 8 ngôn ngữ Judge0, chấm tức thì.",
    url: getSiteUrl(),
    siteName: "GoCode",
    locale: "vi_VN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GoCode",
    description: "Luyện thuật toán tối giản, thuần khiết & tức thì.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="vi"
      suppressHydrationWarning
      className={cn(
        "h-full",
        "antialiased",
        geistSans.variable,
        geistMono.variable,
        "font-sans",
        inter.variable,
      )}
    >
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "GoCode",
              url: getSiteUrl(),
              description:
                "Nền tảng luyện thuật toán tiếng Việt: 56 bài, 8 ngôn ngữ, chấm tức thì.",
              inLanguage: "vi-VN",
            }),
          }}
        />
        <NextTopLoader color="#10b981" height={5} showSpinner={false} zIndex={100} />
        <ClerkProvider localization={viVN}>
          <Providers>{children}</Providers>
        </ClerkProvider>
        <FooterWrapper />
      </body>
    </html>
  );
}
