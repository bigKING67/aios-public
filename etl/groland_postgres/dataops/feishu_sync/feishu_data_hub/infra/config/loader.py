"""配置加载器 - 延迟加载，按需校验"""
import os
from typing import Dict, Any, Optional, List
from functools import lru_cache
from dotenv import load_dotenv

from feishu_data_hub.infra.utils.exceptions import ConfigException

# 加载 .env 文件
load_dotenv()


def _iter_env_keys(primary: str, aliases: Optional[List[str]] = None) -> List[str]:
    """返回按优先级排列的环境变量键名列表"""
    keys = [primary]
    if aliases:
        keys.extend(aliases)
    return keys


def _get_required_env(var_name: str, aliases: Optional[List[str]] = None) -> str:
    """获取必需的环境变量，缺失时抛出异常"""
    for key in _iter_env_keys(var_name, aliases):
        value = os.getenv(key)
        if value:
            return value
    all_keys = ", ".join(_iter_env_keys(var_name, aliases))
    raise ConfigException(f"缺少必需的环境变量（任选其一）: {all_keys}")


def _get_optional_env(
    var_name: str,
    default: Optional[str] = None,
    aliases: Optional[List[str]] = None
) -> Optional[str]:
    """获取可选的环境变量（支持别名）"""
    for key in _iter_env_keys(var_name, aliases):
        value = os.getenv(key)
        if value is not None:
            return value
    return default


def _get_optional_int_env(
    var_name: str,
    default: int,
    aliases: Optional[List[str]] = None
) -> int:
    """获取可选整数环境变量，非法值时抛出配置异常"""
    value = _get_optional_env(var_name, aliases=aliases)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError as exc:
        raise ConfigException(f"环境变量 {var_name} 必须是整数，当前值: {value}") from exc


def _get_optional_float_env(
    var_name: str,
    default: float,
    aliases: Optional[List[str]] = None
) -> float:
    """获取可选浮点环境变量，非法值时抛出配置异常"""
    value = _get_optional_env(var_name, aliases=aliases)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError as exc:
        raise ConfigException(f"环境变量 {var_name} 必须是数字，当前值: {value}") from exc


@lru_cache(maxsize=1)
def get_feishu_config() -> Dict[str, Any]:
    """
    获取飞书配置（延迟加载，首次调用时校验）

    Returns:
        飞书配置字典

    Raises:
        ConfigException: 必需的环境变量缺失
    """
    return {
        'app_id': _get_required_env('FEISHU_APP_ID'),
        'app_secret': _get_required_env('FEISHU_APP_SECRET'),
        'base_url': _get_optional_env('FEISHU_BASE_URL', 'https://open.feishu.cn/open-apis'),
        'bitable': {
            'app_token': _get_required_env('FEISHU_APP_TOKEN'),
            'tables': {
                'douyin_trade_sale': _get_optional_env('FEISHU_TABLE_DOUYIN_TRADE_SALE'),
                'douyin_trade_sale_live': _get_optional_env('FEISHU_TABLE_DOUYIN_TRADE_SALE_LIVE'),
                'douyin_trade_sale_card': _get_optional_env('FEISHU_TABLE_DOUYIN_TRADE_SALE_CARD'),
                'taobao_trade_sale': _get_optional_env('FEISHU_TABLE_TAOBAO_TRADE_SALE'),
                'xhs_trade_sale': _get_optional_env('FEISHU_TABLE_XHS_TRADE_SALE'),
                'taobao_alimama_scenario': _get_optional_env('FEISHU_TABLE_TAOBAO_ALIMAMA_SCENARIO'),
                'jd_trade_sale': _get_optional_env('FEISHU_TABLE_JD_TRADE_SALE'),
                'wx_trade_sale': _get_optional_env('FEISHU_TABLE_WX_TRADE_SALE'),
            },
            'field_mapping': _get_field_mappings(),
        },
    }


def _get_field_mappings() -> Dict[str, Dict[str, str]]:
    """获取字段映射配置"""
    return {
        'douyin_trade_sale': {
            'stat_date': '日期',
            'shop_name': '店铺名称',
            'shop_id': '店铺ID',
            'carrier_type': '载体类型',
            'promotion_period': '投放时段',
            'user_pay_amount': '用户支付金额',
            'smart_coupon_amount': '智能优惠券金额',
            'platform_subsidy_amount': '电商平台补贴金额',
            'refund_user_pay_amount': '退款后用户支付金额(支付时间)',
            'refund_smart_coupon_amount': '退款后智能优惠券金额(支付时间)',
            'refund_platform_subsidy_amount': '退款后电商平台补贴金额(支付时间)',
            'order_count': '成交订单数',
            'buyer_count': '成交人数',
            'avg_order_amount': '客单价',
            'pay_per_thousand_exposure': '千次曝光用户支付金额',
            'refund_amount_pay_time': '退款金额(支付时间)',
            'refund_rate_pay_time': '退款率(支付时间)',
            'refund_order_count_refund_time': '退款订单数(退款时间)',
            'refund_amount_refund_time': '退款金额(退款时间)',
            'exposure_user_count': '商品曝光人数',
            'click_user_count': '商品点击人数',
            'exposure_count': '商品曝光次数',
            'click_count': '商品点击次数',
            'click_rate': '商品点击率(次数)',
            'click_to_pay_rate': '商品点击-成交转化率(次数)',
            'presale_deposit': '预售定金',
            'influencer_subsidy_amount': '达人补贴金额',
            'refund_order_count_pay_time': '退款订单数(支付时间)',
            'trade_refund_amount_pay_time': '成交退款金额(支付时间)',
            'trade_refund_amount_refund_time': '成交退款金额(退款时间)',
            'commission_exemption': '全域实际免除佣金',
        },
        'douyin_trade_sale_live': {
            'shop_name': '店铺名称',
            'shop_id': '店铺ID',
            'anchor_avatar': '主播头像',
            'anchor_nickname': '主播昵称',
            'anchor_douyin_id': '主播抖音号',
            'live_start_time': '直播开始时间',
            'live_end_time': '直播结束时间',
            'live_duration_minutes': '直播时长(分钟)',
            'live_exposure_user_count': '直播间曝光人数',
            'live_exposure_count': '直播间曝光次数',
            'live_watch_user_count': '直播间观看人数',
            'hourly_watch_user_count': '单小时观看人数',
            'live_watch_count': '直播间观看次数',
            'max_online_count': '最高在线人数',
            'avg_online_count': '平均在线人数',
            'avg_watch_duration_minutes': '人均观看时长(分钟)',
            'comment_count': '评论次数',
            'new_live_group_count': '新加直播团人数',
            'new_follower_count': '新增粉丝数',
            'unfollow_count': '取关粉丝数',
            'old_follower_watch_rate': '观看老粉占比',
            'product_count': '带货商品数',
            'live_product_exposure_user': '直播间商品曝光人数',
            'live_product_click_user': '直播间商品点击人数',
            'live_product_exposure_count': '直播间商品曝光次数',
            'live_product_click_count': '直播间商品点击次数',
            'live_order_count': '直播间成交订单数',
            'live_gmv': '直播间成交金额',
            'live_user_pay_amount': '直播间用户支付金额',
            'hourly_user_pay_amount': '单小时用户支付金额',
            'live_sale_quantity': '直播间成交件数',
            'live_buyer_count': '直播间成交人数',
            'live_refund_order_count': '直播间退款订单数',
            'live_refund_amount': '直播间退款金额',
            'live_refund_user_count': '直播间退款人数',
            'estimated_commission': '预估佣金支出',
            'product_click_rate_count': '商品曝光-点击率(次数)',
            'product_click_rate_user': '商品曝光-点击率(人数)',
            'click_to_pay_rate_count': '商品点击-成交率(次数)',
            'click_to_pay_rate_user': '商品点击-成交率(人数)',
            'watch_to_pay_rate_count': '观看-成交率(次数)',
            'watch_to_pay_rate_user': '观看-成交率(人数)',
            'presale_order_count': '预售订单数',
            'presale_full_amount': '预售全款金额',
            'new_cart_group_count': '新加购物团人数',
            'live_ad_cost': '直播间投放消耗',
            'net_gmv': '净成交金额',
            'net_order_count': '净成交订单数',
            'refund_amount_1h': '1小时退款金额',
            'refund_order_count_1h': '1小时退款订单数',
            'refund_rate_1h': '1小时退款率',
        },
        'douyin_trade_sale_card': {
            'date': '日期',
            'shop_name': '店铺名称',
            'shop_id': '店铺ID',
            'product_title': '商品标题',
            'product_id': '商品ID',
            'product_url': '商品链接',
            'card_exposure_user_count': '商品卡曝光人数',
            'card_click_user_count': '商品卡点击人数',
            'card_click_rate_user': '商品卡点击率(人数)',
            'card_click_count': '商品卡点击次数',
            'card_avg_click_per_user': '商品卡人均点击次数',
            'new_customer_click_count': '新客点击人数',
            'old_customer_click_count': '老客点击人数',
            'new_customer_click_rate': '新客点击占比',
            'old_customer_click_rate': '老客点击占比',
            'card_user_pay_amount': '商品卡用户支付金额',
            'card_order_count': '商品卡成交订单数',
            'card_buyer_count': '商品卡成交人数',
            'card_avg_order_value': '商品卡成交客单价',
            'card_click_to_pay_rate_user': '商品卡点击-成交转化率(人数)',
            'first_buy_user_count': '首购用户数',
            'rebuy_user_count': '复购用户数',
            'first_buy_new_rate': '首购新客占比',
            'rebuy_old_rate': '复购老客占比',
            'card_exposure_count': '商品卡曝光次数',
            'card_exposure_to_pay_rate_user': '商品卡曝光-成交转化率(人数)',
            'card_exposure_to_pay_rate_count': '商品卡曝光-成交转化率(次数)',
            'card_gpm': '商品卡千次曝光用户支付金额',
            'card_click_rate_count': '商品卡点击率(次数)',
            'card_click_to_pay_rate_count': '商品卡点击-成交转化率(次数)',
            'card_cart_user_count': '商品卡加购人数',
            'card_favorite_user_count': '商品卡收藏人数',
            'platform_support_exposure_count': '平台扶持曝光次数',
        },
        'taobao_trade_sale': {
            'stat_date': '统计日期',
            'shop_name': '店铺名称',
            'shop_id': '店铺ID',
            'visitor_count': '访客数',
            'live_visitor_count': '直播间访客数',
            'short_video_visitor_count': '短视频访客数',
            'graphic_visitor_count': '图文访客数',
            'shop_page_visitor_count': '店铺页访客数',
            'app_3d_visitor_count': '3D应用访客数',
            'page_view': '浏览量',
            'product_visitor_count': '商品访客数',
            'product_page_view': '商品浏览量',
            'avg_stay_duration': '平均停留时长',
            'bounce_rate': '跳失率',
            'product_favorite_buyer_count': '商品收藏买家数',
            'product_favorite_count': '商品收藏次数',
            'cart_buyer_count': '加购人数',
            'pay_amount': '支付金额',
            'pay_buyer_count': '支付买家数',
            'pay_sub_order_count': '支付子订单数',
            'pay_quantity': '支付件数',
            'order_amount': '下单金额',
            'order_buyer_count': '下单买家数',
            'order_quantity': '下单件数',
            'order_conversion_rate': '下单转化率',
            'pay_conversion_rate': '支付转化率',
            'avg_order_value': '客单价',
            'uv_value': 'UV价值',
            'old_visitor_count': '老访客数',
            'new_visitor_count': '新访客数',
            'cart_quantity': '加购件数',
            'pay_new_buyer_count': '支付新买家数',
            'pay_old_buyer_count': '支付老买家数',
            'old_buyer_pay_amount': '老买家支付金额',
            'keyword_ad_cost': '关键词推广花费',
            'crowd_ad_cost': '精准人群推广花费',
            'smart_scene_cost': '智能场景花费',
            'taoke_commission': '淘宝客佣金',
            'refund_amount': '成功退款金额',
            'review_count': '评价数',
            'review_with_image_count': '有图评价数',
            'positive_review_count': '正面评价数',
            'negative_review_count': '负面评价数',
            'old_buyer_positive_review_count': '老买家正面评价数',
            'old_buyer_negative_review_count': '老买家负面评价数',
            'pay_parent_order_count': '支付父订单数',
            'pickup_package_count': '揽收包裹数',
            'ship_package_count': '发货包裹数',
            'deliver_package_count': '派送包裹数',
            'sign_package_count': '签收成功包裹数',
            'avg_pay_to_sign_duration': '平均支付-签收时长(秒)',
            'description_score': '描述相符评分',
            'logistics_score': '物流服务评分',
            'service_score': '服务态度评分',
            'order_to_pay_conversion_rate': '下单-支付转化率',
            'pay_product_count': '支付商品数',
            'follow_shop_count': '关注店铺人数',
            'member_total_count': '会员总数',
            'new_member_count': '新增会员数',
            'active_member_count': '活跃会员数',
            'member_pay_amount': '会员成交金额',
            'member_pay_buyer_count': '会员成交人数',
            'site_ad_cost': '全站推广花费',
        },
        'xhs_trade_sale': {
            'shop_name': '店铺名称',
            'shop_id': '店铺ID',
            'stat_date': '统计日期',
            'pay_amount': '支付金额',
            'pay_order_count': '支付订单数',
            'pay_quantity': '支付件数',
            'pay_buyer_count': '支付买家数',
            'visitor_count': '总访客数',
            'page_view': '总浏览量',
            'avg_order_value': '客单价',
            'product_page_view': '商品浏览量',
            'product_visitor_count': '商品访客数',
            'new_cart_buyer_count': '新增加购人数',
            'new_cart_quantity': '新增加购件数',
            'new_wishlist_buyer_count': '新增加入心愿单人数',
            'product_click_rate_pv': '商品点击率(PV)',
            'pay_conversion_rate_uv': '支付转化率(UV)',
            'pay_conversion_rate_pv': '支付转化率(PV)',
            'gpm': '商品千次曝光成交金额',
            'refund_amount': '退款金额(退款时间)',
            'refund_buyer_count': '退款买家数(退款时间)',
            'refund_order_count': '退款订单数(退款时间)',
            'refund_order_rate': '退款订单占比(退款时间)',
        },
        'taobao_alimama_scenario': {
            'shop_name': '店铺名称',
            'account_id': '账户ID',
            'stat_date': '日期',
            'scenario_id': '场景ID',
            'scenario_name': '场景名字',
            'original_sub_scenario_id': '原二级场景ID',
            'original_sub_scenario_name': '原二级场景名字',
            'impression_count': '展现量',
            'click_count': '点击量',
            'cost': '花费',
            'click_rate': '点击率',
            'avg_click_cost': '平均点击花费',
            'cpm': '千次展现花费',
            'presale_gmv': '总预售成交金额',
            'presale_order_count': '总预售成交笔数',
            'direct_presale_gmv': '直接预售成交金额',
            'direct_presale_order_count': '直接预售成交笔数',
            'indirect_presale_gmv': '间接预售成交金额',
            'indirect_presale_order_count': '间接预售成交笔数',
            'direct_gmv': '直接成交金额',
            'indirect_gmv': '间接成交金额',
            'total_gmv': '总成交金额',
            'total_order_count': '总成交笔数',
            'direct_order_count': '直接成交笔数',
            'indirect_order_count': '间接成交笔数',
            'click_conversion_rate': '点击转化率',
            'roi': '投入产出比',
            'roi_with_presale': '含预售投产比',
            'total_cpa': '总成交成本',
            'total_cart_count': '总购物车数',
            'direct_cart_count': '直接购物车数',
            'indirect_cart_count': '间接购物车数',
            'cart_rate': '加购率',
            'favorite_product_count': '收藏宝贝数',
            'favorite_shop_count': '收藏店铺数',
            'favorite_shop_cost': '店铺收藏成本',
            'total_favorite_cart_count': '总收藏加购数',
            'total_favorite_cart_cost': '总收藏加购成本',
            'product_favorite_cart_count': '宝贝收藏加购数',
            'product_favorite_cart_cost': '宝贝收藏加购成本',
            'total_favorite_count': '总收藏数',
            'product_favorite_cost': '宝贝收藏成本',
            'product_favorite_rate': '宝贝收藏率',
            'cart_cost': '加购成本',
            'submit_order_count': '拍下订单笔数',
            'submit_order_amount': '拍下订单金额',
            'direct_favorite_product_count': '直接收藏宝贝数',
            'indirect_favorite_product_count': '间接收藏宝贝数',
            'coupon_claim_count': '优惠券领取量',
            'shopping_fund_order_count': '购物金充值笔数',
            'shopping_fund_amount': '购物金充值金额',
            'wangwang_consult_count': '旺旺咨询量',
            'guided_visit_count': '引导访问量',
            'guided_visitor_count': '引导访问人数',
            'guided_potential_visitor_count': '引导访问潜客数',
            'guided_potential_visitor_rate': '引导访问潜客占比',
            'member_join_rate': '入会率',
            'member_join_count': '入会量',
            'guided_visit_rate': '引导访问率',
            'deep_visit_count': '深度访问量',
            'avg_page_view': '平均访问页面数',
            'new_buyer_count': '成交新客数',
            'new_buyer_rate': '成交新客占比',
            'member_first_buy_count': '会员首购人数',
            'member_gmv': '会员成交金额',
            'member_order_count': '会员成交笔数',
            'buyer_count': '成交人数',
            'avg_order_per_buyer': '人均成交笔数',
            'avg_gmv_per_buyer': '人均成交金额',
            'organic_gmv': '自然流量转化金额',
            'organic_impression_count': '自然流量曝光量',
        },
        'jd_trade_sale': {
            'shop_name': '店铺',
            'shop_id': '店铺ID',
            'stat_date': '日期',
            'gmv': '成交金额',
            'visitor_count': '访客数',
            'buyer_count': '成交客户数',
            'order_conversion_rate': '成交转化率',
            'order_count': '成交单量',
            'refund_amount': '取消及售后退款金额',
        },
        'wx_trade_sale': {
            'shop_name': '店铺名称',
            'shop_id': '店铺ID',
            'stat_date': '日期',
            'visit_to_pay_conversion_rate': '访问-支付转化率',
            'avg_order_value': '客单价',
            'refund_amount': '成功退款金额',
            'visitor_count': '访客数',
            'total_deal_amount': '总成交金额',
            'pay_amount': '支付金额',
            'pay_quantity': '支付件数',
            'pay_buyer_count': '支付人数',
            'product_exposure_count': '商品曝光次数',
            'product_page_view': '商品浏览量',
            'pay_order_count': '支付订单数',
        },
    }


def _build_table_config(table_env: str, pk_env: str, wm_env: str) -> Dict[str, Any]:
    """构建单个表的配置"""
    table_name = _get_optional_env(table_env)
    if not table_name:
        return None

    pk_value = _get_optional_env(pk_env, 'id')
    primary_key = [k.strip() for k in pk_value.split(',')] if ',' in pk_value else pk_value

    return {
        'name': table_name,
        'primary_key': primary_key,
        'watermark_column': _get_optional_env(wm_env)
    }


@lru_cache(maxsize=1)
def get_postgres_config() -> Dict[str, Any]:
    """
    获取 PostgreSQL 配置（延迟加载，首次调用时校验）

    Returns:
        PostgreSQL 配置字典

    Raises:
        ConfigException: 必需的环境变量缺失
    """
    return {
        'host': _get_required_env('PG_HOST', aliases=['PGHOST']),
        'port': _get_optional_int_env('PG_PORT', 5432, aliases=['PGPORT']),
        'user': _get_required_env('PG_USER', aliases=['PGUSER']),
        'password': _get_required_env('PG_PASSWORD', aliases=['PGPASSWORD']),
        'database': _get_required_env('PG_DATABASE', aliases=['PGDATABASE']),
        'connect_timeout': _get_optional_int_env('PG_CONNECT_TIMEOUT', 20, aliases=['PGCONNECT_TIMEOUT']),
        'pool_init_retries': _get_optional_int_env('PG_POOL_INIT_RETRIES', 3),
        'pool_retry_backoff_seconds': _get_optional_float_env('PG_POOL_RETRY_BACKOFF_SECONDS', 2.0),
        'keepalives_idle': _get_optional_int_env('PG_KEEPALIVES_IDLE', 30),
        'keepalives_interval': _get_optional_int_env('PG_KEEPALIVES_INTERVAL', 10),
        'keepalives_count': _get_optional_int_env('PG_KEEPALIVES_COUNT', 3),
        'sync_state_table': _get_optional_env('PG_SYNC_STATE_TABLE', 'sync_state'),
        'tables': {
            'douyin_trade_sale': _build_table_config(
                'PG_TABLE_DOUYIN_TRADE_SALE',
                'PG_PK_DOUYIN_TRADE_SALE',
                'PG_WM_DOUYIN_TRADE_SALE'
            ),
            'douyin_trade_sale_live': _build_table_config(
                'PG_TABLE_DOUYIN_TRADE_SALE_LIVE',
                'PG_PK_DOUYIN_TRADE_SALE_LIVE',
                'PG_WM_DOUYIN_TRADE_SALE_LIVE'
            ),
            'douyin_trade_sale_card': _build_table_config(
                'PG_TABLE_DOUYIN_TRADE_SALE_CARD',
                'PG_PK_DOUYIN_TRADE_SALE_CARD',
                'PG_WM_DOUYIN_TRADE_SALE_CARD'
            ),
            'taobao_trade_sale': _build_table_config(
                'PG_TABLE_TAOBAO_TRADE_SALE',
                'PG_PK_TAOBAO_TRADE_SALE',
                'PG_WM_TAOBAO_TRADE_SALE'
            ),
            'xhs_trade_sale': _build_table_config(
                'PG_TABLE_XHS_TRADE_SALE',
                'PG_PK_XHS_TRADE_SALE',
                'PG_WM_XHS_TRADE_SALE'
            ),
            'taobao_alimama_scenario': _build_table_config(
                'PG_TABLE_TAOBAO_ALIMAMA_SCENARIO',
                'PG_PK_TAOBAO_ALIMAMA_SCENARIO',
                'PG_WM_TAOBAO_ALIMAMA_SCENARIO'
            ),
            'jd_trade_sale': _build_table_config(
                'PG_TABLE_JD_TRADE_SALE',
                'PG_PK_JD_TRADE_SALE',
                'PG_WM_JD_TRADE_SALE'
            ),
            'wx_trade_sale': _build_table_config(
                'PG_TABLE_WX_TRADE_SALE',
                'PG_PK_WX_TRADE_SALE',
                'PG_WM_WX_TRADE_SALE'
            ),
        },
    }


def clear_config_cache():
    """清除配置缓存（用于测试或重新加载）"""
    get_feishu_config.cache_clear()
    get_postgres_config.cache_clear()
