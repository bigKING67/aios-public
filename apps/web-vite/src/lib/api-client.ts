/**
 * API 客户端兼容层
 *
 * 统一请求治理链路到 `apps/web-vite/src/lib/request.ts`，避免 refresh / 错误归一逻辑分叉。
 * 该文件仅保留历史导出名，供存量调用方平滑迁移。
 */

import {
  APIError,
  apiClient as requestClient,
  type RequestClient,
  type RequestResponse,
  type RequestTransportError,
} from './request';

export class ApiClientError extends APIError {
  constructor(
    code: string,
    status: number,
    message: string,
    originalError?: RequestTransportError
  ) {
    super(code, status, message, originalError);
    this.name = 'ApiClientError';
  }

  get status(): number {
    return this.statusCode;
  }
}

export type ApiResponse<T = unknown> = RequestResponse<T>;

export interface ApiError {
  detail?: string;
  message?: string;
}

export const apiClient: RequestClient = requestClient;

export default apiClient;
