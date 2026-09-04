import type { Metadata } from "next";
import { Nunito_Sans } from "next/font/google";
import "./globals.css";

const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "bord",
  description: "Egyptian corporate governance management platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" className={nunitoSans.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
