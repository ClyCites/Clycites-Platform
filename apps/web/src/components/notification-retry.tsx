'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { apiRequest } from '@/lib/api-client';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Label } from './ui/label';
export function NotificationRetry() {
  const [notificationId, setNotificationId] = useState('');
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/operations/notifications/${id}/retry`, { method: 'POST' }),
  });
  return (
    <details className="ledger-surface rounded-md">
      <summary className="px-4 py-3 text-sm font-semibold">
        Retry failed notification delivery
      </summary>
      <form
        className="space-y-4 border-t border-border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const result = z.uuid().safeParse(notificationId.trim());
          if (!result.success) {
            setError('Enter a valid notification delivery ID.');
            return;
          }
          setError('');
          mutation.mutate(result.data);
        }}
      >
        <p className="text-sm text-muted-foreground">
          The backend provides retry support but no notification list endpoint. Use the failed
          delivery ID from an operational incident or delivery log.
        </p>
        <Label>
          Failed delivery ID
          <Input
            required
            value={notificationId}
            onChange={(event) => setNotificationId(event.target.value)}
          />
        </Label>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Queuing…' : 'Retry failed delivery'}
        </Button>
        {(error || mutation.error) && (
          <p role="alert" className="text-sm text-destructive">
            {error || mutation.error?.message}
          </p>
        )}
        {mutation.isSuccess && (
          <p role="status" className="text-sm text-primary">
            Delivery retry queued.
          </p>
        )}
      </form>
    </details>
  );
}
