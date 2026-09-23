# douyin_trade_sale_live_sync.py
from feishu_data_hub.sync.services.base_sync import SyncService
from feishu_data_hub.infra.config import get_feishu_config, get_postgres_config


class DouyinTradeSaleLiveSyncService(SyncService):
    def __init__(self):
        feishu_config = get_feishu_config()
        pg_config = get_postgres_config()
        super().__init__(
            '抖音全店成交直播明细同步服务',
            feishu_config['bitable']['tables']['douyin_trade_sale_live'],
            feishu_config['bitable']['field_mapping']['douyin_trade_sale_live'],
            pg_config['tables']['douyin_trade_sale_live']
        )
