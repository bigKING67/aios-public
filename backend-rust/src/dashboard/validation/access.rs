use super::super::access::has_any_role;
use crate::auth::CurrentUser;

fn is_super_admin_by_role(roles: &[String]) -> bool {
    has_any_role(roles, &["super_admin", "super-admin", "superadmin"])
}

pub(in crate::dashboard) fn can_access_admin_by_role(roles: &[String]) -> bool {
    is_super_admin_by_role(roles) || has_any_role(roles, &["admin"])
}

pub(in crate::dashboard) fn can_access_creator_dashboard_by_role(roles: &[String]) -> bool {
    is_super_admin_by_role(roles)
        || has_any_role(
            roles,
            &[
                "admin",
                "operator",
                "ops",
                "dashboard_view",
                "dashboard-view",
                "dashboardview",
                "bd",
                "bd_manager",
                "bd-manager",
                "bdmanager",
            ],
        )
}

pub(in crate::dashboard) fn can_access_creator_shortvideo_dashboard(
    current_user: &CurrentUser,
) -> bool {
    current_user.is_admin()
        || can_access_creator_dashboard_by_role(&current_user.roles)
        || has_any_role(
            &current_user.roles,
            &[
                "content_ops",
                "content-ops",
                "contentops",
                "content_ops_manager",
                "content-ops-manager",
                "contentopsmanager",
            ],
        )
        || has_any_permission(
            current_user,
            &[
                "marketing:content_assets:write",
                "marketing:content_assets:manage",
            ],
        )
}

pub(in crate::dashboard) fn can_access_industry_material_inspiration_dashboard(
    current_user: &CurrentUser,
) -> bool {
    current_user.is_admin()
        || has_any_role(
            &current_user.roles,
            &[
                "content_ops",
                "content-ops",
                "contentops",
                "content_ops_manager",
                "content-ops-manager",
                "contentopsmanager",
            ],
        )
        || has_any_permission(
            current_user,
            &[
                "marketing:content_assets:write",
                "marketing:content_assets:manage",
            ],
        )
}

pub(in crate::dashboard) fn can_manage_creator_shortvideo_manual_attrs_by_role(
    roles: &[String],
) -> bool {
    can_access_admin_by_role(roles)
}

pub(in crate::dashboard) fn can_manage_creator_shortvideo_manual_attrs(
    current_user: &CurrentUser,
) -> bool {
    current_user.is_admin()
        || can_manage_creator_shortvideo_manual_attrs_by_role(&current_user.roles)
        || has_any_role(
            &current_user.roles,
            &[
                "content_ops_manager",
                "content-ops-manager",
                "contentopsmanager",
            ],
        )
        || current_user.has_permission("marketing:content_assets:manage")
}

pub(in crate::dashboard) fn can_access_admin(current_user: &CurrentUser) -> bool {
    current_user.is_admin()
}

pub(in crate::dashboard) fn can_write_dashboard_notes(current_user: &CurrentUser) -> bool {
    current_user.is_admin() || has_any_role(&current_user.roles, &["operator", "ops"])
}

fn has_any_permission(current_user: &CurrentUser, candidates: &[&str]) -> bool {
    candidates
        .iter()
        .any(|candidate| current_user.has_permission(candidate))
}

#[cfg(test)]
mod tests {
    use super::{
        can_access_admin, can_access_creator_dashboard_by_role,
        can_access_creator_shortvideo_dashboard,
        can_access_industry_material_inspiration_dashboard,
        can_manage_creator_shortvideo_manual_attrs,
        can_manage_creator_shortvideo_manual_attrs_by_role, can_write_dashboard_notes,
    };
    use crate::auth::CurrentUser;

    fn roles(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_string()).collect()
    }

    fn user(roles: &[&str], permissions: &[&str]) -> CurrentUser {
        CurrentUser {
            user_id: "user-001".to_string(),
            username: Some("测试用户".to_string()),
            roles: roles.iter().map(|value| (*value).to_string()).collect(),
            permissions: permissions
                .iter()
                .map(|value| (*value).to_string())
                .collect(),
        }
    }

    #[test]
    fn creator_shortvideo_manual_attrs_manage_scope_excludes_dashboard_view_and_bd() {
        let viewer_roles = roles(&["dashboard_view"]);
        assert!(can_access_creator_dashboard_by_role(&viewer_roles));

        let bd_roles = roles(&["bd"]);
        assert!(!can_manage_creator_shortvideo_manual_attrs_by_role(
            &bd_roles
        ));

        let admin_roles = roles(&["admin"]);
        assert!(can_manage_creator_shortvideo_manual_attrs_by_role(
            &admin_roles
        ));
    }

    #[test]
    fn creator_shortvideo_dashboard_access_includes_content_asset_collaborators() {
        let viewer = user(&["dashboard_view"], &[]);
        assert!(can_access_creator_shortvideo_dashboard(&viewer));

        let content_ops = user(&["content_ops"], &[]);
        assert!(can_access_creator_shortvideo_dashboard(&content_ops));
        assert!(!can_manage_creator_shortvideo_manual_attrs(&content_ops));

        let content_reader = user(&[], &["marketing:content_assets:read"]);
        assert!(!can_access_creator_shortvideo_dashboard(&content_reader));
        assert!(!can_manage_creator_shortvideo_manual_attrs(&content_reader));

        let content_writer = user(&[], &["marketing:content_assets:write"]);
        assert!(can_access_creator_shortvideo_dashboard(&content_writer));
        assert!(!can_manage_creator_shortvideo_manual_attrs(&content_writer));
    }

    #[test]
    fn creator_shortvideo_manual_attrs_manage_includes_content_asset_managers() {
        let manager = user(&["content_ops_manager"], &[]);
        assert!(can_access_creator_shortvideo_dashboard(&manager));
        assert!(can_manage_creator_shortvideo_manual_attrs(&manager));

        let permission_manager = user(&[], &["marketing:content_assets:manage"]);
        assert!(can_access_creator_shortvideo_dashboard(&permission_manager));
        assert!(can_manage_creator_shortvideo_manual_attrs(
            &permission_manager
        ));
    }

    #[test]
    fn industry_material_inspiration_access_is_limited_to_content_ops_scope() {
        let dashboard_viewer = user(&["dashboard_view"], &[]);
        assert!(!can_access_industry_material_inspiration_dashboard(
            &dashboard_viewer
        ));

        let content_ops = user(&["content_ops"], &[]);
        assert!(can_access_industry_material_inspiration_dashboard(
            &content_ops
        ));

        let content_reader = user(&[], &["marketing:content_assets:read"]);
        assert!(!can_access_industry_material_inspiration_dashboard(
            &content_reader
        ));

        let content_writer = user(&[], &["marketing:content_assets:write"]);
        assert!(can_access_industry_material_inspiration_dashboard(
            &content_writer
        ));

        let manager = user(&["content_ops_manager"], &[]);
        assert!(can_access_industry_material_inspiration_dashboard(&manager));
    }

    #[test]
    fn admin_role_gets_admin_level_dashboard_access() {
        let super_admin = CurrentUser {
            user_id: "user-operator".to_string(),
            username: Some("operator".to_string()),
            roles: vec!["admin".to_string()],
            permissions: Vec::new(),
        };

        assert!(can_access_admin(&super_admin));
        assert!(can_access_creator_shortvideo_dashboard(&super_admin));
        assert!(can_access_industry_material_inspiration_dashboard(
            &super_admin
        ));
        assert!(can_manage_creator_shortvideo_manual_attrs(&super_admin));
        assert!(can_write_dashboard_notes(&super_admin));
    }
}
