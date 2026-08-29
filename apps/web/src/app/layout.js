import "./globals.css";
import { Providers } from "@/app/providers";
import { brand } from "@/config/brand";

export const metadata = {
  title: `${brand.name} | ${brand.tagline}`,
  description: brand.description,
  icons: {
    icon: [{ url: brand.logoPath, type: "image/svg+xml" }],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <body className="flex min-h-full flex-col"><Providers>{children}</Providers></body>
    </html>
  );
}
