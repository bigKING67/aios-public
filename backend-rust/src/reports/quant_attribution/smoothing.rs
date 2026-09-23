pub(super) fn ln_ratio_with_smoothing(current: f64, previous: f64, smoothing: f64) -> f64 {
    let smooth = if smoothing.is_finite() && smoothing > 0.0 {
        smoothing
    } else {
        1e-6
    };
    let curr = (current + smooth).max(smooth);
    let prev = (previous + smooth).max(smooth);
    (curr / prev).ln()
}
