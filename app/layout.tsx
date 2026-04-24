import type { Metadata } from "next";
import { Syne, JetBrains_Mono, Nunito_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./components/ThemeProvider";
import { AuthSync } from "./components/AuthSync";
import { ClerkProvider } from "@clerk/nextjs";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jb",
  display: "swap",
  weight: ["400", "500", "600"],
});

const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap",
  weight: ["300", "400", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Atlas — AI Trading Assistant",
  description:
    "Agentic AI swing trading with configurable execution authority. Full reasoning transparency.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${syne.variable} ${jetBrainsMono.variable} ${nunitoSans.variable}`}
      >
        <body className="antialiased">
          <ThemeProvider><AuthSync />{children}</ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
