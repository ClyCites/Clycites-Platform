'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@clycites/ui';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const loginSchema = z.object({ email: z.email('Enter a valid email address') });
type LoginFields = z.infer<typeof loginSchema>;

export function LoginForm() {
  const [submitted, setSubmitted] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFields>({ resolver: zodResolver(loginSchema) });
  const submit = handleSubmit(() => setSubmitted(true));

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
      <Button className="w-full" type="submit">
        Continue
      </Button>
      {submitted && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900" role="status">
          Authentication is not enabled in this foundation release.
        </p>
      )}
    </form>
  );
}
