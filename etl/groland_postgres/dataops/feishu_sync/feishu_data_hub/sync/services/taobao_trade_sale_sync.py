# taobao_trade_sale_sync.py
from feishu_data_hub.sync.services.base_sync import SyncService
from feishu_data_hub.infra.config import get_feishu_config, get_postgres_config


class TaobaoTradeSaleSyncService(SyncService):
    def __init__(self):
        feishu_config = get_feishu_config()
        pg_config = get_postgres_config()
        super().__init__(
            '天猫全店交易数据同步服务',
            feishu_config['bitable']['tables']['taobao_trade_sale'],
            feishu_config['bitable']['field_mapping']['taobao_trade_sale'],
            pg_config['tables']['taobao_trade_sale']
        )
