import "./globals.css";
import { Providers } from "@/app/providers";

export const metadata = {
  title: "UygiDrive | Your files, organized",
  description: "A calm, capable place to store, find, preview, and share your files.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <body className="flex min-h-full flex-col"><Providers>{children}</Providers></body>
    </html>
  );
}
