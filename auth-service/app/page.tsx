import { Suspense } from 'react';
import { EntranceShell } from '@/components/entrance/EntranceShell';
import { LoginForm } from '@/components/entrance/LoginForm';
import { PageSpinner } from '@/components/ui/Spinner';

export default function LoginPage() {
  return (
    <EntranceShell>
      <Suspense fallback={<PageSpinner />}>
        <LoginForm />
      </Suspense>
    </EntranceShell>
  );
}
