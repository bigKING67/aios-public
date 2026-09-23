BEGIN;

INSERT INTO ads.douyin_self_anchor_map (
  anchor_douyin_id,
  anchor_nickname,
  is_active,
  note
)
VALUES (
  '1075458451',
  'Groland高岚个人护理直播间',
  TRUE,
  '补充 Groland 自播账号映射，用于直播中台/直播 ADS 自播口径'
)
ON CONFLICT (anchor_douyin_id) DO UPDATE
SET
  anchor_nickname = EXCLUDED.anchor_nickname,
  is_active = TRUE,
  note = EXCLUDED.note,
  updated_at = NOW();

COMMIT;
