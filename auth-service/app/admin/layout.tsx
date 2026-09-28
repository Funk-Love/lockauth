import type { Metadata } from 'next';
import { ConsoleShell } from '@/components/console/ConsoleShell';

export const metadata: Metadata = { title: '管理' };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <ConsoleShell requireAdmin>{children}</ConsoleShell>;
}
