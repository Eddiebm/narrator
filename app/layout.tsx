import type { Metadata } from 'next';
import './globals.css';
import GlobalNav from '@/components/GlobalNav';

export const metadata: Metadata = {
  title: 'Narrator — PPTX to Voiceover',
  description: 'Convert PowerPoint slides into compelling AI-narrated audio.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-surface text-ink antialiased">
        <GlobalNav />
        {children}
      </body>
    </html>
  );
}
