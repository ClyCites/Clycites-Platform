'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@clycites/ui';
import { loginRequestSchema, type LoginRequest } from '@clycites/contracts';
import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent } from 'react';
import { useForm } from 'react-hook-form';

import { Button as SecondaryButton } from '@/components/ui/button';
import type { MfaEnrollmentChallenge, MfaLoginChallenge } from '@/lib/api-client';

import { useAuth } from './auth-provider';

const inputClassName =
  'mt-2 flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40';

type Step =
  | { kind: 'credentials' }
  | { kind: 'code'; challenge: MfaLoginChallenge }
  | { kind: 'enroll'; challenge: MfaEnrollmentChallenge }
  | { kind: 'recovery'; codes: string[] };

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

export function LoginForm() {
  const { signIn } = useAuth();
  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const {
    register,
    handleSubmit,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: { identifier: '', password: '', deviceName: 'Web browser' },
  });
  const begin = async (values: LoginRequest) => {
    const challenge = await signIn(values);
    if (!challenge) return;
    setStep(
      challenge.enrollmentRequired ? { kind: 'enroll', challenge } : { kind: 'code', challenge },
    );
  };
  const submit = handleSubmit(async (values) => {
    try {
      await begin(values);
    } catch (error) {
      setError('root', { message: errorMessage(error, 'Sign in failed') });
    }
  });

  if (step.kind === 'code') {
    return (
      <MfaCodeStep challenge={step.challenge} onCancel={() => setStep({ kind: 'credentials' })} />
    );
  }
  if (step.kind === 'enroll') {
    return (
      <MfaEnrollmentStep
        challenge={step.challenge}
        onEnrolled={(codes) => setStep({ kind: 'recovery', codes })}
        onCancel={() => setStep({ kind: 'credentials' })}
      />
    );
  }
  if (step.kind === 'recovery') {
    return (
      <RecoveryCodesStep
        codes={step.codes}
        // Enrollment does not open a session; sign in again to reach the code step.
        onContinue={() => begin(getValues())}
      />
    );
  }

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
          className={inputClassName}
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
          className={inputClassName}
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

function FormError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <p
      className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
      role="alert"
    >
      {message}
    </p>
  );
}

function useCodeSubmit(action: (code: string) => Promise<void>) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = code.trim();
    if (trimmed.length < 6) {
      setError('Enter the code from your authenticator app');
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      await action(trimmed);
    } catch (caught) {
      setError(errorMessage(caught, 'Verification failed'));
      setSubmitting(false);
    }
  };
  return { code, setCode, error, submitting, submit };
}

function MfaCodeStep({
  challenge,
  onCancel,
}: {
  challenge: MfaLoginChallenge;
  onCancel: () => void;
}) {
  const { verifyMfa } = useAuth();
  const { code, setCode, error, submitting, submit } = useCodeSubmit((value) =>
    verifyMfa(challenge.challengeToken, value),
  );

  return (
    <form className="mt-6 space-y-5" onSubmit={(event) => void submit(event)} noValidate>
      <div>
        <label className="block text-sm font-medium text-foreground" htmlFor="mfa-code">
          Authentication code
        </label>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the 6-digit code from your authenticator app, or one of your recovery codes.
        </p>
        <input
          className={inputClassName}
          id="mfa-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
      </div>
      <Button className="w-full" type="submit" disabled={submitting}>
        {submitting ? 'Verifying...' : 'Verify'}
      </Button>
      <SecondaryButton className="w-full" type="button" variant="ghost" onClick={onCancel}>
        Back to sign in
      </SecondaryButton>
      <FormError message={error} />
    </form>
  );
}

function MfaEnrollmentStep({
  challenge,
  onEnrolled,
  onCancel,
}: {
  challenge: MfaEnrollmentChallenge;
  onEnrolled: (recoveryCodes: string[]) => void;
  onCancel: () => void;
}) {
  const { confirmMfaEnrollment } = useAuth();
  const [qrImage, setQrImage] = useState<string>();
  useEffect(() => {
    void QRCode.toDataURL(challenge.uri, { width: 200, margin: 1 }).then(setQrImage);
  }, [challenge.uri]);
  const { code, setCode, error, submitting, submit } = useCodeSubmit(async (value) =>
    onEnrolled(await confirmMfaEnrollment(challenge.challengeToken, value)),
  );

  return (
    <form className="mt-6 space-y-5" onSubmit={(event) => void submit(event)} noValidate>
      <div className="space-y-2 text-sm">
        <p className="font-medium text-foreground">Set up two-factor authentication</p>
        <p className="text-muted-foreground">
          Your account requires an authenticator app. Scan the QR code, or enter the key manually,
          then type the code it shows.
        </p>
      </div>
      {qrImage && (
        // eslint-disable-next-line @next/next/no-img-element -- generated data URL
        <img
          className="mx-auto rounded-md border border-input"
          src={qrImage}
          width={200}
          height={200}
          alt="Authenticator setup QR code"
        />
      )}
      <p className="rounded-md bg-muted p-3 text-center font-mono text-sm break-all">
        {challenge.secret}
      </p>
      <div>
        <label className="block text-sm font-medium text-foreground" htmlFor="mfa-enroll-code">
          Authentication code
        </label>
        <input
          className={inputClassName}
          id="mfa-enroll-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
      </div>
      <Button className="w-full" type="submit" disabled={submitting}>
        {submitting ? 'Confirming...' : 'Confirm'}
      </Button>
      <SecondaryButton className="w-full" type="button" variant="ghost" onClick={onCancel}>
        Back to sign in
      </SecondaryButton>
      <FormError message={error} />
    </form>
  );
}

function RecoveryCodesStep({
  codes,
  onContinue,
}: {
  codes: string[];
  onContinue: () => Promise<void>;
}) {
  const [error, setError] = useState<string>();
  const [continuing, setContinuing] = useState(false);
  const proceed = async () => {
    setContinuing(true);
    try {
      await onContinue();
    } catch (caught) {
      setError(errorMessage(caught, 'Sign in failed'));
      setContinuing(false);
    }
  };

  return (
    <div className="mt-6 space-y-5">
      <div className="space-y-2 text-sm">
        <p className="font-medium text-foreground">Save your recovery codes</p>
        <p className="text-muted-foreground">
          Each code signs you in once if you lose your authenticator. They are not shown again.
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-2 rounded-md bg-muted p-3 font-mono text-sm">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <Button className="w-full" type="button" disabled={continuing} onClick={() => void proceed()}>
        {continuing ? 'Signing in...' : 'I have saved these codes'}
      </Button>
      <FormError message={error} />
    </div>
  );
}
