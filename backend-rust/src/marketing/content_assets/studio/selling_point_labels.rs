//! Business-defined equivalence for replacement and repeat budgets. Keep the
//! actual source labels in frozen clips; normalization is only for comparison.

pub(super) fn group(key: &str) -> &str {
    match key {
        "star_endorsement" | "kol_endorsement" => "public_endorsement",
        other => other,
    }
}

/// Same points in a compatible order. Each inner list is one segment: a
/// sentence carrying several points has no internal order, so only the order
/// between segments on either side constrains the comparison. Points are
/// distinct within a slot, so a consistent order exists exactly when the
/// points can be peeled off in turn, each first on both sides.
pub(super) fn same_points(left: &[Vec<String>], right: &[Vec<String>]) -> bool {
    fn ranks(segments: &[Vec<String>]) -> Vec<(&str, usize)> {
        let mut ranks: Vec<_> = segments
            .iter()
            .enumerate()
            .flat_map(|(rank, keys)| keys.iter().map(move |key| (group(key), rank)))
            .collect();
        ranks.sort_unstable();
        ranks
    }
    let (left, right) = (ranks(left), ranks(right));
    if !left.iter().map(|r| r.0).eq(right.iter().map(|r| r.0))
        || left.windows(2).any(|pair| pair[0].0 == pair[1].0)
    {
        return false;
    }
    let mut rest: Vec<(usize, usize)> = left.iter().zip(&right).map(|(l, r)| (l.1, r.1)).collect();
    while !rest.is_empty() {
        let Some(first) =
            (0..rest.len()).find(|i| rest.iter().all(|o| o.0 >= rest[*i].0 && o.1 >= rest[*i].1))
        else {
            return false;
        };
        rest.swap_remove(first);
    }
    true
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

/// `prefix` can begin a fill of `target` with the same points in a compatible
/// order: its points are distinct target points, none of the remaining target
/// points must come before them, and they match the target restricted to them.
pub(super) fn extends_points(prefix: &[Vec<String>], target: &[Vec<String>]) -> bool {
    let used: Vec<&str> = prefix.iter().flatten().map(|key| group(key)).collect();
    let rank = |key: &str| {
        target
            .iter()
            .position(|keys| keys.iter().any(|k| group(k) == key))
    };
    let Some(used_ranks) = used.iter().map(|key| rank(key)).collect::<Option<Vec<_>>>() else {
        return false;
    };
    let first_rest = target
        .iter()
        .enumerate()
        .filter(|(_, keys)| keys.iter().any(|k| !used.contains(&group(k))))
        .map(|(index, _)| index)
        .min();
    if first_rest.is_some_and(|first| used_ranks.iter().any(|r| *r > first)) {
        return false;
    }
    let restricted: Vec<Vec<String>> = target
        .iter()
        .map(|keys| {
            keys.iter()
                .filter(|k| used.contains(&group(k)))
                .cloned()
                .collect::<Vec<_>>()
        })
        .filter(|keys| !keys.is_empty())
        .collect();
    same_points(prefix, &restricted)
}
