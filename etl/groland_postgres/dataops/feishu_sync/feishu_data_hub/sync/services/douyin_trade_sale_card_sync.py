# douyin_trade_sale_card_sync.py
from feishu_data_hub.sync.services.base_sync import SyncService
from feishu_data_hub.infra.config import get_feishu_config, get_postgres_config


class DouyinTradeSaleCardSyncService(SyncService):
    def __init__(self):
        feishu_config = get_feishu_config()
        pg_config = get_postgres_config()
        super().__init__(
            '抖音商品卡成交明细同步服务',
            feishu_config['bitable']['tables']['douyin_trade_sale_card'],
            feishu_config['bitable']['field_mapping']['douyin_trade_sale_card'],
            pg_config['tables']['douyin_trade_sale_card']
        )
