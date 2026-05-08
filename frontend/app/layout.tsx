import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "JobRocket — AI-Powered Job Application Automation",
  description:
    "Automate your job search intelligently. JobRocket applies to matching jobs across LinkedIn, Indeed, Glassdoor and more — so you can focus on interviews.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "JobRocket",
  },
  formatDetection: { telephone: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
