import { Card } from '@clycites/ui';

import { LoginForm } from '@/components/login-form';

export const metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md px-5 py-16">
      <Card>
        <p className="text-sm font-bold uppercase text-leaf-700">Workspace access</p>
        <h1 className="mt-3 font-display text-3xl font-bold text-leaf-900">Sign in to ClyCites</h1>
        <p className="mt-3 text-stone-600">Use your assigned staff account to continue.</p>
        <LoginForm />
      </Card>
    </div>
  );
}
