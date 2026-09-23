BEGIN;

ALTER TABLE ads.douyin_live_detail
  DROP CONSTRAINT IF EXISTS chk_douyin_live_detail_non_negative;

ALTER TABLE ads.douyin_live_detail
  ADD CONSTRAINT chk_douyin_live_detail_non_negative
  CHECK (
    live_session_count >= 0
    AND live_duration_minutes >= 0
    AND live_exposure_user_count >= 0
    AND live_exposure_count >= 0
    AND live_watch_user_count >= 0
    AND hourly_watch_user_count >= 0
    AND live_watch_count >= 0
    AND max_online_count >= 0
    AND avg_online_count >= 0
    AND avg_watch_duration_minutes >= 0
    AND comment_count >= 0
    AND new_live_group_count >= 0
    AND new_follower_count >= 0
    AND unfollow_count >= 0
    AND old_follower_watch_rate >= 0
    AND product_count >= 0
    AND live_product_exposure_user >= 0
    AND live_product_click_user >= 0
    AND live_product_exposure_count >= 0
    AND live_product_click_count >= 0
    AND live_order_count >= 0
    AND live_gmv >= 0
    AND live_user_pay_amount >= 0
    AND hourly_user_pay_amount >= 0
    AND live_sale_quantity >= 0
    AND live_buyer_count >= 0
    AND live_refund_order_count >= 0
    AND live_refund_amount >= 0
    AND live_refund_user_count >= 0
    AND estimated_commission >= 0
    AND product_click_rate_count >= 0
    AND product_click_rate_user >= 0
    AND click_to_pay_rate_count >= 0
    AND click_to_pay_rate_user >= 0
    AND watch_to_pay_rate_count >= 0
    AND watch_to_pay_rate_user >= 0
    AND presale_order_count >= 0
    AND presale_full_amount >= 0
    AND new_cart_group_count >= 0
    AND live_ad_cost >= 0
    AND net_order_count >= 0
    AND refund_amount_1h >= 0
    AND refund_order_count_1h >= 0
    AND refund_rate_1h >= 0
    AND coupon_guided_payment_amount >= 0
    AND coupon_guided_payment_rate >= 0
    AND coupon_subsidy_amount >= 0
    AND coupon_usage_count >= 0
    AND ad_cost_shop_bound >= 0
    AND ad_cost_shop_targeted >= 0
  );

COMMENT ON CONSTRAINT chk_douyin_live_detail_non_negative ON ads.douyin_live_detail
  IS 'Most live detail metrics must stay non-negative; net_gmv may be negative when refunds/adjustments exceed paid amount.';

COMMIT;
