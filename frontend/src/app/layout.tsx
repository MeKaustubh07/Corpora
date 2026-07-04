import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Header } from "@/components/Header";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Corpora",
  description: "Multimodal agentic RAG — upload knowledge, chat with citations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${inter.variable} ${geistMono.variable} h-full antialiased`}>
        <body className="flex min-h-full flex-col bg-neutral-950 text-neutral-100">
          <Header />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
