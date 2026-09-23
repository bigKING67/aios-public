export interface AuthUser {
  id: string | number;
  username: string;
  email: string;
  full_name?: string;
  roles?: string[];
  is_active: boolean;
  created_at?: string;
}
