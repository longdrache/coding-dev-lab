import type { Metadata } from "next";
import { Plus_Jakarta_Sans, DM_Sans, Fira_Code } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import "./globals.css";

const display = Plus_Jakarta_Sans({
  variable: "--font-display",
  subsets: ["latin", "latin-ext"],
  display: "swap",
  preload: true,
});

const body = DM_Sans({
  variable: "--font-body",
  subsets: ["latin", "latin-ext"],
  display: "swap",
  preload: true,
});

const code = Fira_Code({
  variable: "--font-code",
  subsets: ["latin"],
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
