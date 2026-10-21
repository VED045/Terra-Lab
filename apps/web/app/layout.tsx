import type { Metadata } from 'next';
import './globals.css';
import './research.css';
import './scene.css';
import './collaboration.css';
import './ai.css';
export const metadata: Metadata = {
  title: 'TerraLab · Network Studio',
  icons: {
    icon: [
      { url: '/brand/network-tower.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: '32x32' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-icon.png',
  },
  description: 'A research workspace for GNSS-independent terrestrial positioning.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
