import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const viewport: Viewport = {
  themeColor: "#111827",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "JobRocket — AI Job Bot That Applies For You",
  description:
    "Answer 5 questions, upload your CV — our AI bot applies to 50+ jobs daily on your behalf.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "JobRocket",
  },
  formatDetection: { telephone: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full`} suppressHydrationWarning>
      <body
        className="min-h-full bg-white text-gray-900 antialiased font-sans"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
