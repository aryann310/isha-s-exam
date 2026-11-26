import { Geist_Mono, IBM_Plex_Sans, Inter, Mukta, Noto_Sans, Source_Sans_3, Source_Serif_4 } from "next/font/google";

// Main theme: Inter for text, Source Serif 4 for headings.
export const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
export const sourceSerif = Source_Serif_4({ subsets: ["latin"], variable: "--font-source-serif", display: "swap" });
export const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

// One font per exam theme. Not preloaded: the browser only downloads the one an exam screen actually uses.
export const notoSans = Noto_Sans({ subsets: ["latin"], variable: "--font-noto", display: "swap", preload: false });
export const plexSans = IBM_Plex_Sans({ subsets: ["latin"], variable: "--font-plex", display: "swap", preload: false });
export const sourceSans = Source_Sans_3({ subsets: ["latin"], variable: "--font-source-sans", display: "swap", preload: false });
export const mukta = Mukta({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-mukta", display: "swap", preload: false });

export const fontVariables = [inter, sourceSerif, geistMono, notoSans, plexSans, sourceSans, mukta].map((f) => f.variable).join(" ");
