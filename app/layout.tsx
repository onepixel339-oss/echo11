import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

/**
 * Brand typography — self-hosted (next/font/local, no runtime CDN):
 *  - Space Grotesk (var)  → latin UI, wordmark, numerals
 *  - Alexandria (var)     → arabic display + body (weights 100–900)
 * Both are OFL-licensed; the per-glyph stack (latin first, arabic
 * second) resolves every script automatically in any language.
 */
const spaceGrotesk = localFont({
  src: [{ path: "./fonts/space-grotesk-var.woff2", style: "normal", weight: "300 700" }],
  variable: "--font-latin",
  display: "swap",
});

const alexandriaArabic = localFont({
  src: [{ path: "./fonts/alexandria-arabic-var.woff2", style: "normal", weight: "100 900" }],
  variable: "--font-arabic",
  display: "swap",
});

/** Alexandria's latin subset — reserved for the shared taste card and
    any latin display text that should match the arabic display voice. */
const alexandriaLatin = localFont({
  src: [{ path: "./fonts/alexandria-latin-var.woff2", style: "normal", weight: "100 900" }],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ECHO — Your taste, mapped.",
  description:
    "A local-first atlas of your taste: add the anime, movies and series you enjoy, and ECHO charts them into an explorable map with explainable recommendations. Real catalogue data from AniList, TVMaze and IMDb.",
  applicationName: "ECHO",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ECHO",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0d12",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${spaceGrotesk.variable} ${alexandriaArabic.variable} ${alexandriaLatin.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
