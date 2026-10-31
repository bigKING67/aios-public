-- 竞品爆款：罗盘「市场-内容榜单-直播交易榜单-引流短视频」每日导出入库。
-- 台式机 competitor_analysis/compass_import.py 每天 08:30 扫描导出目录，按文件 sha256 幂等；
-- 同一天的文件内容变化时删除旧批次（级联删除直播间与视频行）后整天重导。
-- 罗盘的指标是区间（如「¥25万 - ¥50万」「25% - 30%」），原文与解析出的下限、上限都存；
-- 播放地址与封面是会过期的签名链接，不入库（播放与封面按视频 ID 现场解析）。
-- 见 .trellis/tasks/10-26-competitor-compass-import/。

CREATE TABLE competitor.compass_imports (
    import_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_type TEXT NOT NULL,
    list_scope TEXT NOT NULL DEFAULT 'all',
    data_date DATE NOT NULL,
    file_name TEXT NOT NULL,
    file_sha256 TEXT NOT NULL,
    row_count INTEGER NOT NULL,
    room_count INTEGER NOT NULL,
    video_count INTEGER NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT compass_imports_list_type_check CHECK (list_type IN ('live_trade_traffic_videos')),
    CONSTRAINT compass_imports_scope_check CHECK (list_scope ~ '^[a-z0-9_]{1,40}$'),
    CONSTRAINT compass_imports_sha256_check CHECK (file_sha256 ~ '^[a-f0-9]{64}$'),
    CONSTRAINT compass_imports_counts_check CHECK (row_count >= 0 AND room_count >= 0 AND video_count >= 0),
    -- 一个榜单、一个范围、一天只保留一个批次；内容变了就替换。
    CONSTRAINT compass_imports_day_key UNIQUE (list_type, list_scope, data_date)
);

COMMENT ON TABLE competitor.compass_imports IS '罗盘榜单导入批次：每个榜单、每个范围、每天一个批次，记录来源文件与行数，用于幂等与对账';
COMMENT ON COLUMN competitor.compass_imports.import_id IS '导入批次 ID';
COMMENT ON COLUMN competitor.compass_imports.list_type IS '榜单类型：live_trade_traffic_videos = 市场-内容榜单-直播交易榜单-引流短视频';
COMMENT ON COLUMN competitor.compass_imports.list_scope IS '榜单范围（罗盘里选的类目等筛选），导出文件不含该信息时为 all';
COMMENT ON COLUMN competitor.compass_imports.data_date IS '榜单日期（文件中的「日期」列）';
COMMENT ON COLUMN competitor.compass_imports.file_name IS '来源文件名';
COMMENT ON COLUMN competitor.compass_imports.file_sha256 IS '来源文件内容 SHA-256，同一文件重复扫描不重复导入';
COMMENT ON COLUMN competitor.compass_imports.row_count IS '文件数据行数（不含表头，多行标题算一行）';
COMMENT ON COLUMN competitor.compass_imports.room_count IS '本批次直播间数';
COMMENT ON COLUMN competitor.compass_imports.video_count IS '本批次引流短视频数';
COMMENT ON COLUMN competitor.compass_imports.imported_at IS '导入时间';

CREATE TABLE competitor.compass_live_rooms_daily (
    data_date DATE NOT NULL,
    list_scope TEXT NOT NULL DEFAULT 'all',
    live_room_id TEXT NOT NULL,
    import_id UUID NOT NULL REFERENCES competitor.compass_imports (import_id) ON DELETE CASCADE,
    rank INTEGER,
    anchor_name TEXT NOT NULL,
    douyin_account TEXT,
    shop_id TEXT,
    follower_count BIGINT,
    pay_amount_text TEXT,
    pay_amount_min NUMERIC(16, 2),
    pay_amount_max NUMERIC(16, 2),
    watch_count_text TEXT,
    watch_count_min BIGINT,
    watch_count_max BIGINT,
    product_click_text TEXT,
    product_click_min BIGINT,
    product_click_max BIGINT,
    click_conversion_rate_text TEXT,
    click_conversion_rate_min NUMERIC(7, 4),
    click_conversion_rate_max NUMERIC(7, 4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (data_date, list_scope, live_room_id),
    CONSTRAINT compass_live_rooms_room_id_check CHECK (live_room_id ~ '^[0-9]{6,32}$'),
    CONSTRAINT compass_live_rooms_rank_check CHECK (rank IS NULL OR rank > 0)
);

COMMENT ON TABLE competitor.compass_live_rooms_daily IS '罗盘直播交易榜单：每天每个直播间一行（同一直播间在导出里每条引流视频重复一遍，入库去重）';
COMMENT ON COLUMN competitor.compass_live_rooms_daily.data_date IS '榜单日期';
COMMENT ON COLUMN competitor.compass_live_rooms_daily.list_scope IS '榜单范围，同导入批次';
COMMENT ON COLUMN competitor.compass_live_rooms_daily.live_room_id IS '直播间 ID';
COMMENT ON COLUMN competitor.compass_live_rooms_daily.import_id IS '所属导入批次，批次替换时级联删除';
COMMENT ON COLUMN competitor.compass_live_rooms_daily.rank IS '榜单排名，导出中为空时为空（如未上榜但被检索出的直播间）';
COMMENT ON COLUMN competitor.compass_live_rooms_daily.anchor_name IS '播主（店铺号或达人昵称）';
COMMENT ON COLUMN competitor.compass_live_rooms_daily.douyin_account IS '播主抖音号';
COMMENT ON COLUMN competitor.compass_live_rooms_daily.shop_id IS '店铺 ID';
COMMENT ON COLUMN competitor.compass_live_rooms_daily.follower_count IS '粉丝数';
COMMENT ON COLUMN competitor.compass_live_rooms_daily.pay_amount_text IS '直播用户支付金额（罗盘区间原文，如「¥25万 - ¥50万」）';
COMMENT ON COLUMN competitor.compass_live_rooms_daily.pay_amount_min IS '直播用户支付金额区间下限（元）';
COMMENT ON COLUMN competitor.compass_live_rooms_daily.pay_amount_max IS '直播用户支付金额区间上限（元），开放区间为空';
COMMENT ON COLUMN competitor.compass_live_rooms_daily.watch_count_text IS '直播间观看次数（区间原文）';
COMMENT ON COLUMN competitor.compass_live_rooms_daily.watch_count_min IS '直播间观看次数区间下限';
COMMENT ON COLUMN competitor.compass_live_rooms_daily.watch_count_max IS '直播间观看次数区间上限，开放区间为空';
COMMENT ON COLUMN competitor.compass_live_rooms_daily.product_click_text IS '商品点击次数（区间原文）';
COMMENT ON COLUMN competitor.compass_live_rooms_daily.product_click_min IS '商品点击次数区间下限';
COMMENT ON COLUMN competitor.compass_live_rooms_daily.product_click_max IS '商品点击次数区间上限，开放区间为空';
COMMENT ON COLUMN competitor.compass_live_rooms_daily.click_conversion_rate_text IS '点击成交转化率（区间原文，如「25% - 30%」）';
COMMENT ON COLUMN competitor.compass_live_rooms_daily.click_conversion_rate_min IS '点击成交转化率区间下限（小数，0.25 表示 25%）';
COMMENT ON COLUMN competitor.compass_live_rooms_daily.click_conversion_rate_max IS '点击成交转化率区间上限（小数），开放区间为空';
COMMENT ON COLUMN competitor.compass_live_rooms_daily.created_at IS '入库时间';

CREATE TABLE competitor.compass_traffic_videos_daily (
    data_date DATE NOT NULL,
    list_scope TEXT NOT NULL DEFAULT 'all',
    live_room_id TEXT NOT NULL,
    aweme_id TEXT NOT NULL,
    import_id UUID NOT NULL REFERENCES competitor.compass_imports (import_id) ON DELETE CASCADE,
    title TEXT,
    published_at TIMESTAMPTZ,
    video_url TEXT,
    traffic_exposure_text TEXT,
    traffic_exposure_min BIGINT,
    traffic_exposure_max BIGINT,
    entry_click_text TEXT,
    entry_click_min BIGINT,
    entry_click_max BIGINT,
    entry_click_rate_text TEXT,
    entry_click_rate_min NUMERIC(7, 4),
    entry_click_rate_max NUMERIC(7, 4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (data_date, list_scope, live_room_id, aweme_id),
    FOREIGN KEY (data_date, list_scope, live_room_id)
        REFERENCES competitor.compass_live_rooms_daily (data_date, list_scope, live_room_id) ON DELETE CASCADE,
    CONSTRAINT compass_traffic_videos_aweme_id_check CHECK (aweme_id ~ '^[0-9]{6,32}$')
);

CREATE INDEX compass_traffic_videos_aweme_idx ON competitor.compass_traffic_videos_daily (aweme_id, data_date DESC);

COMMENT ON TABLE competitor.compass_traffic_videos_daily IS '罗盘直播交易榜单的引流短视频：每天每个直播间的每条引流视频一行';
COMMENT ON COLUMN competitor.compass_traffic_videos_daily.data_date IS '榜单日期';
COMMENT ON COLUMN competitor.compass_traffic_videos_daily.list_scope IS '榜单范围，同导入批次';
COMMENT ON COLUMN competitor.compass_traffic_videos_daily.live_room_id IS '引流到的直播间 ID';
COMMENT ON COLUMN competitor.compass_traffic_videos_daily.aweme_id IS '抖音视频 ID，对应 competitor.videos.aweme_id';
COMMENT ON COLUMN competitor.compass_traffic_videos_daily.import_id IS '所属导入批次，批次替换时级联删除';
COMMENT ON COLUMN competitor.compass_traffic_videos_daily.title IS '视频标题（可能含换行）';
COMMENT ON COLUMN competitor.compass_traffic_videos_daily.published_at IS '视频发布时间（导出为北京时间，按 Asia/Shanghai 入库）';
COMMENT ON COLUMN competitor.compass_traffic_videos_daily.video_url IS '抖音视频链接';
COMMENT ON COLUMN competitor.compass_traffic_videos_daily.traffic_exposure_text IS '直播间引流曝光人次（区间原文），罗盘未给出时为空';
COMMENT ON COLUMN competitor.compass_traffic_videos_daily.traffic_exposure_min IS '直播间引流曝光人次区间下限';
COMMENT ON COLUMN competitor.compass_traffic_videos_daily.traffic_exposure_max IS '直播间引流曝光人次区间上限，开放区间为空';
COMMENT ON COLUMN competitor.compass_traffic_videos_daily.entry_click_text IS '直播入口点击人次（区间原文），罗盘未给出时为空';
COMMENT ON COLUMN competitor.compass_traffic_videos_daily.entry_click_min IS '直播入口点击人次区间下限';
COMMENT ON COLUMN competitor.compass_traffic_videos_daily.entry_click_max IS '直播入口点击人次区间上限，开放区间为空';
COMMENT ON COLUMN competitor.compass_traffic_videos_daily.entry_click_rate_text IS '直播入口点击率（区间原文），罗盘未给出时为空';
COMMENT ON COLUMN competitor.compass_traffic_videos_daily.entry_click_rate_min IS '直播入口点击率区间下限（小数）';
COMMENT ON COLUMN competitor.compass_traffic_videos_daily.entry_click_rate_max IS '直播入口点击率区间上限（小数），开放区间为空';
COMMENT ON COLUMN competitor.compass_traffic_videos_daily.created_at IS '入库时间';

-- 台式机 GPU 节点角色负责导入：只授三张新表与竞品视频 upsert 所需权限（本地与测试库没有该角色时跳过）。
DO $grant$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aios_gpu_node') THEN
        GRANT SELECT, INSERT, DELETE ON competitor.compass_imports TO aios_gpu_node;
        GRANT SELECT, INSERT ON competitor.compass_live_rooms_daily TO aios_gpu_node;
        GRANT SELECT, INSERT ON competitor.compass_traffic_videos_daily TO aios_gpu_node;
        GRANT INSERT ON competitor.videos TO aios_gpu_node;
    END IF;
END
$grant$;
