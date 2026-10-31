import datetime as dt
import json
import unittest
from unittest.mock import MagicMock, Mock, patch
from content_production.cloud_video_client import CloudVideoClient, CloudVideoError
from content_production import cloud_video_push as worker
from content_production import cloud_video_push_contract as contract
from content_production.cloud_video_sync import in_type


class DeliveryContractTests(unittest.TestCase):
    def test_duration_majority_and_stable_ties_do_not_guess_missing_categories(self):
        segments = [{'assetId':'a','startMs':0,'endMs':4000}, {'assetId':'b','startMs':0,'endMs':8000}]
        self.assertEqual(contract.category(segments, {'a':[(1,2)],'b':[(1,3)]}), (1,3))
        segments[1]['endMs'] = 4000
        self.assertEqual(contract.category(segments, {'a':[(1,2)],'b':[(1,3)]}), (1,2))
        for choices in ({'a':[(1,2)]}, {'a':[(1,2),(1,4)],'b':[(1,3)]}):
            with self.assertRaises(contract.PushBlocked):
                contract.category(segments, choices)

    def test_name_uses_beijing_creation_day_mode_structure_batch_and_ordinal(self):
        row = dict(mode='sellingPoint', created_at=dt.datetime(2026,10,29,18,tzinfo=dt.timezone.utc),
                   preset_labels=[{'key':'voice','name':'混剪口播'}], labels=['voice'],
                   product_name='香粉\n',batch_id='a1b2c3d4-0000',ordinal=2)
        self.assertEqual(contract.video_name(row), '【AI卖点混剪】10.30-香粉-混剪口播-a1b2c3d4-02')

    def test_label_is_active_child_in_actual_target_category_and_must_be_unique(self):
        client = Mock()
        types = [{'id':1,'children':[{'id':2}]}]
        groups = [{'state':1,'children':[{'id':7,'level':2,'state':1,'name':'AI混剪'}]}]
        client.call.side_effect = [types,groups]
        self.assertEqual(contract.label_for(client,1,2), [7])
        groups[0]['children'].append({'id':8,'level':2,'state':1,'name':'AI混剪'})
        client.call.side_effect = [types,groups]
        with self.assertRaisesRegex(contract.PushBlocked,'label_ambiguous'):
            contract.label_for(client,1,2)
        client.call.side_effect = [types,groups]
        self.assertEqual(contract.label_for(client,1,2,(8,)), [8])
        client.call.side_effect = [types]
        with self.assertRaisesRegex(contract.PushBlocked,'category_unavailable'):
            contract.label_for(client,1,99)

    def test_import_is_json_string_single_item_with_stable_asset_third_id(self):
        body=contract.import_body(dict(video_name='样片',two_level_type_id=2,label_ids=[7],output_asset_id='asset-id'),
                                  'https://storage.example/video?signature=fixture',1)
        self.assertEqual(json.loads(body['videoJSON'])[0], dict(videoName='样片',videoType=0,twoLevelTypeId=2,
            labelIds='7',videoRight=1,url='https://storage.example/video?signature=fixture',thirdId='asset-id'))

    def test_only_explicit_one_matching_terminal_result_can_finish(self):
        for status in (0,3,10,20):
            state, video_id=contract.import_result({'list':[{'videoName':'v','status':status,'videoId':'123'}]},'v')
            self.assertEqual(state,{0:'importing',3:'importing',10:'succeeded',20:'failed'}[status])
            self.assertEqual(video_id,123 if status==10 else None)
        for data in ({'list':[]},{'list':[{'videoName':'wrong','status':10,'videoId':123}]},
                     {'list':[{'videoName':'v','status':10}]},{'list':[{'videoName':'v','status':42}]}):
            with self.assertRaises(contract.PushBlocked): contract.import_result(data,'v')
        self.assertEqual(contract.request_id({'requestId':'9007199254740993123'}),'9007199254740993123')
        for data in ({'requestId':True},{'requestId':3.1},{'requestId':'wrong'},{}):
            with self.assertRaises(contract.PushBlocked): contract.request_id(data)

    def test_transport_failure_or_rate_limit_is_never_replayed_by_write_client(self):
        for failure in (OSError('private request URL'),CloudVideoError(20002,'rate limited','/openapi/video/import')):
            transport=Mock();transport.post.side_effect=failure
            client=CloudVideoClient('https://vendor.example','fixture-key','fixture-secret',transport=transport,clock=lambda:100)
            client._token,client._token_at,client._account='fixture-token',100,'fixture-account'
            with self.assertRaises(type(failure)): client.write_once('/openapi/video/import',{})
            self.assertEqual(transport.post.call_count,1)

    def test_disabled_cli_never_opens_database_or_constructs_vendor_client(self):
        with patch.dict('os.environ',{'CONTENT_AI_STUDIO_DELIVERY_ENABLED':'false'}), \
             patch('sys.argv',['push','--once']), patch.object(worker.CloudVideoClient,'from_env') as client, \
             patch('marketing_content_assets.repository.connect_pg') as database, patch('builtins.print'):
            self.assertEqual(worker.main(),0)
            client.assert_not_called();database.assert_not_called()

    def test_ai_names_are_excluded_even_if_the_vendor_id_is_not_yet_known(self):
        self.assertFalse(in_type({'name':'【AI框架混剪】sample','videoType':0,'oneLevelVideoType':{'id':1}},1))
        self.assertTrue(in_type({'name':'人工成片','videoType':0,'oneLevelVideoType':{'id':1}},1))

    def test_delivery_and_playback_share_one_client_rate_window_and_lock(self):
        with patch.dict('os.environ',{'CONTENT_AI_STUDIO_DELIVERY_ENABLED':'true','CLOUD_VIDEO_PUSH_LABEL_IDS':'','CLOUD_VIDEO_PUSH_VIDEO_RIGHT':'1'}), \
             patch('sys.argv',['push','--once']), patch('marketing_content_assets.repository.connect_pg',return_value=MagicMock()), \
             patch('marketing_content_assets.tos_storage.TosStorageConfig.from_env'), patch('marketing_content_assets.tos_storage.TosStorageClient'), \
             patch.object(worker.CloudVideoClient,'from_env') as client, patch.object(worker,'api_lock',return_value=MagicMock()) as lock, \
             patch.object(worker,'run_once',return_value={}) as deliver, patch('content_production.cloud_video_playback_sync.refresh') as refresh, patch('builtins.print'):
            self.assertEqual(worker.main(),0)
            client.assert_called_once();lock.assert_called_once()
            self.assertIs(deliver.call_args.args[1],refresh.call_args.args[1])
