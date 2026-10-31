import { Button, Tooltip } from '@lobehub/ui';
import { RotateCw } from 'lucide-react';

/**
 * The list refresh beside a section title: a quiet icon button (named 刷新 for screen readers and
 * the tooltip) instead of a bordered text button on every list.
 */
export function RefreshButton({ onRefresh, loading }: { onRefresh: () => void; loading: boolean }) {
  return (
    <Tooltip title="刷新">
      <Button
        size="small"
        type="text"
        aria-label="刷新"
        icon={<RotateCw size={14} strokeWidth={1.8} aria-hidden="true" />}
        loading={loading}
        onClick={onRefresh}
      />
    </Tooltip>
  );
}
