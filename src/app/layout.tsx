import type { Metadata } from "next";
import { Outfit, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { getBranding } from "@/lib/school/branding";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding();
  return {
    title: branding.platformDisplayName,
    description: branding.schoolName
      ? `${branding.platformDisplayName} for ${branding.schoolName}`
      : "Assignment, submission, marking and feedback platform for schools.",
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en-GB"
      className={`${plusJakarta.variable} ${outfit.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans text-slate-900">{children}</body>
    </html>
  );
}
