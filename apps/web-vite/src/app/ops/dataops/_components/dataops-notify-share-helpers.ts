import {
  buildDataOpsNotifyShareUrl,
  type DataOpsNotifyFilterState,
} from './dataops-query-helpers';

function getDataOpsBrowserOrigin(): string | undefined {
  return typeof window !== 'undefined' ? window.location.origin : undefined;
}

export async function copyDataOpsNotifyShareUrl(options: {
  currentSearchParams: URLSearchParams;
  pathname: string;
  filters: DataOpsNotifyFilterState;
  copyText: (text: string, label: string) => Promise<void>;
  label: string;
  retryGroupId?: string;
}): Promise<void> {
  const fullUrl = buildDataOpsNotifyShareUrl({
    currentSearchParams: options.currentSearchParams,
    pathname: options.pathname,
    filters: options.filters,
    retryGroupId: options.retryGroupId,
    origin: getDataOpsBrowserOrigin(),
  });

  await options.copyText(fullUrl, options.label);
}
