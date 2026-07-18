import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import VerificationPage from './page';

describe('verification page', () => {
  it('accepts and displays a public ID route parameter', async () => {
    render(
      await VerificationPage({ params: Promise.resolve({ publicId: 'coffee-lot-public-42' }) }),
    );
    expect(screen.getByText('coffee-lot-public-42')).toBeInTheDocument();
  });
});
