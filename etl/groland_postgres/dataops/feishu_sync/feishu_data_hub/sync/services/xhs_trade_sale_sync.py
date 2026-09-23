# xhs_trade_sale_sync.py
from feishu_data_hub.sync.services.base_sync import SyncService
from feishu_data_hub.infra.config import get_feishu_config, get_postgres_config


class XhsTradeSaleSyncService(SyncService):
    def __init__(self):
        feishu_config = get_feishu_config()
        pg_config = get_postgres_config()
        super().__init__(
            '小红书店铺交易数据同步服务',
            feishu_config['bitable']['tables']['xhs_trade_sale'],
            feishu_config['bitable']['field_mapping']['xhs_trade_sale'],
            pg_config['tables']['xhs_trade_sale']
        )
