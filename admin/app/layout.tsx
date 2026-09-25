import type { Metadata } from "next";
import { Be_Vietnam_Pro, Inter, JetBrains_Mono } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import "./globals.css";

const display = Be_Vietnam_Pro({
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
  subsets: ["latin", "vietnamese"],
  display: "swap",
  preload: true,
});

const body = Inter({
  variable: "--font-body",
  subsets: ["latin", "vietnamese"],
  display: "swap",
  preload: true,
});

const code = JetBrains_Mono({
  variable: "--font-code",
  subsets: ["latin", "vietnamese"],
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: "GoCode Admin",
  description: "GoCode Admin Dashboard",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      className={`${display.variable} ${body.variable} ${code.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-slate-50 font-sans text-slate-900">
        <NextTopLoader color="#059669" height={2} showSpinner={false} zIndex={100} />
        {children}
      </body>
    </html>
  );
}
