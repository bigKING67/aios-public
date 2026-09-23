export interface PermissionItem {
  id?: number;
  code: string;
  name?: string;
  display_name?: string;
  module?: string;
  action?: string;
  resource_type?: string;
  description?: string;
  is_active?: boolean;
}
