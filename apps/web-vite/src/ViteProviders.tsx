import type { ReactNode } from 'react';
import { App as AntdApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/react-query';
import { FilterProvider } from '@/context/filter-context';
import { aiosBrandTheme } from '@/theme/ant-theme';
import { AuthSessionBridgeInstaller } from '@/components/auth-session-bridge-installer';
import { AuthSessionBootstrap } from '@/components/auth-session-bootstrap';

interface ViteProvidersProps {
  children: ReactNode;
}

export function ViteProviders({ children }: ViteProvidersProps) {
  return (
    <ConfigProvider locale={zhCN} theme={aiosBrandTheme}>
      <AntdApp>
        <QueryClientProvider client={queryClient}>
          <AuthSessionBridgeInstaller />
          <AuthSessionBootstrap />
          <FilterProvider>{children}</FilterProvider>
        </QueryClientProvider>
      </AntdApp>
    </ConfigProvider>
  );
}
