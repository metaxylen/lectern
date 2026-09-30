import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MonitoringProvider } from "@/components/monitoring-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Lectern: lecture transcription and study notes", template: "%s · Lectern" },
  description:
    "Record or upload a lecture, transcribe it locally with Whisper, and get timestamped chapters, exam notes and flashcards. Local-first, mixed English and Turkish.",
  applicationName: "Lectern",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        <MonitoringProvider />
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
