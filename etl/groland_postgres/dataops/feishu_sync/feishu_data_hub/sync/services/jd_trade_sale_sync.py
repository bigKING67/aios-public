# jd_trade_sale_sync.py
from feishu_data_hub.sync.services.base_sync import SyncService
from feishu_data_hub.infra.config import get_feishu_config, get_postgres_config


class JdTradeSaleSyncService(SyncService):
    def __init__(self):
        feishu_config = get_feishu_config()
        pg_config = get_postgres_config()
        super().__init__(
            '京东店铺成交数据同步服务',
            feishu_config['bitable']['tables']['jd_trade_sale'],
            feishu_config['bitable']['field_mapping']['jd_trade_sale'],
            pg_config['tables']['jd_trade_sale']
        )
