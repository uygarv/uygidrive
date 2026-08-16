import "./globals.css";
import { Providers } from "@/app/providers";

export const metadata = {
  title: "UygiDrive | Simpliest access to your files",
  description: "A capable place to store and share your files.",
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
