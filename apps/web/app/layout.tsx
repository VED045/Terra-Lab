import type { Metadata } from 'next';
import { WorkspaceThemeSync } from '@/components/workspace-theme-sync';
import './globals.css';
import './research.css';
import './scene.css';
import './collaboration.css';
import './ai.css';
import './research-workspace.css';
import 'katex/dist/katex.min.css';
import './workbench.css';
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
      <body>
        <WorkspaceThemeSync />
        {children}
      </body>
    </html>
  );
}
