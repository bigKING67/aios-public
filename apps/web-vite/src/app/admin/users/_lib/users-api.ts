import { apiClient } from '@/lib/api-client';
import {
  AIOS_API_PATHS,
  type CreateUserRequest,
  type RoleListResponse,
  type UpdateUserRequest,
  type UpdateUserRolesRequest,
  type UserAdminResponse,
  type UserListResponse,
  type UserMessageResponse,
  type UserRoleListResponse,
} from '@/lib/generated-api-contract';
import { parseListPayload } from '@/lib/list-payload';
import type { RoleOption, User, UserFormValues, UserRoleItem } from './users-types';

export type CreateUserPayload = UserFormValues & {
  username: string;
  password: string;
  email: string;
};

export interface UpdateUserRolesInput {
  userId: string | number;
  roleIds: string[];
}

export const usersQueryKeys = {
  list: () => ['users'] as const,
  roleOptions: () => ['admin', 'roles', 'user-assignment'] as const,
  userRoles: (userId: string | number | undefined) => ['users', userId, 'roles'] as const,
};

export async function fetchUsers() {
  const response = await apiClient.get<UserListResponse>(AIOS_API_PATHS.users);
  return parseListPayload<User>(response.data);
}

export async function fetchRoleOptions() {
  const response = await apiClient.get<RoleListResponse>(AIOS_API_PATHS.roles);
  return parseListPayload<RoleOption>(response.data);
}

export async function fetchUserRoles(userId: string | number) {
  const response = await apiClient.get<UserRoleListResponse>(AIOS_API_PATHS.userRoles(userId));
  return parseListPayload<UserRoleItem>(response.data);
}

export async function createUser(values: CreateUserPayload) {
  const request: CreateUserRequest = values;
  const response = await apiClient.post<UserAdminResponse>(AIOS_API_PATHS.authRegister, request);
  return response.data;
}

export async function updateUser(userId: string | number, values: UserFormValues) {
  const request: UpdateUserRequest = {
    ...(values.email !== undefined ? { email: values.email } : {}),
    ...(values.full_name !== undefined ? { full_name: values.full_name } : {}),
  };
  const response = await apiClient.put<UserAdminResponse>(AIOS_API_PATHS.user(userId), request);
  return response.data;
}

export async function deleteUser(userId: string | number) {
  await apiClient.delete<UserMessageResponse>(AIOS_API_PATHS.user(userId));
}

export async function updateUserRoles(input: UpdateUserRolesInput) {
  const request: UpdateUserRolesRequest = {
    role_ids: input.roleIds,
  };
  const response = await apiClient.put<UserRoleListResponse>(
    AIOS_API_PATHS.userRoles(input.userId),
    request,
  );
  return parseListPayload<UserRoleItem>(response.data);
}
