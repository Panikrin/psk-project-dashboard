import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ПСК — управление проектами",
  description: "Проекты, задачи и сроки ПСК Строй-Проект.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
