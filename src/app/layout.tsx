import type { Metadata } from "next";
import { Fraunces, Space_Grotesk, Syne } from "next/font/google";
import { Providers } from "@/components/Providers";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz", "SOFT", "WONK"],
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  display: "swap",
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "HERMES mail — Find, draft, deliver",
  description:
    "A human-in-the-loop lead studio. Search a niche, enrich prospects, draft outreach, approve, and send — on your terms.",
};

/** Prevent theme flash before React hydrates. Light only on /app (studio). */
const themeBootScript = `
(function(){
  try {
    var path=location.pathname||"";
    var onApp=path==="/app"||path.indexOf("/app/")===0;
    var k=${JSON.stringify(THEME_STORAGE_KEY)};
    var t=localStorage.getItem(k);
    if(onApp&&(t==="light"||t==="dark")) document.documentElement.setAttribute("data-theme",t);
    else document.documentElement.setAttribute("data-theme","dark");
  } catch(e) {
    document.documentElement.setAttribute("data-theme","dark");
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${fraunces.variable} ${spaceGrotesk.variable} ${syne.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
