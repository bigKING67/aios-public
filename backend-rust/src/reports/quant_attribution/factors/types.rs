pub(in crate::reports::quant_attribution) struct FactorRow {
    pub(in crate::reports::quant_attribution) factor_key: &'static str,
    pub(in crate::reports::quant_attribution) factor_label: &'static str,
    pub(in crate::reports::quant_attribution) curr_value: f64,
    pub(in crate::reports::quant_attribution) prev_value: f64,
    pub(in crate::reports::quant_attribution) ln_contribution: f64,
}
