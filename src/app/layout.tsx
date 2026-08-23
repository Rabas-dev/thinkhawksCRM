import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Think Hawks CRM",
  description: "Internal CRM for Think Hawks — contacts, email, calling, and messaging in one place.",
};

/** Runs before hydration so the page never flashes light before switching to a stored dark preference. */
const THEME_INIT_SCRIPT = `
  try {
    if (localStorage.getItem("theme") === "dark") {
      document.documentElement.classList.add("dark");
    }
  } catch (e) {}
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plusJakartaSans.variable} h-full`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      {/* h-dvh + overflow-hidden pins the whole app to exactly one viewport tall
          so the document itself never scrolls — only isolated panels do (see
          dashboard/layout.tsx's <main>). Without this, tall page content grows
          <body> past the viewport, and the sidebar (a plain h-screen block,
          not position: sticky) scrolls away with everything else instead of
          staying put. */}
      <body className="h-dvh flex flex-col overflow-hidden bg-section text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
