export interface AuditLog {
  id: number;
  module?: string;
  action?: string;
  resource_type?: string;
  resource_id?: string | number;
  username?: string;
  operator?: string;
  success?: boolean;
  status?: string;
  ip_address?: string;
  user_agent?: string;
  detail?: string;
  created_at?: string;
}

export interface AuditFilters {
  module?: string;
  action?: string;
  keyword?: string;
}
