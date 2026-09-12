import type { Metadata, Viewport } from 'next';
import { themeBootScript } from '@/components/theme-switcher';
import './globals.css';

export const metadata: Metadata = {
  title: 'Restaurant Checklist',
  description: 'Shift checklists and accountability for restaurant teams',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Checklist', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Allows zoom: pinching to read a small temperature display is a real need.
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f4f1' },
    { media: '(prefers-color-scheme: dark)', color: '#14120f' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Runs before the first paint so a chosen theme does not flash the
            default one on every page load. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
