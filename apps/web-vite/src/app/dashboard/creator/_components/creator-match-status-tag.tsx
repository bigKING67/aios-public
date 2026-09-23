'use client';

import { Tag } from 'antd';
import { resolveCreatorMatchStatusTagMeta, type CreatorMatchStatusTagMeta } from './creator-ui-utils';

export interface CreatorMatchStatusTagProps {
  value: string;
  statusMap: Readonly<Record<string, CreatorMatchStatusTagMeta>>;
  fallback: CreatorMatchStatusTagMeta;
}

export function CreatorMatchStatusTag({ value, statusMap, fallback }: CreatorMatchStatusTagProps) {
  const tag = resolveCreatorMatchStatusTagMeta(value, statusMap, fallback);
  return <Tag color={tag.color}>{tag.label}</Tag>;
}
