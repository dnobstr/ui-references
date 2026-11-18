import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'UI References · Quadrangle Prompt Studio',
  description:
    'Upload, paste from clipboard, or link UI screenshots to extract structured AI replication prompts and catalog them in your repository.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
