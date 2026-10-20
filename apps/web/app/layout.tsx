import type { Metadata } from 'next';
import './globals.css';
import './research.css';
export const metadata: Metadata = {
  title: 'TerraLab · Network Studio',
  description: 'A research workspace for GNSS-independent terrestrial positioning.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
