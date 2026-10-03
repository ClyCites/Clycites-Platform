import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsFilterBar, defaultAnalyticsFilter } from './analytics-filter';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('analytics date filters', () => {
  it('uses the Kampala calendar day when UTC is still on the previous day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T23:30:00.000Z'));
    expect(defaultAnalyticsFilter().dateRange).toEqual({ from: '2026-09-04', to: '2026-10-03' });
  });

  it('retains a valid range when a date input is cleared', () => {
    const onChange = vi.fn();
    render(
      <AnalyticsFilterBar
        filter={{ dateRange: { from: '2026-09-01', to: '2026-09-30' }, granularity: 'DAY' }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-05' } });
    expect(onChange).toHaveBeenCalledWith({
      dateRange: { from: '2026-09-05', to: '2026-09-30' },
      granularity: 'DAY',
    });
  });
});
