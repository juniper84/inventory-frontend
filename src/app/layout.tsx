import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import './globals.css';

export const metadata: Metadata = {
  title: 'New Vision Inventory',
  description: 'Inventory management system',
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const locale = cookieStore.get('NEXT_LOCALE')?.value ?? 'en';
  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
