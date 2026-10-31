import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AuthSessionBootstrap } from '@/components/auth-session-bootstrap';
import { AuthSessionBridgeInstaller } from '@/components/auth-session-bridge-installer';
import { LobeProvider } from '@/components/lobe-provider';
import { FilterProvider } from '@/context/filter-context';
import { queryClient } from '@/lib/react-query';

interface ViteProvidersProps {
  children: ReactNode;
}

export function ViteProviders({ children }: ViteProvidersProps) {
  return (
    <LobeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthSessionBridgeInstaller />
        <AuthSessionBootstrap />
        <FilterProvider>{children}</FilterProvider>
      </QueryClientProvider>
    </LobeProvider>
  );
}
