import type { Metadata } from "next";
import "./globals.css";
import NotificationListener from "../components/notification-listener";

export const metadata: Metadata = {
  title: "Island Express | Shop Local. Discover More.",
  description: "The Seychelles online marketplace for local shops and independent sellers."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<NotificationListener /></body></html>;
}
