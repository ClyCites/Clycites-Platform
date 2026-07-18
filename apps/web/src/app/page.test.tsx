import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import HomePage from './page';

describe('landing page', () => {
  it('renders the product identity', () => {
    render(<HomePage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'ClyCites Verifiable Agriculture Platform',
    );
  });
});
