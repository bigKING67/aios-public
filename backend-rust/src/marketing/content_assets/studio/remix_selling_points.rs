//! 类型 2 按卖点排列组合 (pure; no model involvement). Rules: 飞书《按卖点排列组合的
//! 混剪规则（建议稿）》.
//!
//! - Selling-point segments of one asset that fall inside the same confirmed
//!   framework segment and are chained by `continues_previous` form a block;
//!   a block is never split.
//! - Each framework segment of the reference original is a slot. A slot is
//!   filled by 1..=`MAX_BLOCKS_PER_SLOT` blocks of other material whose
//!   framework label matches, within ±`DURATION_TOLERANCE` of the reference
//!   span, without repeating a segment or a selling point.
//! - Tiers: `Exact` (one block, same selling points) → `Spliced` (several
//!   blocks, same selling points) → `Varied` (same count, at least one shared,
//!   others changed). Higher tiers are only used when lower ones do not reach
//!   the requested count.
//! - A slot without blocks, or one whose single block covers ≥90 % of it,
//!   falls back to 类型 1: any whole framework segment of the same label.
//!   A slot whose blocks find no fill at all (its points cover only part of
//!   it) takes whole segments as a last resort, at the `Varied` tier.
//! - Combination hash = ordered segment ids of every clip (blocks expanded),
//!   shared with 类型 1 history so a fully fallen-back combination is never
//!   repeated either.
//! - Every complete output must contain confirmed moisturizing and skincare
//!   evidence, including fallback clips. Their global order is unrestricted.
//! - Selling points are split and counted only inside 混剪口播 framework
//!   segments. Other frameworks (实拍、街采、机制、KOC) are whole 类型 1 units:
//!   selling points annotated inside them stay stored but are ignored here, so
//!   they neither satisfy the required points nor use the repeat budget.
use super::remix_combos::{combination_hash, SplitMix64, ENUMERATION_LIMIT, MIN_TOTAL_MS};
use super::selling_point_labels::{compatible_swap, group, same_sequence};
use std::collections::{BTreeMap, HashMap, HashSet};
use uuid::Uuid;

pub(super) const MAX_BLOCKS_PER_SLOT: usize = 3;
/// The only framework label whose segments carry selling points (framework
/// presets v1 and v2 share the key).
pub(super) const POINT_FRAMEWORK_LABEL: &str = "mixed_voiceover";
/// Business confirmation in the source document's 2026-10-13 comments.
const REQUIRED_POINTS: [&str; 2] = ["moisturizing", "skincare"];
/// Slot fill may deviate this much from the reference framework span.
pub(super) const DURATION_TOLERANCE: f64 = 0.2;
/// A single block covering this share of its framework segment is a long chain.
const LONG_CHAIN_SHARE: f64 = 0.9;
const MAX_OPTIONS_PER_TIER: usize = 40;
/// Valid options collected per tier before the seeded truncation.
const MAX_RAW_PER_TIER: usize = 2_000;
/// Search nodes visited per tier; bounds planning inside the create transaction.
const MAX_VISITS_PER_TIER: usize = 50_000;
const SAMPLE_ATTEMPTS_PER_ITEM: usize = 64;
const MAX_SAMPLE_ATTEMPTS: usize = 20_000;

/// A confirmed framework segment (类型 1 unit).
#[derive(Clone, Debug)]
pub(super) struct FrameSegment {
    pub(super) segment_id: Uuid,
    pub(super) asset_id: Uuid,
    pub(super) start_ms: i32,
    pub(super) end_ms: i32,
    pub(super) label_key: String,
    pub(super) source_content_hash: String,
}

/// A confirmed selling-point segment.
#[derive(Clone, Debug)]
pub(super) struct PointSegment {
    pub(super) segment_id: Uuid,
    pub(super) asset_id: Uuid,
    pub(super) start_ms: i32,
    pub(super) end_ms: i32,
    pub(super) label_key: String,
    pub(super) additional_label_keys: Vec<String>,
    pub(super) continues_previous: bool,
}

impl PointSegment {
    fn labels(&self) -> Vec<String> {
        let mut labels =
            super::domain::segment_label_keys(&self.label_key, &self.additional_label_keys);
        labels.sort_by(|a, b| group(a).cmp(group(b)).then(a.cmp(b)));
        labels
    }
}

#[derive(Clone, Debug)]
pub(super) struct Block {
    /// Framework segment containing the block (rechecked at create).
    pub(super) frame_id: Uuid,
    pub(super) asset_id: Uuid,
    pub(super) framework_label: String,
    pub(super) source_content_hash: String,
    pub(super) points: Vec<PointSegment>,
}

impl Block {
    fn start_ms(&self) -> i32 {
        self.points[0].start_ms
    }
    fn end_ms(&self) -> i32 {
        self.points[self.points.len() - 1].end_ms
    }
    fn duration_ms(&self) -> u64 {
        span(self.start_ms(), self.end_ms())
    }
    fn selling_points(&self) -> Vec<String> {
        self.points.iter().flat_map(PointSegment::labels).collect()
    }
}

pub(super) fn carries_points(frame: &FrameSegment) -> bool {
    frame.label_key == POINT_FRAMEWORK_LABEL
}

fn overlaps(frame: &FrameSegment, point: &PointSegment) -> bool {
    frame.asset_id == point.asset_id
        && frame.start_ms < point.end_ms
        && point.start_ms < frame.end_ms
}

fn span(start: i32, end: i32) -> u64 {
    u64::try_from(end.saturating_sub(start)).unwrap_or(0)
}

/// Known continuity which this single-framework-slot model cannot represent.
/// Do not turn an unresolved predecessor or a cross-frame chain into a hard cut.
/// Only 混剪口播 frames can be unsafe; other frameworks are whole 类型 1 units.
/// Every point still counts as a neighbour, so a chain leaving a 混剪口播 frame
/// keeps that frame from being cut.
pub(super) fn unsafe_frame_ids(frames: &[FrameSegment], points: &[PointSegment]) -> HashSet<Uuid> {
    let mut unsafe_ids = HashSet::new();
    let frames: Vec<&FrameSegment> = frames.iter().filter(|f| carries_points(f)).collect();
    let mut sorted: Vec<_> = points.iter().collect();
    sorted.sort_by_key(|p| (p.asset_id, p.start_ms, p.segment_id));
    let mut previous: Option<&PointSegment> = None;
    for point in sorted {
        let containing = frames.iter().find(|f| {
            f.asset_id == point.asset_id && f.start_ms <= point.start_ms && point.end_ms <= f.end_ms
        });
        if containing.is_none() {
            unsafe_ids.extend(
                frames
                    .iter()
                    .filter(|f| overlaps(f, point))
                    .map(|f| f.segment_id),
            );
        }
        if point.continues_previous {
            let safe = previous.is_some_and(|prior| {
                prior.asset_id == point.asset_id
                    && point.start_ms >= prior.end_ms
                    && containing
                        .is_some_and(|f| f.start_ms <= prior.start_ms && prior.end_ms <= f.end_ms)
            });
            if !safe {
                unsafe_ids.extend(
                    frames
                        .iter()
                        .filter(|f| overlaps(f, point))
                        .map(|f| f.segment_id),
                );
                if let Some(prior) = previous.filter(|p| p.asset_id == point.asset_id) {
                    unsafe_ids.extend(
                        frames
                            .iter()
                            .filter(|f| overlaps(f, prior))
                            .map(|f| f.segment_id),
                    );
                }
            }
        }
        previous = Some(point);
    }
    unsafe_ids
}

/// Blocks of every 混剪口播 framework segment, keyed by the framework segment
/// index. A selling-point segment belongs to the framework segment of the same
/// asset that contains its midpoint; continuity never crosses framework
/// segments. Points whose midpoint lies in another framework are ignored.
pub(super) fn build_blocks(
    frames: &[FrameSegment],
    points: &[PointSegment],
) -> BTreeMap<usize, Vec<Block>> {
    let mut sorted: Vec<&PointSegment> = points.iter().collect();
    sorted.sort_by_key(|p| (p.asset_id, p.start_ms, p.segment_id));
    let mut blocks: BTreeMap<usize, Vec<Block>> = BTreeMap::new();
    let mut previous: Option<(usize, i32)> = None;
    let mut previous_asset = None;
    for point in sorted {
        if previous_asset != Some(point.asset_id) {
            previous = None;
            previous_asset = Some(point.asset_id);
        }
        let middle = point.start_ms + (point.end_ms - point.start_ms) / 2;
        let Some(frame_index) = frames.iter().position(|f| {
            f.asset_id == point.asset_id && f.start_ms <= middle && middle < f.end_ms
        }) else {
            previous = None;
            continue;
        };
        if !carries_points(&frames[frame_index]) {
            previous = None;
            continue;
        }
        let joins = point.continues_previous
            && previous.is_some_and(|(index, end)| index == frame_index && point.start_ms >= end);
        let list = blocks.entry(frame_index).or_default();
        match list.last_mut() {
            Some(block) if joins => block.points.push(point.clone()),
            _ => list.push(Block {
                frame_id: frames[frame_index].segment_id,
                asset_id: point.asset_id,
                framework_label: frames[frame_index].label_key.clone(),
                source_content_hash: frames[frame_index].source_content_hash.clone(),
                points: vec![point.clone()],
            }),
        }
        previous = Some((frame_index, point.end_ms));
    }
    blocks
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub(super) enum Tier {
    Exact = 1,
    Spliced = 2,
    Varied = 3,
}

impl Tier {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Tier::Exact => "exact",
            Tier::Spliced => "spliced",
            Tier::Varied => "varied",
        }
    }
}

/// One slot of the reference original.
#[derive(Clone, Debug)]
pub(super) struct RefSlot {
    pub(super) label_key: String,
    pub(super) duration_ms: u64,
    /// Known selling points in order, including whole-framework fallback slots.
    pub(super) target: Vec<String>,
    pub(super) fallback: bool,
    /// Segment ids the reference itself uses in this slot.
    pub(super) reference_ids: Vec<Uuid>,
}

pub(super) fn reference_slots(
    frames: &[FrameSegment],
    blocks: &BTreeMap<usize, Vec<Block>>,
) -> Vec<RefSlot> {
    frames
        .iter()
        .enumerate()
        .map(|(index, frame)| {
            let duration = span(frame.start_ms, frame.end_ms);
            let inside = blocks.get(&index).map(Vec::as_slice).unwrap_or(&[]);
            let long_chain = inside
                .iter()
                .any(|b| b.duration_ms() as f64 >= duration as f64 * LONG_CHAIN_SHARE);
            let target: Vec<String> = inside.iter().flat_map(Block::selling_points).collect();
            // A selling point repeated inside one slot cannot be filled under the
            // no-repeat rule, so the slot falls back to whole framework segments.
            if inside.is_empty() || long_chain || !distinct(target.iter().map(|point| group(point)))
            {
                return RefSlot {
                    label_key: frame.label_key.clone(),
                    duration_ms: duration,
                    target,
                    fallback: true,
                    reference_ids: vec![frame.segment_id],
                };
            }
            RefSlot {
                label_key: frame.label_key.clone(),
                duration_ms: duration,
                target,
                fallback: false,
                reference_ids: inside
                    .iter()
                    .flat_map(|b| b.points.iter().map(|p| p.segment_id))
                    .collect(),
            }
        })
        .collect()
}

/// One rendered span: a whole framework segment or one block.
#[derive(Clone, Debug)]
pub(super) struct Clip {
    pub(super) segment_ids: Vec<Uuid>,
    /// Selling-point evidence for a whole-framework clip; not rendered as parts.
    pub(super) point_guard_ids: Vec<Uuid>,
    /// Block clips only: the containing framework segment.
    pub(super) frame_id: Option<Uuid>,
    pub(super) asset_id: Uuid,
    pub(super) start_ms: i32,
    pub(super) end_ms: i32,
    pub(super) framework_label: String,
    pub(super) source_content_hash: String,
    pub(super) selling_points: Vec<String>,
}

#[derive(Clone, Debug)]
pub(super) struct SlotOption {
    pub(super) clips: Vec<Clip>,
    pub(super) tier: Tier,
    pub(super) fallback: bool,
}

impl SlotOption {
    fn duration_ms(&self) -> u64 {
        self.clips.iter().map(|c| span(c.start_ms, c.end_ms)).sum()
    }
    fn segment_ids(&self) -> impl Iterator<Item = Uuid> + '_ {
        self.clips
            .iter()
            .flat_map(|c| c.segment_ids.iter().copied())
    }
    fn selling_points(&self) -> impl Iterator<Item = &String> + '_ {
        self.clips.iter().flat_map(|c| c.selling_points.iter())
    }
}

fn block_clip(block: &Block) -> Clip {
    Clip {
        segment_ids: block.points.iter().map(|p| p.segment_id).collect(),
        point_guard_ids: Vec::new(),
        frame_id: Some(block.frame_id),
        asset_id: block.asset_id,
        start_ms: block.start_ms(),
        end_ms: block.end_ms(),
        framework_label: block.framework_label.clone(),
        source_content_hash: block.source_content_hash.clone(),
        selling_points: block.selling_points(),
    }
}

fn frame_clip(frame: &FrameSegment, blocks: &[Block]) -> Clip {
    let mut points: Vec<_> = blocks
        .iter()
        .filter(|b| b.frame_id == frame.segment_id)
        .flat_map(|b| &b.points)
        .collect();
    points.sort_by_key(|p| (p.start_ms, p.segment_id));
    Clip {
        segment_ids: vec![frame.segment_id],
        point_guard_ids: points.iter().map(|p| p.segment_id).collect(),
        frame_id: None,
        asset_id: frame.asset_id,
        start_ms: frame.start_ms,
        end_ms: frame.end_ms,
        framework_label: frame.label_key.clone(),
        source_content_hash: frame.source_content_hash.clone(),
        selling_points: points.iter().flat_map(|point| point.labels()).collect(),
    }
}

fn within_tolerance(slot: &RefSlot, duration_ms: u64) -> bool {
    let target = slot.duration_ms as f64;
    let actual = duration_ms as f64;
    actual >= target * (1.0 - DURATION_TOLERANCE) && actual <= target * (1.0 + DURATION_TOLERANCE)
}

fn distinct<T: Eq + std::hash::Hash>(items: impl Iterator<Item = T>) -> bool {
    let mut seen = HashSet::new();
    items.into_iter().all(|item| seen.insert(item))
}

fn classify(slot: &RefSlot, sequence: &[&Block], allow_variation: bool) -> Option<Tier> {
    let points: Vec<String> = sequence.iter().flat_map(|b| b.selling_points()).collect();
    if points.len() != slot.target.len()
        || !distinct(points.iter().map(|point| group(point)))
        || !compatible_swap(&slot.target, &points)
    {
        return None;
    }
    if same_sequence(&points, &slot.target) {
        return Some(if sequence.len() == 1 {
            Tier::Exact
        } else {
            Tier::Spliced
        });
    }
    let shared = points
        .iter()
        .any(|p| slot.target.iter().any(|target| group(target) == group(p)));
    (allow_variation && shared).then_some(Tier::Varied)
}

/// Candidate fills of one slot, capped per tier after a seeded shuffle. Each
/// tier is searched on its own budget over a seeded pool order, so a crowded
/// pool can neither crowd out single-block exact fills nor stall planning.
pub(super) fn slot_options(
    slot: &RefSlot,
    frames: &[FrameSegment],
    blocks: &[Block],
    allow_variation: bool,
    seed: u64,
) -> Vec<SlotOption> {
    let mut rng = SplitMix64(seed);
    if slot.fallback {
        return whole_frame_options(slot, frames, blocks, Tier::Exact, &mut rng);
    }
    let mut pool: Vec<&Block> = blocks
        .iter()
        .filter(|b| {
            b.framework_label == slot.label_key && b.selling_points().len() <= slot.target.len()
        })
        .collect();
    shuffle(&mut pool, &mut rng);
    let mut tiers = vec![Tier::Exact, Tier::Spliced];
    if allow_variation {
        tiers.push(Tier::Varied);
    }
    let mut options = Vec::new();
    for tier in tiers {
        let mut search = Search {
            slot,
            pool: &pool,
            tier,
            stack: Vec::new(),
            found: Vec::new(),
            visits: 0,
        };
        search.extend(0, 0);
        let mut found = search.found;
        shuffle(&mut found, &mut rng);
        found.truncate(MAX_OPTIONS_PER_TIER);
        options.extend(found);
    }
    if options.is_empty() {
        // Known points of the whole segment still meet the required, repeat
        // and create-time checks; the unlabelled rest is not controlled.
        return whole_frame_options(slot, frames, blocks, Tier::Varied, &mut rng);
    }
    options
}

/// Whole same-label framework segments within the slot tolerance.
fn whole_frame_options(
    slot: &RefSlot,
    frames: &[FrameSegment],
    blocks: &[Block],
    tier: Tier,
    rng: &mut SplitMix64,
) -> Vec<SlotOption> {
    let mut options: Vec<SlotOption> = frames
        .iter()
        .filter(|f| {
            f.label_key == slot.label_key && within_tolerance(slot, span(f.start_ms, f.end_ms))
        })
        .map(|f| SlotOption {
            clips: vec![frame_clip(f, blocks)],
            tier,
            fallback: true,
        })
        .filter(|option| compatible_swap(&slot.target, &option.clips[0].selling_points))
        .collect();
    shuffle(&mut options, rng);
    options.truncate(MAX_OPTIONS_PER_TIER);
    options
}

/// Depth-first over ordered block sequences that produce one tier. Exact and
/// spliced fills only extend with blocks reproducing the next target points;
/// every branch stops once its duration exceeds the tolerance ceiling.
struct Search<'a> {
    slot: &'a RefSlot,
    pool: &'a [&'a Block],
    tier: Tier,
    stack: Vec<usize>,
    found: Vec<SlotOption>,
    visits: usize,
}

impl Search<'_> {
    fn exhausted(&self) -> bool {
        self.visits >= MAX_VISITS_PER_TIER || self.found.len() >= MAX_RAW_PER_TIER
    }

    fn extend(&mut self, used_points: usize, duration: u64) {
        self.visits += 1;
        let target = self.slot.target.len();
        if used_points == target {
            let sequence: Vec<&Block> = self.stack.iter().map(|i| self.pool[*i]).collect();
            if within_tolerance(self.slot, duration)
                && classify(self.slot, &sequence, true) == Some(self.tier)
            {
                let option = SlotOption {
                    clips: sequence.iter().map(|b| block_clip(b)).collect(),
                    tier: self.tier,
                    fallback: false,
                };
                if distinct(option.segment_ids()) {
                    self.found.push(option);
                }
            }
            return;
        }
        let depth_limit = if self.tier == Tier::Exact {
            1
        } else {
            MAX_BLOCKS_PER_SLOT
        };
        if self.stack.len() >= depth_limit || self.exhausted() {
            return;
        }
        let ceiling = self.slot.duration_ms as f64 * (1.0 + DURATION_TOLERANCE);
        for index in 0..self.pool.len() {
            let block = self.pool[index];
            let block_points = block.selling_points();
            let next_points = used_points + block_points.len();
            let next_duration = duration + block.duration_ms();
            if self.stack.contains(&index) || next_points > target || next_duration as f64 > ceiling
            {
                continue;
            }
            if self.tier != Tier::Varied
                && !same_sequence(&block_points, &self.slot.target[used_points..next_points])
            {
                continue;
            }
            self.stack.push(index);
            self.extend(next_points, next_duration);
            self.stack.pop();
            if self.exhausted() {
                return;
            }
        }
    }
}

fn shuffle<T>(items: &mut [T], rng: &mut SplitMix64) {
    for i in (1..items.len()).rev() {
        let j = rng.below(i as u64 + 1) as usize;
        items.swap(i, j);
    }
}

#[derive(Debug)]
pub(super) struct PointCombination {
    /// Option index per slot.
    pub(super) picks: Vec<usize>,
    pub(super) hash: String,
    /// Highest tier among the picked options.
    pub(super) tier: Tier,
}

#[derive(Debug, Default)]
pub(super) struct PointSelection {
    pub(super) combos: Vec<PointCombination>,
    pub(super) theoretical: u64,
    pub(super) available: u64,
    pub(super) exact: bool,
    pub(super) previously_used: u64,
    pub(super) reference_excluded: bool,
}

/// The reference original's own composition (never selected).
pub(super) fn reference_hash(slots: &[RefSlot]) -> String {
    let ids: Vec<Uuid> = slots
        .iter()
        .flat_map(|s| s.reference_ids.iter().copied())
        .collect();
    combination_hash(&ids)
}

enum Verdict {
    Invalid,
    Used(String),
    Reference,
    Valid(PointCombination),
}

/// How often each selling point may appear in one output: once, or as often
/// as the reference itself uses it, including points inside fallback frames.
pub(super) fn repeat_allowance(slots: &[RefSlot]) -> HashMap<String, usize> {
    let mut counts: HashMap<String, usize> = HashMap::new();
    for point in slots.iter().flat_map(|s| s.target.iter()) {
        *counts.entry(group(point).to_owned()).or_default() += 1;
    }
    counts
}

/// Fixed inputs of one selection.
pub(super) struct Limits {
    pub(super) max_total_ms: u64,
    pub(super) max_sources: usize,
    /// From `repeat_allowance`.
    pub(super) allowance: HashMap<String, usize>,
}

fn evaluate(
    options: &[Vec<SlotOption>],
    picks: Vec<usize>,
    limits: &Limits,
    used: &HashSet<String>,
    reference: &str,
) -> Verdict {
    let chosen: Vec<&SlotOption> = picks.iter().zip(options).map(|(p, o)| &o[*p]).collect();
    let ids: Vec<Uuid> = chosen.iter().flat_map(|o| o.segment_ids()).collect();
    if !distinct(ids.iter()) {
        return Verdict::Invalid;
    }
    // A whole-framework fallback and a point block have different IDs but may
    // render the same source frames. Half-open intervals may touch, not overlap.
    let mut ranges: Vec<_> = chosen
        .iter()
        .flat_map(|o| o.clips.iter().map(|c| (c.asset_id, c.start_ms, c.end_ms)))
        .collect();
    ranges.sort_unstable();
    if ranges
        .windows(2)
        .any(|pair| pair[0].0 == pair[1].0 && pair[0].2 > pair[1].1)
    {
        return Verdict::Invalid;
    }
    let mut counts: HashMap<&str, usize> = HashMap::new();
    for point in chosen.iter().flat_map(|o| o.selling_points()) {
        *counts.entry(group(point)).or_default() += 1;
    }
    if REQUIRED_POINTS
        .iter()
        .any(|point| !counts.contains_key(point))
    {
        return Verdict::Invalid;
    }
    if counts
        .iter()
        .any(|(point, count)| *count > limits.allowance.get(*point).copied().unwrap_or(1).max(1))
    {
        return Verdict::Invalid;
    }
    let sources: HashSet<Uuid> = chosen
        .iter()
        .flat_map(|o| o.clips.iter().map(|c| c.asset_id))
        .collect();
    if sources.len() > limits.max_sources {
        return Verdict::Invalid;
    }
    let total: u64 = chosen.iter().map(|o| o.duration_ms()).sum();
    if !(MIN_TOTAL_MS..=limits.max_total_ms).contains(&total) {
        return Verdict::Invalid;
    }
    let hash = combination_hash(&ids);
    if hash == reference {
        return Verdict::Reference;
    }
    if used.contains(&hash) {
        return Verdict::Used(hash);
    }
    let tier = chosen.iter().map(|o| o.tier).max().unwrap_or(Tier::Exact);
    Verdict::Valid(PointCombination { picks, hash, tier })
}

fn decode(mut index: u64, sizes: &[usize]) -> Vec<usize> {
    let mut picks = vec![0; sizes.len()];
    for (size, pick) in sizes.iter().zip(picks.iter_mut()).rev() {
        *pick = (index % *size as u64) as usize;
        index /= *size as u64;
    }
    picks
}

/// Tiered deterministic selection: only `Exact` options first, then up to
/// `Spliced`, then up to `Varied`, until `count` combinations are found.
pub(super) fn select(
    options: &[Vec<SlotOption>],
    count: usize,
    seed: u64,
    limits: &Limits,
    used: &HashSet<String>,
    reference: &str,
) -> PointSelection {
    let mut selection = PointSelection {
        exact: true,
        ..PointSelection::default()
    };
    if options.is_empty() || options.iter().any(Vec::is_empty) {
        return selection;
    }
    selection.theoretical = options
        .iter()
        .fold(1u64, |acc, o| acc.saturating_mul(o.len() as u64));
    let mut rng = SplitMix64(seed);
    let mut taken: HashSet<String> = HashSet::new();
    let mut used_seen: HashSet<String> = HashSet::new();
    for ceiling in [Tier::Exact, Tier::Spliced, Tier::Varied] {
        // Option indices allowed at this ceiling, per slot.
        let allowed: Vec<Vec<usize>> = options
            .iter()
            .map(|slot| {
                (0..slot.len())
                    .filter(|i| slot[*i].tier <= ceiling)
                    .collect()
            })
            .collect();
        if allowed.iter().any(Vec::is_empty) {
            continue;
        }
        let sizes: Vec<usize> = allowed.iter().map(Vec::len).collect();
        let space = sizes
            .iter()
            .fold(1u64, |acc, s| acc.saturating_mul(*s as u64));
        let mut found = Vec::new();
        let mut consider = |local: Vec<usize>, found: &mut Vec<PointCombination>| {
            let picks: Vec<usize> = local.iter().zip(&allowed).map(|(l, a)| a[*l]).collect();
            match evaluate(options, picks, limits, used, reference) {
                Verdict::Valid(combo) if combo.tier == ceiling && !taken.contains(&combo.hash) => {
                    taken.insert(combo.hash.clone());
                    found.push(combo);
                }
                Verdict::Used(hash) => {
                    used_seen.insert(hash);
                }
                Verdict::Reference => selection.reference_excluded = true,
                _ => {}
            }
        };
        if space <= ENUMERATION_LIMIT {
            for index in 0..space {
                consider(decode(index, &sizes), &mut found);
            }
            shuffle(&mut found, &mut rng);
        } else {
            selection.exact = false;
            let need = count.saturating_sub(selection.combos.len());
            let attempts = need
                .saturating_mul(SAMPLE_ATTEMPTS_PER_ITEM)
                .min(MAX_SAMPLE_ATTEMPTS);
            for _ in 0..attempts {
                if found.len() >= need {
                    break;
                }
                let local = sizes
                    .iter()
                    .map(|s| rng.below(*s as u64) as usize)
                    .collect();
                consider(local, &mut found);
            }
        }
        selection.available += found.len() as u64;
        let room = count.saturating_sub(selection.combos.len());
        selection.combos.extend(found.into_iter().take(room));
    }
    selection.previously_used = used_seen.len() as u64;
    selection
}

#[cfg(test)]
#[path = "remix_selling_points_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "remix_selling_points_voiceover_tests.rs"]
mod voiceover_tests;
