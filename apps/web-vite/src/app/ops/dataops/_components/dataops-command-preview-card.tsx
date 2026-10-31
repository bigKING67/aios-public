'use client';

import { Button } from '@lobehub/ui';
import { Copy } from 'lucide-react';
import { DATAOPS_ICON_PROPS } from './dataops-icon-props';
import commandStyles from './dataops-command-modal.module.css';

interface DataOpsCommandPreviewCardProps {
  title: string;
  command: string;
  copyLabel: string;
  onCopy: (text: string, label: string) => Promise<void>;
}

export function DataOpsCommandPreviewCard({
  title,
  command,
  copyLabel,
  onCopy,
}: DataOpsCommandPreviewCardProps) {
  return (
    <div className={commandStyles.commandCard}>
      <div className={commandStyles.commandCardHead}>
        <h4>{title}</h4>
        <Button
          size="small"
          icon={<Copy {...DATAOPS_ICON_PROPS} />}
          onClick={() => {
            void onCopy(command, copyLabel);
          }}
        >
          复制
        </Button>
      </div>
      <pre className={commandStyles.commandCode}>{command}</pre>
    </div>
  );
}
