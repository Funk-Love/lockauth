import type { Metadata } from 'next';
import { ConsoleShell } from '@/components/console/ConsoleShell';

export const metadata: Metadata = { title: '控制台' };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <ConsoleShell>{children}</ConsoleShell>;
}
