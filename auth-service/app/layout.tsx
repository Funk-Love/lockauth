import type { Metadata, Viewport } from "next";
import { Fraunces, Geist, Geist_Mono, Noto_Serif_SC } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "@/components/ui/Toast";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// 只用在字标和少量展示性标题上：带一点 70 年代的软圆衬线（和 LockAI 同一款）
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
  style: ["normal", "italic"],
});

const notoSerifSC = Noto_Serif_SC({
  variable: "--font-noto-serif-sc",
  weight: ["500", "600"],
  preload: false,
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "LockAuth · Funk & Love", template: "%s · LockAuth" },
  description: "Funk & Love 账号登录与管理。",
  applicationName: "LockAuth",
};

export const viewport: Viewport = {
  themeColor: "#141210",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${notoSerifSC.variable}`}>
      <body className="grain">
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
