import type { Metadata } from "next";
import "./globals.css";
import NotificationListener from "../components/notification-listener";

const siteUrl = "https://islandxpress.shop";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Island Xpress | Shop Local. Shop Seychelles.",
  description:
    "Discover products from local sellers across Seychelles. Shop conveniently and support local businesses with Island Xpress.",
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Island Xpress",
    title: "Island Xpress | Shop Local. Shop Seychelles.",
    description:
      "Discover products from local sellers across Seychelles. Shop conveniently and support local businesses.",
    images: [
      {
        url: "/island-express-logo.svg",
        width: 1000,
        height: 650,
        alt: "Island Xpress — Shop Local. Shop Seychelles.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Island Xpress | Shop Local. Shop Seychelles.",
    description:
      "Discover products from local sellers across Seychelles. Shop conveniently and support local businesses.",
    images: ["/island-express-logo.svg"],
  },
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png", sizes: "192x192" }],
    shortcut: [{ url: "/favicon.png", type: "image/png", sizes: "192x192" }],
    apple: [{ url: "/favicon.png", type: "image/png", sizes: "192x192" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<NotificationListener /></body></html>;
}
