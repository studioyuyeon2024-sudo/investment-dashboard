import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { AppHeader } from "@/components/app-shell/app-header";
import { BottomNav } from "@/components/app-shell/bottom-nav";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "investment-dashboard · 잃지 않는 투자",
  description:
    "한국 주식 포트폴리오를 Claude AI 와 함께 관리하고 KakaoTalk 으로 알림을 받습니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <AppHeader />
        {/* 하단 탭바(모바일) 가 콘텐츠를 가리지 않도록 여백 */}
        <div className="flex-1 pb-20 md:pb-0">{children}</div>
        <BottomNav />
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
