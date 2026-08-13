import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Secure Messaging Platform",
  description: "Signal-inspired fullstack messaging demo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
