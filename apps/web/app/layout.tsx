import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { getUser } from "@/lib/auth-server";
import { THEME_STORAGE_KEY } from "@/dtos/theme.dto";
import "./globals.css";
import "katex/dist/katex.min.css";
import { Providers } from "./providers";

const themeBootScript = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k);if(t==="dark"||t==="light"||t==="pink"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Unicorns Edu – Nền tảng quản lý giáo dục & luyện thi",
  description:
    "Quản lý lớp học, giáo án, học sinh và nhân sự trong một hệ thống duy nhất. Dành cho trung tâm luyện thi, bồi dưỡng văn hoá và lập trình.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialUser = await getUser();

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Script
          id="ue-theme-boot"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeBootScript }}
        />
        <Providers initialUser={initialUser}>{children}</Providers>
      </body>
    </html>
  );
}
