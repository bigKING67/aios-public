# taobao_alimama_scenario_sync.py
from feishu_data_hub.sync.services.base_sync import SyncService
from feishu_data_hub.infra.config import get_feishu_config, get_postgres_config


class TaobaoAlimamaScenarioSyncService(SyncService):
    def __init__(self):
        feishu_config = get_feishu_config()
        pg_config = get_postgres_config()
        super().__init__(
            '淘宝阿里妈妈场景营销数据同步服务',
            feishu_config['bitable']['tables']['taobao_alimama_scenario'],
            feishu_config['bitable']['field_mapping']['taobao_alimama_scenario'],
            pg_config['tables']['taobao_alimama_scenario']
        )
