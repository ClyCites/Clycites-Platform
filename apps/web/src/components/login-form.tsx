'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@clycites/ui';
import { loginRequestSchema, type LoginRequest } from '@clycites/contracts';
import { useForm } from 'react-hook-form';

import { useAuth } from './auth-provider';

export function LoginForm() {
  const { signIn } = useAuth();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: { email: '', password: '', deviceName: 'Web browser' },
  });
  const submit = handleSubmit(async (values) => {
    try {
      await signIn(values);
    } catch (error) {
      setError('root', { message: error instanceof Error ? error.message : 'Sign in failed' });
    }
  });

  return (
    <form
      className="mt-6 space-y-5"
      onSubmit={(event) => {
        void submit(event);
      }}
      noValidate
    >
      <div>
        <label className="block font-semibold text-stone-800" htmlFor="email">
          Email address
        </label>
        <input
          className="mt-2 min-h-11 w-full rounded-md border border-stone-400 bg-white px-3 focus:border-leaf-700 focus:outline-2 focus:outline-leaf-700"
          id="email"
          type="email"
          autoComplete="email"
          aria-describedby={errors.email ? 'email-error' : undefined}
          {...register('email')}
        />
        {errors.email && (
          <p className="mt-2 text-sm text-red-700" id="email-error">
            {errors.email.message}
          </p>
        )}
      </div>
      <div>
        <label className="block font-semibold text-stone-800" htmlFor="password">
          Password
        </label>
        <input
          className="mt-2 min-h-11 w-full rounded-md border border-stone-400 bg-white px-3 focus:border-leaf-700 focus:outline-2 focus:outline-leaf-700"
          id="password"
          type="password"
          autoComplete="current-password"
          {...register('password')}
        />
        {errors.password && <p className="mt-2 text-sm text-red-700">{errors.password.message}</p>}
      </div>
      <input type="hidden" {...register('deviceName')} />
      <Button className="w-full" type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Signing in...' : 'Sign in'}
      </Button>
      {errors.root && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">
          {errors.root.message}
        </p>
      )}
    </form>
  );
}
