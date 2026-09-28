import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EntranceShell } from '@/components/entrance/EntranceShell';
import { RegisterForm } from '@/components/entrance/RegisterForm';
import { PageSpinner } from '@/components/ui/Spinner';

export const metadata: Metadata = { title: '注册' };

export default function RegisterPage() {
  return (
    <EntranceShell>
      <Suspense fallback={<PageSpinner />}>
        <RegisterForm />
      </Suspense>
    </EntranceShell>
  );
}
