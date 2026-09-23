export interface Role {
  id: string | number;
  name: string;
  code?: string;
  description?: string;
  is_active?: boolean;
  created_at?: string;
  permissions_count?: number;
  user_count?: number;
  permissions?: Array<{ id: number; code: string }>;
}

export interface RoleFormValues {
  name: string;
  code?: string;
  description?: string;
  is_active: boolean;
}

export interface PermissionItem {
  id: number;
  code: string;
  module?: string;
  action?: string;
}
