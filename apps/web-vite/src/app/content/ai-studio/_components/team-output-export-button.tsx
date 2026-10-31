import { Button, DropdownMenu, toast } from '@lobehub/ui';
import { ChevronDown, Download } from 'lucide-react';
import { useState } from 'react';
import {
  downloadTeamOutputExport,
  teamOutputErrorText,
  type StudioTeamOutputQuery,
  type TeamOutputExportKind,
} from '../_lib/team-output';

const OPTIONS: readonly { key: TeamOutputExportKind; label: string; title: string }[] = [
  { key: 'summary', label: '导出汇总', title: '团队、小组、人员三层的指标，不受页面收起影响' },
  { key: 'videos', label: '导出成片明细', title: '每条成片一行；编导视角下多位编导的成片在每位编导下各占一行' },
];

/**
 * A secondary action at the table's end: the page's filters as XLSX. The file comes from the server, so
 * folded groups never narrow it and a month of 成片 rows does not block the page.
 */
export function TeamOutputExportButton({ query, personKey }: { query: StudioTeamOutputQuery; personKey?: string }) {
  const [busy, setBusy] = useState(false);
  const run = async (kind: TeamOutputExportKind) => {
    if (busy) return;
    setBusy(true);
    try {
      await downloadTeamOutputExport(query, kind, personKey);
    } catch (error) {
      toast.error(`导出失败：${teamOutputErrorText(error)}`);
    } finally {
      setBusy(false);
    }
  };
  // A person's drawer exports that person's 成片 only; the table offers both files.
  if (personKey) {
    return (
      <Button
        size="small"
        loading={busy}
        icon={<Download size={14} strokeWidth={1.8} aria-hidden="true" />}
        onClick={() => void run('videos')}
      >
        导出明细
      </Button>
    );
  }
  return (
    <DropdownMenu
      items={OPTIONS.map((option) => ({
        key: option.key,
        label: option.label,
        title: option.title,
        disabled: busy,
        onClick: () => void run(option.key),
      }))}
      placement="bottomRight"
    >
      <Button size="small" loading={busy} icon={<Download size={14} strokeWidth={1.8} aria-hidden="true" />}>
        导出
        <ChevronDown size={14} strokeWidth={1.8} aria-hidden="true" />
      </Button>
    </DropdownMenu>
  );
}
