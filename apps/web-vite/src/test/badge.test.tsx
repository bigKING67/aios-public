import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge } from '@/components/atoms/badge';

describe('Badge', () => {
  it('maps semantic danger status to the shared danger class', () => {
    render(<Badge status="danger">Blocked</Badge>);

    expect(screen.getByText('Blocked')).toHaveClass('status-badge-danger');
  });

  it('keeps caller classes without dropping the base badge class', () => {
    render(
      <Badge className="campaign-status" status="success">
        Ready
      </Badge>,
    );

    expect(screen.getByText('Ready')).toHaveClass(
      'status-badge',
      'status-badge-success',
      'campaign-status',
    );
  });
});
