import { useCallback, useEffect, useState } from 'react';
import type { DocsWorkspaceSnapshot } from './docs-workspace-contracts';
import { loadDocsWorkspaceSnapshot } from './docs-workspace-loader';

type DocsWorkspaceSnapshotState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; snapshot: DocsWorkspaceSnapshot };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '文档内容加载失败';
}

export function useDocsWorkspaceSnapshot(): {
  retry: () => void;
  state: DocsWorkspaceSnapshotState;
} {
  const [retryKey, setRetryKey] = useState(0);
  const [state, setState] = useState<DocsWorkspaceSnapshotState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({ status: 'loading' });

    void loadDocsWorkspaceSnapshot(controller.signal).then(
      (snapshot) => {
        if (active) {
          setState({ status: 'ready', snapshot });
        }
      },
      (error) => {
        if (active && !controller.signal.aborted) {
          setState({ status: 'error', message: errorMessage(error) });
        }
      },
    );

    return () => {
      active = false;
      controller.abort();
    };
  }, [retryKey]);

  const retry = useCallback(() => {
    setRetryKey((current) => current + 1);
  }, []);

  return { retry, state };
}
