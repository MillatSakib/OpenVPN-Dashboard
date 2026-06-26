import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OpenVPN Dashboard',
  description: 'OpenVPN Server Management Dashboard',
  icons: { icon: '/favicon.ico' },
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
