-- AI 创作中心：框架预设 v2。Forward-only; apply through the ledger, never on
-- API startup. Data only: adds framework v2 with the owner-confirmed
-- definitions (2026-09-30: continuous live footage = same person, same scene,
-- usually half a minute or longer; people or scenes changing = mixed
-- voiceover) and a 30s minimum span for live_demo, then retires v1 so new AI
-- 切段 jobs and batches use v2. Existing v1 segments keep their preset version.
INSERT INTO ads.content_segment_presets (preset_key, version, dimension, name, labels)
VALUES (
    'framework',
    2,
    'framework',
    '框架 v2',
    '[
      {"key":"mixed_voiceover","name":"混剪口播","definition":"段内有多个人物或多个场景轮换出现：一段旁白或口播贯穿、画面由多个来源的镜头快速拼接（产品特写、上脸片段、模特/明星、对比画面等）；也包括多位明星、达人、素人轮流出镜的推荐或演示片段拼接——即使每个人都在对镜说话、声画同步或演示产品，只要人物或场景在更换，就属于混剪口播。单个人物的镜头一般只有十几秒。"},
      {"key":"live_demo","name":"实拍内容","definition":"同一个人物在同一个场景中连续较长时间（通常半分钟以上）的实测、演示或讲解（展示包装、取量、质地、上脸、半脸对比、成妆），中间可以有剪辑点，但人物和场景不变；段内一旦换人或换场景，就不再是实拍内容。","minDurationSec":30},
      {"key":"street_interview","name":"街采","definition":"户外或公共场所，对多位路人/受访者提问，受访者轮流对镜头回答，常见手持话筒、多人轮换。"},
      {"key":"promotion","name":"机制","definition":"以促销福利信息为主（产品阵列、赠品、买赠/价格/活动字卡、庆祝动效），用于交代购买利益点。"},
      {"key":"koc","name":"KOC","definition":"素人/达人以个人使用者身份分享真实体验的种草内容。"}
    ]'::JSONB
);

UPDATE ads.content_segment_presets
SET status = 'retired', updated_at = NOW()
WHERE preset_key = 'framework' AND version = 1;
