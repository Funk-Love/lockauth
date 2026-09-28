import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EntranceShell } from '@/components/entrance/EntranceShell';
import { ResetForm } from '@/components/entrance/ResetForm';
import { PageSpinner } from '@/components/ui/Spinner';

export const metadata: Metadata = { title: '重设密码' };

export default function ResetPasswordPage() {
  return (
    <EntranceShell>
      <Suspense fallback={<PageSpinner />}>
        <ResetForm />
      </Suspense>
    </EntranceShell>
  );
}
