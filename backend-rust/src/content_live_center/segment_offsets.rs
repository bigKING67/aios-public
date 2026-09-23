use sqlx::Row;
use tracing::error;
use uuid::Uuid;

use crate::error::{AppError, AppResult};

pub(super) async fn refresh_recording_segment_offsets(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    recording_id: Uuid,
) -> AppResult<()> {
    let rows = sqlx::query(
        r#"
        SELECT
          segment_id,
          duration_seconds::DOUBLE PRECISION AS duration_seconds
        FROM ads.douyin_live_session_recording_segments
        WHERE recording_id = $1
          AND upload_status = 'uploaded'
        ORDER BY segment_index ASC, created_at ASC
        "#,
    )
    .bind(recording_id)
    .fetch_all(&mut **transaction)
    .await
    .map_err(|error| map_segment_offset_db_error(error, "list live center segment offsets"))?;

    let inputs = rows
        .into_iter()
        .map(|row| SegmentOffsetInput {
            segment_id: row
                .try_get::<Uuid, _>("segment_id")
                .unwrap_or_else(|_| Uuid::nil()),
            duration_seconds: row
                .try_get::<Option<f64>, _>("duration_seconds")
                .ok()
                .flatten(),
        })
        .collect::<Vec<_>>();

    for update in compute_segment_offset_updates(inputs.as_slice()) {
        sqlx::query(
            r#"
            UPDATE ads.douyin_live_session_recording_segments
            SET
              start_offset_seconds = ($3::DOUBLE PRECISION)::NUMERIC,
              end_offset_seconds = ($4::DOUBLE PRECISION)::NUMERIC,
              updated_at = CURRENT_TIMESTAMP
            WHERE recording_id = $1
              AND segment_id = $2
            "#,
        )
        .bind(recording_id)
        .bind(update.segment_id)
        .bind(update.start_offset_seconds)
        .bind(update.end_offset_seconds)
        .execute(&mut **transaction)
        .await
        .map_err(|error| {
            map_segment_offset_db_error(error, "update live center segment offsets")
        })?;
    }

    Ok(())
}

fn map_segment_offset_db_error(error: sqlx::Error, context: &str) -> AppError {
    if matches!(error, sqlx::Error::RowNotFound) {
        return AppError::NotFound;
    }

    error!(
        ?error,
        context, "live center segment offset database operation failed"
    );
    AppError::Internal
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct SegmentOffsetInput {
    segment_id: Uuid,
    duration_seconds: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct SegmentOffsetUpdate {
    segment_id: Uuid,
    start_offset_seconds: Option<f64>,
    end_offset_seconds: Option<f64>,
}

fn compute_segment_offset_updates(inputs: &[SegmentOffsetInput]) -> Vec<SegmentOffsetUpdate> {
    let mut cursor = Some(0.0_f64);
    inputs
        .iter()
        .map(|input| {
            let (start_offset_seconds, end_offset_seconds) = match (cursor, input.duration_seconds)
            {
                (Some(start), Some(duration)) if duration >= 0.0 && duration.is_finite() => {
                    let end = start + duration;
                    cursor = Some(end);
                    (Some(start), Some(end))
                }
                _ => {
                    cursor = None;
                    (None, None)
                }
            };
            SegmentOffsetUpdate {
                segment_id: input.segment_id,
                start_offset_seconds,
                end_offset_seconds,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{compute_segment_offset_updates, SegmentOffsetInput};
    use uuid::Uuid;

    #[test]
    fn compute_segment_offset_updates_accumulates_uploaded_segment_durations() {
        let first_id = Uuid::parse_str("00000000-0000-0000-0000-000000000001").unwrap();
        let second_id = Uuid::parse_str("00000000-0000-0000-0000-000000000002").unwrap();
        let third_id = Uuid::parse_str("00000000-0000-0000-0000-000000000003").unwrap();

        let updates = compute_segment_offset_updates(&[
            SegmentOffsetInput {
                segment_id: first_id,
                duration_seconds: Some(120.0),
            },
            SegmentOffsetInput {
                segment_id: second_id,
                duration_seconds: Some(180.5),
            },
            SegmentOffsetInput {
                segment_id: third_id,
                duration_seconds: Some(60.0),
            },
        ]);

        assert_eq!(updates[0].segment_id, first_id);
        assert_eq!(updates[0].start_offset_seconds, Some(0.0));
        assert_eq!(updates[0].end_offset_seconds, Some(120.0));
        assert_eq!(updates[1].start_offset_seconds, Some(120.0));
        assert_eq!(updates[1].end_offset_seconds, Some(300.5));
        assert_eq!(updates[2].start_offset_seconds, Some(300.5));
        assert_eq!(updates[2].end_offset_seconds, Some(360.5));
    }

    #[test]
    fn compute_segment_offset_updates_marks_later_segments_unknown_after_missing_duration() {
        let first_id = Uuid::parse_str("00000000-0000-0000-0000-000000000011").unwrap();
        let second_id = Uuid::parse_str("00000000-0000-0000-0000-000000000012").unwrap();
        let third_id = Uuid::parse_str("00000000-0000-0000-0000-000000000013").unwrap();

        let updates = compute_segment_offset_updates(&[
            SegmentOffsetInput {
                segment_id: first_id,
                duration_seconds: Some(120.0),
            },
            SegmentOffsetInput {
                segment_id: second_id,
                duration_seconds: None,
            },
            SegmentOffsetInput {
                segment_id: third_id,
                duration_seconds: Some(60.0),
            },
        ]);

        assert_eq!(updates[0].start_offset_seconds, Some(0.0));
        assert_eq!(updates[0].end_offset_seconds, Some(120.0));
        assert_eq!(updates[1].segment_id, second_id);
        assert_eq!(updates[1].start_offset_seconds, None);
        assert_eq!(updates[1].end_offset_seconds, None);
        assert_eq!(updates[2].segment_id, third_id);
        assert_eq!(updates[2].start_offset_seconds, None);
        assert_eq!(updates[2].end_offset_seconds, None);
    }
}
