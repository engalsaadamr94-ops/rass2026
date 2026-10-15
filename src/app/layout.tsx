import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'عروض وعقود رسس', description: 'نظام عروض الأسعار والعقود والتحصيل - شركة رسس للمقاولات العامة', robots: { index: false, follow: false } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="icon" href="/logo.png" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="theme-color" content="#1c3d6b" />
        <script src="/pwa.js" defer></script>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Readex+Pro:wght@500;600;700&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="/app.css" />
        <link rel="stylesheet" href="/doc.css" />
        <link rel="stylesheet" href="/vendor/fonts.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
