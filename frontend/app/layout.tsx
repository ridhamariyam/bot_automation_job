import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: "JobRocket.ai — AI Job Bot That Applies For You",
  description:
    "Answer 5 questions, upload your CV — our AI bot applies to 50+ jobs daily on your behalf.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full bg-white text-gray-900 antialiased font-sans" suppressHydrationWarning>{children}</body>
    </html>
  );
}
