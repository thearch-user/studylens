import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'StudyLens — Your space to understand',
  description: 'Turn your learning resources into clear summaries, grounded answers, and narrated slide lessons.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
