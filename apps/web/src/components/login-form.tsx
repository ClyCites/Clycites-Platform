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
    defaultValues: { identifier: '', password: '', deviceName: 'Web browser' },
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
        <label className="block text-sm font-medium text-foreground" htmlFor="identifier">
          Username, email, or phone
        </label>
        <input
          className="mt-2 flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
          id="identifier"
          type="text"
          autoComplete="username"
          aria-describedby={errors.identifier ? 'identifier-error' : undefined}
          {...register('identifier')}
        />
        {errors.identifier && (
          <p className="mt-2 text-sm text-destructive" id="identifier-error">
            {errors.identifier.message}
          </p>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground" htmlFor="password">
          Password
        </label>
        <input
          className="mt-2 flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
          id="password"
          type="password"
          autoComplete="current-password"
          {...register('password')}
        />
        {errors.password && (
          <p className="mt-2 text-sm text-destructive">{errors.password.message}</p>
        )}
      </div>
      <input type="hidden" {...register('deviceName')} />
      <Button className="w-full" type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Signing in...' : 'Sign in'}
      </Button>
      {errors.root && (
        <p
          className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {errors.root.message}
        </p>
      )}
    </form>
  );
}
