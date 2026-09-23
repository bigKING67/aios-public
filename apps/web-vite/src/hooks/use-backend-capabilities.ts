/**
 * 后端能力探测 Hook
 *
 * 用于判定当前 API 网关是否提供「管理模块」相关接口。
 * 通过轻量探测 /api/users|roles|permissions|audit-logs 四个代理接口，
 * 返回模块级能力，避免一个接口异常导致所有管理页面被连带降级。
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { buildApiGatewayPath } from '@/lib/api-gateway';
import { asRecord } from '@/lib/unknown-data';

export interface BackendCapabilities {
  backendName: string;
  supportsAdminApis: boolean;
  modules: {
    users: boolean;
    roles: boolean;
    permissions: boolean;
    auditLogs: boolean;
  };
}

const DEFAULT_CAPABILITIES: BackendCapabilities = {
  backendName: 'unknown',
  supportsAdminApis: false,
  modules: {
    users: false,
    roles: false,
    permissions: false,
    auditLogs: false,
  },
};

function resolveBackendName(payload: unknown): string {
  const record = asRecord(payload);
  const rawName = record?.name;
  if (typeof rawName !== 'string') {
    return '';
  }

  return rawName.trim();
}

function resolveProbeStatusByHttpStatus(status: number): boolean {
  if (status === 404) {
    return false;
  }

  // 5xx 表示后端当前不可用，不应视为“支持管理接口”。
  if (status >= 500) {
    return false;
  }

  if (status >= 200 && status < 400) {
    return true;
  }

  // 401/403 与其他 4xx（非 404）代表接口存在但本次请求不满足条件。
  return status >= 400;
}

async function probeCapability(pathWithQuery: string): Promise<boolean> {
  try {
    const response = await fetch(pathWithQuery, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'include',
    });
    return resolveProbeStatusByHttpStatus(response.status);
  } catch {
    // 无法拿到 HTTP 响应（网络中断/网关故障等）时，按不支持处理，避免页面持续报错。
    return false;
  }
}

async function probeAdminApis(): Promise<BackendCapabilities['modules']> {
  const [users, roles, permissions, auditLogs] = await Promise.all([
    probeCapability(buildApiGatewayPath('/users?page=1&page_size=1')),
    probeCapability(buildApiGatewayPath('/roles')),
    probeCapability(buildApiGatewayPath('/permissions?grouped=false')),
    probeCapability(buildApiGatewayPath('/audit-logs?page=1&page_size=1')),
  ]);

  return {
    users,
    roles,
    permissions,
    auditLogs,
  };
}

export function useBackendCapabilities() {
  return useQuery({
    queryKey: ['backend', 'capabilities'],
    queryFn: async (): Promise<BackendCapabilities> => {
      const modules = await probeAdminApis();
      const supportsAdminApis = Object.values(modules).some(Boolean);
      let backendName = DEFAULT_CAPABILITIES.backendName;

      try {
        const response = await fetch(buildApiGatewayPath('/'), {
          method: 'GET',
          cache: 'no-store',
          credentials: 'include',
        });
        if (response.ok) {
          const payload = (await response.json()) as unknown;
          backendName = resolveBackendName(payload) || backendName;
        }
      } catch {
        // keep fallback
      }

      return {
        backendName,
        supportsAdminApis,
        modules,
      };
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 0,
  });
}
