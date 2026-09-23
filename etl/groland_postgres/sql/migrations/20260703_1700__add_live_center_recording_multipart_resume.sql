-- Persist TOS multipart upload metadata so live-center recording uploads can be
-- resumed after browser refresh and cleaned up with AbortMultipartUpload.

ALTER TABLE ads.douyin_live_session_recording_segments
  ADD COLUMN IF NOT EXISTS multipart_upload_id TEXT,
  ADD COLUMN IF NOT EXISTS multipart_part_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS multipart_expires_at TIMESTAMPTZ;

ALTER TABLE ads.douyin_live_session_recording_segments
  DROP CONSTRAINT IF EXISTS chk_douyin_live_session_recording_segments_multipart_part_size;

ALTER TABLE ads.douyin_live_session_recording_segments
  ADD CONSTRAINT chk_douyin_live_session_recording_segments_multipart_part_size
  CHECK (
    multipart_part_size_bytes IS NULL
    OR multipart_part_size_bytes > 0
  );

COMMENT ON CONSTRAINT chk_douyin_live_session_recording_segments_multipart_part_size
  ON ads.douyin_live_session_recording_segments IS
  'Ensures resumable live recording multipart part sizes are positive when recorded.';

CREATE INDEX IF NOT EXISTS idx_douyin_live_session_recording_segments_multipart_upload
  ON ads.douyin_live_session_recording_segments (multipart_upload_id)
  WHERE multipart_upload_id IS NOT NULL;

COMMENT ON COLUMN ads.douyin_live_session_recording_segments.multipart_upload_id IS
  'TOS multipart uploadId for resumable live recording uploads; nullable for single PUT and legacy rows.';
COMMENT ON COLUMN ads.douyin_live_session_recording_segments.multipart_part_size_bytes IS
  'TOS multipart part size in bytes used when the resumable live recording upload was initialized.';
COMMENT ON COLUMN ads.douyin_live_session_recording_segments.multipart_expires_at IS
  'Expiry time of the last signed upload-part URL batch; resume re-signs fresh URLs.';
COMMENT ON INDEX ads.idx_douyin_live_session_recording_segments_multipart_upload IS
  'Lookup helper for resumable live-center multipart uploads and stale abort cleanup.';
