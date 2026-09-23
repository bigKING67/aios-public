use super::super::super::PlatformData;

pub(super) fn apply_platform_contribution(items: &mut [PlatformData], total_gmv: f64) {
    if total_gmv <= 0.0 {
        return;
    }

    for item in items {
        item.contribution = item.gmv / total_gmv;
    }
}
