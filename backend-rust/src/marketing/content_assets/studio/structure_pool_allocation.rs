//! Deterministic, capped allocation. Capacity shortages never relax the per-structure cap.
use std::collections::BTreeMap;

pub(super) type WeightedStructure = (Vec<String>, f64);

#[derive(Debug)]
pub(super) struct Share {
    pub(super) labels: Vec<String>,
    pub(super) weight: f64,
    pub(super) competitor: bool,
    pub(super) ours: bool,
}

pub(super) fn merge(
    competitor: Vec<WeightedStructure>,
    ours: Vec<WeightedStructure>,
) -> Vec<Share> {
    let mut merged: BTreeMap<Vec<String>, Share> = BTreeMap::new();
    for (is_ours, input) in [(false, competitor), (true, ours)] {
        let mut normalized = BTreeMap::<Vec<String>, f64>::new();
        for (mut labels, weight) in input {
            labels.dedup();
            if !labels.is_empty() && weight.is_finite() && weight > 0.0 {
                *normalized.entry(labels).or_default() += weight;
            }
        }
        let mut top: Vec<_> = normalized.into_iter().collect();
        top.sort_by(|a, b| b.1.total_cmp(&a.1).then(a.0.cmp(&b.0)));
        top.truncate(5);
        let sum: f64 = top.iter().map(|row| row.1).sum();
        for (labels, weight) in top {
            let row = merged.entry(labels.clone()).or_insert(Share {
                labels,
                weight: 0.0,
                competitor: false,
                ours: false,
            });
            row.weight += weight / sum;
            if is_ours {
                row.ours = true;
            } else {
                row.competitor = true;
            }
        }
    }
    let mut rows: Vec<_> = merged.into_values().collect();
    let sum: f64 = rows.iter().map(|r| r.weight).sum();
    for row in &mut rows {
        row.weight /= sum;
    }
    rows.sort_by(|a, b| b.weight.total_cmp(&a.weight).then(a.labels.cmp(&b.labels)));
    rows
}

/// Continuous capped proportional allocation, rounded with residue assigned by weight order.
pub(super) fn allocate(
    rows: &[Share],
    capacities: &[usize],
    total: usize,
    cap: usize,
) -> Vec<usize> {
    assert_eq!(rows.len(), capacities.len());
    let limits: Vec<usize> = capacities.iter().map(|c| (*c).min(cap)).collect();
    let target = total.min(limits.iter().sum());
    let mut quotas = vec![0.0; rows.len()];
    let mut active: Vec<usize> = (0..rows.len())
        .filter(|&i| limits[i] > 0 && rows[i].weight > 0.0)
        .collect();
    let mut remaining = target as f64;
    while !active.is_empty() && remaining > 0.0 {
        let sum: f64 = active.iter().map(|&i| rows[i].weight).sum();
        let capped: Vec<usize> = active
            .iter()
            .copied()
            .filter(|&i| remaining * rows[i].weight / sum >= limits[i] as f64)
            .collect();
        if capped.is_empty() {
            for &i in &active {
                quotas[i] = remaining * rows[i].weight / sum;
            }
            break;
        }
        for &i in &capped {
            quotas[i] = limits[i] as f64;
            remaining -= quotas[i];
        }
        active.retain(|i| !capped.contains(i));
    }
    let mut result: Vec<usize> = quotas
        .iter()
        .enumerate()
        .map(|(i, q)| (q.round() as usize).min(limits[i]))
        .collect();
    let mut order: Vec<usize> = (0..rows.len()).collect();
    order.sort_by(|&a, &b| {
        rows[b]
            .weight
            .total_cmp(&rows[a].weight)
            .then(rows[a].labels.cmp(&rows[b].labels))
    });
    while result.iter().sum::<usize>() < target {
        let Some(&i) = order.iter().find(|&&i| result[i] < limits[i]) else {
            break;
        };
        result[i] += 1;
    }
    while result.iter().sum::<usize>() > target {
        let Some(&i) = order.iter().find(|&&i| result[i] > 0) else {
            break;
        };
        result[i] -= 1;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    fn weighted(keys: &[&str], weights: &[f64]) -> Vec<WeightedStructure> {
        keys.iter()
            .zip(weights)
            .map(|(key, w)| (vec![key.to_string()], *w))
            .collect()
    }
    #[test]
    fn documented_example_caps_and_conserves_total() {
        let rows = merge(
            weighted(&["a", "b", "c", "d", "e"], &[30., 20., 15., 10., 5.]),
            weighted(&["f", "a", "g", "h", "i"], &[40., 25., 15., 12., 8.]),
        );
        assert_eq!(rows.len(), 9);
        assert!((rows[0].weight - 0.3125).abs() < 1e-10);
        assert!(rows[0].ours && rows[0].competitor);
        let counts = allocate(&rows, &vec![100; rows.len()], 100, 30);
        assert_eq!(counts[0], 30);
        assert_eq!(counts.iter().sum::<usize>(), 100);
        assert!(counts.iter().all(|c| *c <= 30));
    }
    #[test]
    fn shortage_and_rounding_never_exceed_capacity() {
        let rows = merge(weighted(&["a", "b", "c"], &[1., 1., 1.]), vec![]);
        assert_eq!(allocate(&rows, &[100, 100, 100], 100, 30), vec![30, 30, 30]);
        assert_eq!(allocate(&rows, &[2, 100, 100], 100, 30), vec![2, 30, 30]);
        assert_eq!(allocate(&rows, &[100, 100, 100], 10, 10), vec![4, 3, 3]);
        assert!(allocate(&[], &[], 100, 30).is_empty());
    }
    #[test]
    fn merges_adjacent_labels_and_uses_top_five_per_side() {
        let mut input = weighted(&["a", "b", "c", "d", "e", "f"], &[6., 5., 4., 3., 2., 1.]);
        input.push((vec!["a".into(), "a".into()], 1.));
        let rows = merge(input, vec![]);
        assert_eq!(rows.len(), 5);
        assert_eq!(rows[0].labels, vec!["a"]);
        assert!((rows.iter().map(|r| r.weight).sum::<f64>() - 1.).abs() < 1e-10);
    }
}
