DO $$
DECLARE
  v_invalid INTEGER;
BEGIN
  IF to_regclass('ads.influencer_live_roster') IS NULL THEN
    RAISE EXCEPTION 'table ads.influencer_live_roster not found';
  END IF;

  IF to_regclass('ads.influencer_live_detail') IS NULL THEN
    RAISE EXCEPTION 'table ads.influencer_live_detail not found';
  END IF;

  IF to_regclass('etl.creator_live_dashboard_refresh_state') IS NULL THEN
    RAISE EXCEPTION 'table etl.creator_live_dashboard_refresh_state not found';
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.influencer_live_roster
  WHERE influencer_name IS NULL
     OR BTRIM(influencer_name) = ''
     OR cooperation_status_norm IS NULL
     OR BTRIM(cooperation_status_norm) = '';

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'influencer_live_roster basic field check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.influencer_live_detail
  WHERE stat_date IS NULL
     OR platform IS NULL
     OR BTRIM(platform) = ''
     OR influencer_id IS NULL
     OR BTRIM(influencer_id) = ''
     OR live_session_count < 0
     OR live_duration_minutes < 0
     OR live_watch_user_count < 0
     OR live_exposure_user_count < 0
     OR live_product_click_user < 0
     OR live_order_count < 0
     OR live_refund_order_count < 0
     OR live_buyer_count < 0
     OR live_gmv < 0
     OR live_user_pay_amount < 0
     OR live_refund_amount < 0
     OR live_ad_cost < 0;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'influencer_live_detail metric check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM etl.creator_live_dashboard_refresh_state
  WHERE state_key = 'default';

  IF v_invalid <> 1 THEN
    RAISE EXCEPTION 'creator_live_dashboard_refresh_state default row check failed, rows: %', v_invalid;
  END IF;

  RAISE NOTICE 'influencer_live_dashboard checks passed';
END;
$$;
