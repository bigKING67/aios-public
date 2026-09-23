export interface User {
  id: string | number;
  username: string;
  email: string;
  full_name?: string;
  is_active: boolean;
  created_at: string;
}

export interface RoleOption {
  id: string | number;
  code: string;
  name: string;
  is_active?: boolean;
}

export interface UserRoleItem {
  id: string | number;
  code: string;
  name: string;
  is_active?: boolean;
}

export interface UserFormValues {
  username?: string;
  password?: string;
  email?: string;
  full_name?: string;
}
