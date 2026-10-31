//! 爆款分析 · 框架结构排行, our side: the structures of our own originals, read from their confirmed
//! segments in the same scope as our selling-point coverage (current source, live asset, enterprise
//! tag; every product, since our originals carry no competitor category). The rules match the
//! competitor ranking (`competitor_analysis/structure_ranks.py`): a framework structure is the labels
//! in time order with adjacent repeats merged, a selling-point structure is the set of labels an
//! original states, in preset order. The unit is an original, not an opening family. Each structure also
//! carries its originals' 视频云管家 spend summed over the page's window (`cloud_video.spend_by_day`,
//! business decision D16), which ranks and compares our side.

use std::collections::{BTreeMap, HashMap};

use chrono::NaiveDate;
use sqlx::{PgPool, Row};

use super::{
    competitor_types::{OwnSpendDays, OwnStructureLane, OwnStructureRow, OwnStructures},
    domain::SELLING_POINT_DIMENSION,
    error::StudioResult,
    repository::db_error,
};

const FRAMEWORK_DIMENSION: &str = "framework";

// Labels of the active presets in preset order.
const LABELS_SELECT: &str = "SELECT p.dimension, x.label->>'key' AS key, x.label->>'name' AS name \
    FROM ads.content_segment_presets p \
    CROSS JOIN LATERAL jsonb_array_elements(p.labels) WITH ORDINALITY AS x(label, ordinal) \
    WHERE p.dimension = ANY($1) AND p.status = 'active' ORDER BY p.dimension, x.ordinal";

// Confirmed segments of the active presets' keys, in time order per original.
const SEGMENTS_SELECT: &str = "SELECT p.dimension, s.asset_id::TEXT AS asset_id, s.label_key, \
    s.additional_label_keys \
    FROM ads.content_segments s JOIN ads.marketing_content_assets a ON a.asset_id = s.asset_id \
    JOIN (SELECT DISTINCT preset_key, dimension FROM ads.content_segment_presets \
          WHERE dimension = ANY($1) AND status = 'active') p ON p.preset_key = s.preset_key \
    WHERE s.status = 'confirmed' AND a.is_deleted = FALSE \
      AND LOWER(TRIM(a.raw_sha256)) = s.source_content_hash \
      AND ($2::TEXT IS NULL OR $2 = ANY(a.tags)) AND ($3::TEXT IS NULL OR s.product_name = $3) \
    ORDER BY s.asset_id, s.start_ms, s.segment_id";

// Spend per original in the window (all synced days when unbounded); one original may hold several
// cloud videos when the vendor keeps the same file twice.
const SPEND_SELECT: &str = "SELECT v.asset_id::TEXT AS asset_id, SUM(d.spend)::FLOAT8 AS spend \
    FROM cloud_video.spend_by_day d JOIN cloud_video.videos v ON v.video_id = d.video_id \
    WHERE v.asset_id IS NOT NULL AND ($1::DATE IS NULL OR d.stat_date BETWEEN $1 AND $2) \
    GROUP BY v.asset_id";
const SYNCED_DAYS_SELECT: &str = "SELECT COUNT(DISTINCT stat_date) FROM cloud_video.spend_days \
    WHERE $1::DATE IS NULL OR stat_date BETWEEN $1 AND $2";

/// One confirmed segment, in time order within its original.
pub(super) struct OwnSegment {
    pub(super) asset_id: String,
    pub(super) label_key: String,
    pub(super) additional_label_keys: Vec<String>,
}

/// Rows of one lane, most originals first. `order`: the preset's label order for a selling-point set
/// (whose segments may state several labels); None for a framework sequence (its `label_key` only).
fn lane(
    segments: &[OwnSegment],
    order: Option<&[String]>,
    names: BTreeMap<String, String>,
    spend: &HashMap<String, f64>,
) -> OwnStructureLane {
    let mut per_asset: Vec<(&str, Vec<&str>)> = Vec::new();
    for segment in segments {
        let extra = if order.is_some() {
            segment.additional_label_keys.as_slice()
        } else {
            &[]
        };
        let keys =
            std::iter::once(segment.label_key.as_str()).chain(extra.iter().map(String::as_str));
        match per_asset.last_mut() {
            Some((asset, labels)) if *asset == segment.asset_id => labels.extend(keys),
            _ => per_asset.push((&segment.asset_id, keys.collect())),
        }
    }
    let spend_of = |asset: &str| spend.get(asset).copied().unwrap_or(0.0);
    let mut counts: HashMap<Vec<String>, (i64, f64)> = HashMap::new();
    for (asset, labels) in &per_asset {
        let structure: Vec<String> = match order {
            Some(order) => {
                let rank = |key: &str| {
                    order
                        .iter()
                        .position(|item| item == key)
                        .unwrap_or(order.len())
                };
                let mut set: Vec<&str> = labels.clone();
                set.sort_by(|a, b| rank(a).cmp(&rank(b)).then(a.cmp(b)));
                set.dedup();
                set.into_iter().map(str::to_string).collect()
            }
            None => {
                let mut merged: Vec<String> = Vec::new();
                for key in labels {
                    if merged.last().map(String::as_str) != Some(key) {
                        merged.push((*key).to_string());
                    }
                }
                merged
            }
        };
        let entry = counts.entry(structure).or_default();
        entry.0 += 1;
        entry.1 += spend_of(asset);
    }
    let mut rows: Vec<OwnStructureRow> = counts
        .into_iter()
        .map(|(labels, (assets, spend))| OwnStructureRow {
            labels,
            assets,
            spend,
        })
        .collect();
    rows.sort_by(|a, b| {
        b.assets
            .cmp(&a.assets)
            .then_with(|| a.labels.cmp(&b.labels))
    });
    OwnStructureLane {
        assets: i64::try_from(per_asset.len()).unwrap_or(i64::MAX),
        spend: per_asset.iter().map(|(asset, _)| spend_of(asset)).sum(),
        labels: names,
        rows,
    }
}

pub(super) fn own_structure_lanes(
    framework: &[OwnSegment],
    selling_points: &[OwnSegment],
    selling_point_order: &[String],
    names: &HashMap<&str, BTreeMap<String, String>>,
    spend: &HashMap<String, f64>,
    spend_days: OwnSpendDays,
) -> OwnStructures {
    OwnStructures {
        framework: lane(
            framework,
            None,
            names.get(FRAMEWORK_DIMENSION).cloned().unwrap_or_default(),
            spend,
        ),
        selling_point: lane(
            selling_points,
            Some(selling_point_order),
            names
                .get(SELLING_POINT_DIMENSION)
                .cloned()
                .unwrap_or_default(),
            spend,
        ),
        spend_days,
    }
}

pub(super) async fn own_structures(
    pool: &PgPool,
    enterprise_tag: Option<&str>,
    bounds: Option<(NaiveDate, NaiveDate)>,
) -> StudioResult<OwnStructures> {
    own_structures_for_product(pool, enterprise_tag, bounds, None).await
}

pub(super) async fn own_structures_for_product(
    pool: &PgPool,
    enterprise_tag: Option<&str>,
    bounds: Option<(NaiveDate, NaiveDate)>,
    product: Option<&str>,
) -> StudioResult<OwnStructures> {
    let dimensions = [FRAMEWORK_DIMENSION, SELLING_POINT_DIMENSION];
    let mut names: HashMap<&str, BTreeMap<String, String>> = HashMap::new();
    let mut order: Vec<String> = Vec::new();
    for row in sqlx::query(LABELS_SELECT)
        .bind(&dimensions[..])
        .fetch_all(pool)
        .await
        .map_err(db_error)?
    {
        let dimension: String = row.get("dimension");
        let (Some(key), name) = (
            row.get::<Option<String>, _>("key"),
            row.get::<Option<String>, _>("name"),
        ) else {
            continue;
        };
        let lane = if dimension == FRAMEWORK_DIMENSION {
            FRAMEWORK_DIMENSION
        } else {
            SELLING_POINT_DIMENSION
        };
        if lane == SELLING_POINT_DIMENSION && !order.contains(&key) {
            order.push(key.clone());
        }
        names
            .entry(lane)
            .or_default()
            .insert(key.clone(), name.unwrap_or(key));
    }
    let (mut framework, mut selling_points) = (Vec::new(), Vec::new());
    for row in sqlx::query(SEGMENTS_SELECT)
        .bind(&dimensions[..])
        .bind(enterprise_tag)
        .bind(product)
        .fetch_all(pool)
        .await
        .map_err(db_error)?
    {
        let dimension: String = row.get("dimension");
        let segment = OwnSegment {
            asset_id: row.get("asset_id"),
            label_key: row.get("label_key"),
            additional_label_keys: row
                .get::<Option<Vec<String>>, _>("additional_label_keys")
                .unwrap_or_default(),
        };
        if dimension == FRAMEWORK_DIMENSION {
            framework.push(segment);
        } else {
            selling_points.push(segment);
        }
    }
    let (first, last) = (bounds.map(|(first, _)| first), bounds.map(|(_, last)| last));
    let spend: HashMap<String, f64> = sqlx::query(SPEND_SELECT)
        .bind(first)
        .bind(last)
        .fetch_all(pool)
        .await
        .map_err(db_error)?
        .into_iter()
        .map(|row| (row.get("asset_id"), row.get("spend")))
        .collect();
    let synced: i64 = sqlx::query_scalar(SYNCED_DAYS_SELECT)
        .bind(first)
        .bind(last)
        .fetch_one(pool)
        .await
        .map_err(db_error)?;
    let spend_days = OwnSpendDays {
        days: bounds.map(|(first, last)| (last - first).num_days() + 1),
        synced,
    };
    Ok(own_structure_lanes(
        &framework,
        &selling_points,
        &order,
        &names,
        &spend,
        spend_days,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn segment(asset: &str, label: &str, extra: &[&str]) -> OwnSegment {
        OwnSegment {
            asset_id: asset.to_string(),
            label_key: label.to_string(),
            additional_label_keys: extra.iter().map(|key| key.to_string()).collect(),
        }
    }

    fn no_days() -> OwnSpendDays {
        OwnSpendDays {
            days: None,
            synced: 0,
        }
    }

    fn keys(row: &OwnStructureRow) -> Vec<&str> {
        row.labels.iter().map(String::as_str).collect()
    }

    #[test]
    fn framework_merges_adjacent_repeats_and_counts_originals() {
        let framework = [
            segment("a", "mixed_voiceover", &[]),
            segment("a", "mixed_voiceover", &[]),
            segment("a", "live_demo", &[]),
            segment("a", "mixed_voiceover", &[]),
            segment("b", "mixed_voiceover", &[]),
            segment("b", "live_demo", &[]),
            segment("b", "mixed_voiceover", &[]),
            segment("c", "promotion", &[]),
        ];
        let spend = HashMap::from([("a".to_string(), 120.0), ("c".to_string(), 5.5)]);
        let lanes = own_structure_lanes(&framework, &[], &[], &HashMap::new(), &spend, no_days());
        assert_eq!(lanes.framework.assets, 3);
        assert_eq!(
            keys(&lanes.framework.rows[0]),
            ["mixed_voiceover", "live_demo", "mixed_voiceover"]
        );
        assert_eq!(lanes.framework.rows[0].assets, 2);
        // An original without spend data adds an original but no spend.
        assert_eq!(lanes.framework.rows[0].spend, 120.0);
        assert_eq!(keys(&lanes.framework.rows[1]), ["promotion"]);
        assert_eq!(lanes.framework.spend, 125.5);
        assert_eq!(lanes.selling_point.assets, 0);
    }

    #[test]
    fn selling_points_are_a_set_in_preset_order() {
        let points = [
            segment("a", "long_wear", &["moisturizing"]),
            segment("a", "moisturizing", &[]),
            segment("b", "moisturizing", &[]),
            segment("b", "long_wear", &[]),
            segment("c", "unknown", &["long_wear"]),
        ];
        let order = ["moisturizing".to_string(), "long_wear".to_string()];
        let lanes = own_structure_lanes(
            &[],
            &points,
            &order,
            &HashMap::new(),
            &HashMap::new(),
            no_days(),
        );
        assert_eq!(lanes.selling_point.assets, 3);
        assert_eq!(
            keys(&lanes.selling_point.rows[0]),
            ["moisturizing", "long_wear"]
        );
        assert_eq!(lanes.selling_point.rows[0].assets, 2);
        // A key outside the preset sorts last.
        assert_eq!(keys(&lanes.selling_point.rows[1]), ["long_wear", "unknown"]);
    }
}
