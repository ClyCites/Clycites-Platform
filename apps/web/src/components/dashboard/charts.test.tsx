import type { KpiCard as KpiCardData } from '@clycites/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { formatNumber, KpiCard } from './charts';

describe('formatNumber', () => {
  it('formats small values with up to two fraction digits', () => {
    expect(formatNumber(12.345)).toBe('12.35');
    expect(formatNumber(0)).toBe('0');
  });

  it('formats large values with grouping and one fraction digit', () => {
    expect(formatNumber(12345.678)).toBe('12,345.7');
  });

  it('appends a plain unit with a separating space', () => {
    expect(formatNumber(42, 'kg')).toBe('42 kg');
  });

  it('appends percent units without a space', () => {
    expect(formatNumber(7.5, '%')).toBe('7.5%');
  });
});

describe('KpiCard', () => {
  const baseKpi: KpiCardData = {
    key: 'deliveries',
    label: 'Deliveries',
    value: 1234,
    unit: 'kg',
    trend: 'UP',
    deltaPercent: 12.5,
  };

  it('renders the label and formatted value', () => {
    render(<KpiCard kpi={baseKpi} />);
    expect(screen.getByText('Deliveries')).toBeInTheDocument();
    expect(screen.getByText('1,234 kg')).toBeInTheDocument();
    expect(screen.getByText(/12.5% vs previous/)).toBeInTheDocument();
  });

  it('omits the delta line when there is no delta', () => {
    render(<KpiCard kpi={{ ...baseKpi, trend: 'FLAT', deltaPercent: null }} />);
    expect(screen.queryByText(/vs previous/)).not.toBeInTheDocument();
  });
});
