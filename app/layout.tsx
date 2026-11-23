import type { Metadata } from "next";
import "./globals.css";
import NotificationListener from "../components/notification-listener";

export const metadata: Metadata = {
  title: "islandXpress | Shop Local. Discover More.",
  description: "The Seychelles online marketplace for local shops and independent sellers.",
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png", sizes: "192x192" }],
    shortcut: [{ url: "/favicon.png", type: "image/png", sizes: "192x192" }],
    apple: [{ url: "/favicon.png", type: "image/png", sizes: "192x192" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<NotificationListener /></body></html>;
}
