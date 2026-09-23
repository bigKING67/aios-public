'use client';

import { CreatorIdText } from './creator-id-text';
import { CreatorNumericText } from './creator-numeric-text';
import { CreatorStatusDescText } from './creator-status-desc-text';

export function renderCreatorIdText(value?: string | null) {
  return <CreatorIdText value={value} />;
}

export function renderCreatorNumericText(value?: string | null) {
  return <CreatorNumericText value={value} />;
}

export function renderCreatorStatusDescText(value?: string | null) {
  return <CreatorStatusDescText value={value} />;
}
