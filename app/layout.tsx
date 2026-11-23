import type { Metadata } from "next";
import "./globals.css";
import NotificationListener from "../components/notification-listener";

export const metadata: Metadata = {
  title: "islandXpress | Shop Local. Discover More.",
  description: "The Seychelles online marketplace for local shops and independent sellers.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<NotificationListener /></body></html>;
}
