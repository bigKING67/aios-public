COMMENT ON COLUMN ads.report_douyin_trade_sale_shortvideo_metrics_week.week_period IS
  '周时间段，格式为 YYYY/M/D～YYYY/M/D。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_shortvideo_metrics_week.as_of_date IS
  '同期口径截止日期。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_shortvideo_metrics_week.observed_days IS
  '同期对比已观察天数，取值 1 到 7。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_shortvideo_metrics_week.video_id IS
  '抖音短视频 ID。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_shortvideo_metrics_week.author_douyin_id IS
  '短视频作者抖音号。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_shortvideo_metrics_week.video_title IS
  '短视频标题。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_shortvideo_metrics_week.author_nickname IS
  '短视频作者昵称。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_shortvideo_metrics_week.product_id IS
  '短视频关联商品 ID。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_shortvideo_metrics_week.publish_time IS
  '短视频发布时间。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_shortvideo_metrics_week.is_promoted IS
  '是否投流标记。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_shortvideo_metrics_week.play_url IS
  '短视频播放地址。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_shortvideo_metrics_week.curr_video_view_count IS
  '本周同期窗口短视频播放量。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_shortvideo_metrics_week.prev_video_view_count IS
  '上周同期窗口短视频播放量。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_shortvideo_metrics_week.curr_user_pay_amount IS
  '本周同期窗口短视频归因用户支付金额。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_shortvideo_metrics_week.prev_user_pay_amount IS
  '上周同期窗口短视频归因用户支付金额。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_shortvideo_metrics_week.curr_refund_amount IS
  '本周同期窗口短视频归因退款金额。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_shortvideo_metrics_week.prev_refund_amount IS
  '上周同期窗口短视频归因退款金额。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_shortvideo_metrics_week.curr_live_room_pay_amount IS
  '本周同期窗口看后进直播间支付金额。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_shortvideo_metrics_week.prev_live_room_pay_amount IS
  '上周同期窗口看后进直播间支付金额。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_shortvideo_metrics_week.curr_search_after_view_pay_amount IS
  '本周同期窗口看后搜索支付金额。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_shortvideo_metrics_week.prev_search_after_view_pay_amount IS
  '上周同期窗口看后搜索支付金额。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_shortvideo_metrics_week.curr_shop_page_pay_amount IS
  '本周同期窗口看后进店铺页支付金额。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_shortvideo_metrics_week.prev_shop_page_pay_amount IS
  '上周同期窗口看后进店铺页支付金额。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_shortvideo_metrics_week.created_at IS
  '短视频周指标记录创建时间。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_shortvideo_metrics_week.updated_at IS
  '短视频周指标记录最近更新时间，由更新时间触发器维护。';
