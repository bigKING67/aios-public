//! Business-defined equivalence for replacement and repeat budgets. Keep the
//! actual source labels in frozen clips; normalization is only for comparison.

pub(super) fn group(key: &str) -> &str {
    match key {
        "star_endorsement" | "kol_endorsement" => "public_endorsement",
        other => other,
    }
}

pub(super) fn same_sequence(left: &[String], right: &[String]) -> bool {
    left.iter()
        .map(|key| group(key))
        .eq(right.iter().map(|key| group(key)))
}

/// Varied fills may change effects, but cannot trade an expert endorsement for
/// a star/KOL endorsement, or the other way round. Existing matching categories
/// remain matched before considering the remaining changes.
pub(super) fn compatible_swap(reference: &[String], candidate: &[String]) -> bool {
    let count =
        |keys: &[String], category: &str| keys.iter().filter(|key| group(key) == category).count();
    let (rp, cp) = (
        count(reference, "public_endorsement"),
        count(candidate, "public_endorsement"),
    );
    let (re, ce) = (
        count(reference, "expert_endorsement"),
        count(candidate, "expert_endorsement"),
    );
    !(rp > cp && ce > re || re > ce && cp > rp)
}
