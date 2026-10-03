'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type ReactNode, type FormEvent } from 'react';
import type { z } from 'zod';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import { Select } from './select';
import { Textarea } from './textarea';

export type WorkflowField = {
  name: string;
  label: string;
  type?:
    | 'text'
    | 'email'
    | 'password'
    | 'number'
    | 'date'
    | 'datetime-local'
    | 'textarea'
    | 'select'
    | 'checkbox';
  options?: { value: string; label: string }[];
  required?: boolean;
  defaultValue?: string;
  description?: string;
  transform?: (value: string) => unknown;
};

export function useOrgPermission(organizationId?: string) {
  const { user } = useAuth();
  return (permission: string) =>
    user?.platformRole === 'PLATFORM_ADMIN' ||
    Boolean(
      user?.organizations
        .find((item) => item.organizationId === organizationId)
        ?.permissions.includes(permission),
    );
}

export function WorkflowForm({
  title,
  fields,
  schema,
  path,
  method = 'POST',
  values = {},
  onSuccess,
  successMessage = 'Record saved.',
  submitLabel = 'Save record',
  permission,
  organizationId,
  children,
}: {
  title: string;
  fields: WorkflowField[];
  schema: z.ZodType;
  path: string | ((body: Record<string, unknown>) => string);
  method?: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  values?: Record<string, unknown>;
  onSuccess?: ((data: unknown) => void) | undefined;
  successMessage?: string;
  submitLabel?: string;
  permission?: string | undefined;
  organizationId?: string | undefined;
  children?: ReactNode;
}) {
  const can = useOrgPermission(organizationId);
  const formId = useId();
  const queryClient = useQueryClient();
  const [validationError, setValidationError] = useState('');
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest<unknown>(typeof path === 'function' ? path(body) : path, {
        method,
        ...(method !== 'DELETE' ? { body: JSON.stringify(body) } : {}),
      }),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['register'] });
      onSuccess?.(data);
    },
  });
  if (permission && !can(permission)) return null;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = structuredClone(values);
    const assign = (name: string, value: unknown) => {
      const parts = name.split('.');
      let target = body;
      for (const part of parts.slice(0, -1)) {
        if (!target[part]) target[part] = {};
        target = target[part] as Record<string, unknown>;
      }
      target[parts[parts.length - 1]!] = value;
    };
    try {
      for (const field of fields) {
        const value = form.get(field.name);
        if (field.type === 'checkbox') assign(field.name, value === 'on');
        else if (typeof value === 'string' && value.trim() !== '')
          assign(
            field.name,
            field.transform
              ? field.transform(value)
              : field.type === 'number'
                ? Number(value)
                : field.type === 'datetime-local'
                  ? new Date(value).toISOString()
                  : value,
          );
      }
      const result = schema.safeParse(body);
      if (!result.success) {
        setValidationError(
          result.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join(' · '),
        );
        return;
      }
      setValidationError('');
      mutation.mutate(result.data as Record<string, unknown>);
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Please check the form.');
    }
  };
  return (
    <details className="ledger-surface rounded-md">
      <summary className="px-4 py-3 text-sm font-semibold">{title}</summary>
      <form className="space-y-4 border-t border-border p-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <div
              key={field.name}
              className={`space-y-2 ${field.type === 'textarea' ? 'sm:col-span-2' : ''}`}
            >
              <Label htmlFor={`${formId}-${field.name}`}>{field.label}</Label>
              {field.type === 'select' ? (
                <Select
                  id={`${formId}-${field.name}`}
                  aria-describedby={
                    field.description ? `${formId}-${field.name}-description` : undefined
                  }
                  name={field.name}
                  required={field.required ?? true}
                  defaultValue={field.defaultValue ?? ''}
                >
                  <option value="">Select…</option>
                  {field.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              ) : field.type === 'textarea' ? (
                <Textarea
                  id={`${formId}-${field.name}`}
                  aria-describedby={
                    field.description ? `${formId}-${field.name}-description` : undefined
                  }
                  name={field.name}
                  required={field.required ?? true}
                  defaultValue={field.defaultValue}
                />
              ) : (
                <Input
                  id={`${formId}-${field.name}`}
                  aria-describedby={
                    field.description ? `${formId}-${field.name}-description` : undefined
                  }
                  name={field.name}
                  type={field.type ?? 'text'}
                  required={field.type === 'checkbox' ? false : (field.required ?? true)}
                  defaultValue={field.defaultValue}
                  step={field.type === 'number' ? 'any' : undefined}
                  autoComplete={field.type === 'password' ? 'new-password' : undefined}
                />
              )}
              {field.description && (
                <p
                  id={`${formId}-${field.name}-description`}
                  className="text-xs font-normal text-muted-foreground"
                >
                  {field.description}
                </p>
              )}
            </div>
          ))}
        </div>
        {children}
        {(validationError || mutation.error) && (
          <p role="alert" className="text-sm text-destructive">
            {validationError || mutation.error?.message}
          </p>
        )}
        {mutation.isSuccess && (
          <p role="status" className="text-sm text-primary">
            {successMessage}
          </p>
        )}
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : submitLabel}
        </Button>
      </form>
    </details>
  );
}

export const choices = (values: readonly string[]) =>
  values.map((value) => ({ value, label: value.replaceAll('_', ' ').toLowerCase() }));
export const minorAmount = (value: string): string => {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new Error('Enter an amount with at most two decimal places.');
  return (BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'))).toString();
};
