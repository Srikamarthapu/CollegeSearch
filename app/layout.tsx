import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import { headers } from "next/headers";
import { colleges } from "./lib/college-data";
import { Providers } from "./providers";
import "lenis/dist/lenis.css";
import "./globals.css";
import "./redesign.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ||
    requestHeaders.get("host") ||
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ||
    (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    title: "CollegeSearch",
    description:
      "Your college field guide. Explore 50 U.S. colleges, compare dated official records, and build a shortlist with your own research.",
    applicationName: "CollegeSearch",
    keywords: [
      "college search",
      "college comparison",
      "admission rates",
      "college majors",
      "College Scorecard",
    ],
    icons: {
      icon: { url: "/favicon.svg", type: "image/svg+xml" },
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "CollegeSearch — Build a college list you can explain",
      description:
        "Explore colleges with dated official records and a place for your own research.",
      type: "website",
      images: [
        {
          url: `${origin}/og.png`,
          width: 1731,
          height: 909,
          alt: "CollegeSearch — Build a college list you can explain.",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "CollegeSearch",
      description: "Evidence for the college list only you can build.",
      images: [`${origin}/og.png`],
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en">
      <head><meta property="csp-nonce" nonce={nonce} /></head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable}`}
      >
        <Providers knownCollegeIds={colleges.map((college) => college.unitId)}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
