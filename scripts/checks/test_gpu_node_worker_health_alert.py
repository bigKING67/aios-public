"""Decision contracts for the GPU-node worker health alert; nothing is sent."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

SPEC = importlib.util.spec_from_file_location('worker_health_alert',
    Path(__file__).resolve().parents[1] / 'ops/gpu-node/worker-health-alert.py')
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)

UNIT = 'aios-competitor-worker'
NOW = 1_800_000_000


def run(active, restarts, previous):
    return m.evaluate({UNIT: {'active': active, 'restarts': restarts}}, previous, NOW)


class EvaluateTest(unittest.TestCase):
    def test_first_run_only_records_a_baseline(self):
        alerts, recoveries, state = run('active', 290, {})
        self.assertEqual((alerts, recoveries), ([], []))
        self.assertEqual(state[UNIT], {'restarts': 290, 'alerted_at': None})

    def test_crash_loop_alerts_once_per_hour(self):
        alerts, _, state = run('active', 10, {UNIT: {'restarts': 1, 'alerted_at': None}})
        self.assertEqual([(a[0], a[2]) for a in alerts], [(UNIT, 9)])
        self.assertEqual(state[UNIT]['alerted_at'], NOW)
        alerts, _, state = run('active', 20, {UNIT: {'restarts': 10, 'alerted_at': NOW - 600}})
        self.assertEqual(alerts, [])
        self.assertEqual(state[UNIT]['alerted_at'], NOW - 600)
        alerts, _, _ = run('active', 30, {UNIT: {'restarts': 20, 'alerted_at': NOW - 3600}})
        self.assertEqual(len(alerts), 1)

    def test_single_restart_is_not_a_crash_loop(self):
        alerts, _, _ = run('active', 5, {UNIT: {'restarts': 4, 'alerted_at': None}})
        self.assertEqual(alerts, [])

    def test_failed_unit_alerts_without_restarts(self):
        alerts, _, _ = run('failed', 4, {UNIT: {'restarts': 4, 'alerted_at': None}})
        self.assertEqual(len(alerts), 1)

    def test_recovery_after_alert_is_reported_once(self):
        alerts, recoveries, state = run('active', 12, {UNIT: {'restarts': 12, 'alerted_at': NOW - 300}})
        self.assertEqual((alerts, recoveries), ([], [UNIT]))
        self.assertIsNone(state[UNIT]['alerted_at'])
        _, recoveries, _ = run('active', 12, state)
        self.assertEqual(recoveries, [])

    def test_counter_reset_by_manual_restart_counts_from_zero(self):
        alerts, recoveries, state = run('active', 0, {UNIT: {'restarts': 292, 'alerted_at': NOW - 300}})
        self.assertEqual((alerts, recoveries), ([], [UNIT]))
        self.assertEqual(state[UNIT]['restarts'], 0)

    def test_redacts_credentials_in_error_lines(self):
        line = m.redact('connect postgres://aios:hunter2@db/x failed; password=abc token: xyz')
        self.assertNotIn('hunter2', line)
        self.assertNotIn('abc', line)
        self.assertNotIn('xyz', line)


class BusinessLinkTest(unittest.TestCase):
    def test_alert_requires_two_failed_probes_and_recovery_is_sent_once(self):
        alert, recovery, state = m.evaluate_link({'database': False}, {}, NOW)
        self.assertFalse(alert or recovery)
        alert, recovery, state = m.evaluate_link({'database': False}, state, NOW + 300)
        self.assertTrue(alert); self.assertFalse(recovery)
        alert, recovery, state = m.evaluate_link({'database': False}, state, NOW + 600)
        self.assertFalse(alert or recovery)
        alert, recovery, state = m.evaluate_link({'database': True}, state, NOW + 900)
        self.assertFalse(alert); self.assertTrue(recovery)
        alert, recovery, _ = m.evaluate_link({'database': True}, state, NOW + 1200)
        self.assertFalse(alert or recovery)

    def test_vps_checks_peer_even_when_container_probe_failed(self):
        results = [Mock(returncode=1, stdout='not JSON secret-value'), Mock(returncode=1)]
        with patch.object(m.subprocess, 'run', side_effect=results) as run, \
                patch.dict(m.os.environ, {'AIOS_GPU_NODE_TAILSCALE_IP': '100.64.0.1'}):
            checks = m.business_link(vps=True)
        self.assertEqual(checks, {'probe': False, 'desktop_peer': False})
        self.assertEqual(run.call_args_list[0].args[0][:2], ['docker', 'exec'])
        self.assertEqual(run.call_args_list[1].args[0][:2], ['tailscale', 'ping'])
        self.assertNotIn('secret-value', str(checks))

    def test_check_only_never_sends_or_writes_state(self):
        with patch.object(m.sys, 'argv', ['health', '--check-only']), \
                patch.object(m, 'business_link', return_value={'database': True, 'storage': False}), \
                patch.object(m, 'send') as send, patch.object(m, 'STATE_PATH') as state:
            self.assertEqual(m.main(), 1)
        send.assert_not_called(); state.write_text.assert_not_called()

    def test_invalid_peer_never_becomes_a_shell_command(self):
        with patch.object(m.subprocess, 'run', return_value=Mock(stdout='{}', returncode=1)) as run, \
                patch.dict(m.os.environ, {'AIOS_GPU_NODE_TAILSCALE_IP': 'bad; command'}):
            self.assertFalse(m.business_link(vps=True)['desktop_peer'])
        self.assertEqual(run.call_count, 1)


class NotificationTest(unittest.TestCase):
    def test_group_recipient_wins_without_sending_a_personal_copy(self):
        env = {'AIOS_NOTIFY_FEISHU_APP_ID': 'app', 'AIOS_NOTIFY_FEISHU_APP_SECRET': 'test-secret',
               'AIOS_NOTIFY_FEISHU_CHAT_ID': 'oc_group', 'AIOS_NOTIFY_FEISHU_OPEN_ID': 'ou_person'}
        card = m.build_card('AIOS · 测试', 'success', '测试通知', 'desktop', ['类型：测试'], '仅供测试', NOW)
        with patch.dict(m.os.environ, env, clear=True), \
                patch.object(m, 'feishu_call', side_effect=[{'tenant_access_token': 'test-token'}, {'code': 0}]) as call:
            m.send(card)
        self.assertEqual(call.call_count, 2)
        path, payload, token = call.call_args.args
        self.assertEqual(path, '/im/v1/messages?receive_id_type=chat_id')
        self.assertEqual(payload['receive_id'], 'oc_group')
        self.assertEqual(payload['msg_type'], 'interactive')
        self.assertEqual(json.loads(payload['content']), card)
        self.assertEqual(token, 'test-token')
        self.assertNotIn('ou_person', json.dumps(call.call_args.args))

    def test_personal_recipient_remains_compatible(self):
        with patch.dict(m.os.environ, {'AIOS_NOTIFY_FEISHU_OPEN_ID': 'ou_person'}, clear=True):
            self.assertEqual(m.notification_target(), ('open_id', 'ou_person'))

    def test_invalid_explicit_group_never_falls_back_or_calls_api(self):
        for invalid in ('', '   ', 'ou_person', 'oc_group&receive_id_type=open_id'):
            with self.subTest(invalid=invalid), \
                    patch.dict(m.os.environ, {'AIOS_NOTIFY_FEISHU_CHAT_ID': invalid,
                                             'AIOS_NOTIFY_FEISHU_OPEN_ID': 'ou_person'}, clear=True), \
                    patch.object(m, 'feishu_call') as call, self.assertRaises(ValueError):
                m.send({})
            call.assert_not_called()
        with patch.dict(m.os.environ, {}, clear=True), self.assertRaises(ValueError):
            m.notification_target()

    def test_card_quotes_untrusted_log_text_and_redacts_credentials(self):
        card = m.build_card('AIOS · Worker 故障', 'error', '服务异常', 'DESKTOP_TEST',
                            ['<at id=all></at> [link](https://example.test) token=private-value'],
                            '请核查日志', NOW)
        content = json.dumps(card, ensure_ascii=False)
        self.assertNotIn('<at ', content)
        self.assertNotIn('[link]', content)
        self.assertNotIn('private-value', content)
        self.assertIn('&#60;at ', content)
        self.assertIn('UTC+08:00', content)

    def test_main_uses_severity_cards_without_changing_alert_frequency(self):
        for scenario in ('link_warning', 'link_recovery', 'worker_error', 'worker_recovery', 'healthy'):
            with self.subTest(scenario=scenario), tempfile.TemporaryDirectory() as directory:
                state = Path(directory) / 'state.json'
                previous = {UNIT: {'restarts': 4, 'alerted_at': NOW - 300 if scenario == 'worker_recovery' else None},
                            'business_link': {'failures': 1 if scenario == 'link_warning' else 0,
                                              'alerted_at': NOW - 300 if scenario == 'link_recovery' else None}}
                state.write_text(json.dumps(previous))
                checks = {'database': True, 'storage': scenario != 'link_warning'}
                status = {'active': 'failed' if scenario == 'worker_error' else 'active', 'restarts': 4}
                with patch.object(m.sys, 'argv', ['health']), patch.object(m, 'STATE_PATH', state), \
                        patch.object(m, 'UNITS', [UNIT]), patch.object(m, 'unit_status', return_value=status), \
                        patch.object(m, 'business_link', return_value=checks), \
                        patch.object(m.time, 'time', return_value=NOW), patch.object(m, 'last_error', return_value='Error: stopped'), \
                        patch.object(m, 'send') as send:
                    self.assertEqual(m.main(), 0)
                if scenario == 'healthy':
                    send.assert_not_called()
                    continue
                send.assert_called_once()
                card = send.call_args.args[0]
                color = {'link_warning': 'yellow', 'link_recovery': 'green',
                         'worker_error': 'red', 'worker_recovery': 'green'}[scenario]
                self.assertEqual(card['schema'], '2.0')
                self.assertEqual(card['header']['template'], color)
                content = json.dumps(card, ensure_ascii=False)
                if scenario == 'link_warning':
                    self.assertIn('文件存储', content)
                    self.assertIn('连续失败：2 次检查', content)
                if scenario == 'link_recovery':
                    self.assertIn('数据库、文件存储', content)
                    self.assertIn('请以数据库为准', content)

    def test_send_failure_preserves_previous_state_for_next_run(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory) / 'state.json'
            original = json.dumps({'business_link': {'failures': 1, 'alerted_at': None}})
            state.write_text(original)
            with patch.object(m.sys, 'argv', ['health', '--vps']), patch.object(m, 'STATE_PATH', state), \
                    patch.object(m, 'business_link', return_value={'storage': False}), \
                    patch.object(m, 'send', side_effect=RuntimeError('send failed')), self.assertRaises(RuntimeError):
                m.main()
            self.assertEqual(state.read_text(), original)

    def test_test_card_does_not_probe_or_write_monitoring_state(self):
        with patch.object(m.sys, 'argv', ['health', '--test']), patch.object(m, 'business_link') as probe, \
                patch.object(m, 'STATE_PATH') as state, patch.object(m, 'send') as send:
            self.assertEqual(m.main(), 0)
        probe.assert_not_called()
        state.write_text.assert_not_called()
        self.assertEqual(send.call_args.args[0]['header']['template'], 'green')
        self.assertIn('不代表业务链路', json.dumps(send.call_args.args[0], ensure_ascii=False))



# 2026-10-31 (Saturday) in Beijing; the daily sync ran at 06:35 that morning in the good case.
DAY = 1_793_376_000  # 2026-10-31 00:00 UTC+08:00
AT = lambda hour, minute=0: DAY + hour * 3600 + minute * 60  # noqa: E731
TEAM = 'aios-cloud-video-team-sync'


def sync(result, exited_at):
    return {'result': result, 'status': '0' if result == 'success' else '1', 'exited_at': exited_at}


class SyncAlertTest(unittest.TestCase):
    def test_a_failed_run_alerts_once_and_a_later_success_recovers(self):
        failures, _, _, state = m.evaluate_syncs({TEAM: sync('exit-code', AT(6, 35))}, {}, AT(6, 40))
        self.assertEqual([u for u, _ in failures], [TEAM])
        failures, recoveries, _, state = m.evaluate_syncs({TEAM: sync('exit-code', AT(6, 35))}, state, AT(6, 45))
        self.assertEqual((failures, recoveries), ([], []))  # the same run never alerts twice
        failures, _, _, state = m.evaluate_syncs({TEAM: sync('exit-code', AT(9, 0))}, state, AT(9, 5))
        self.assertEqual(len(failures), 1)  # a new failed run does
        _, recoveries, _, state = m.evaluate_syncs({TEAM: sync('success', AT(10, 0))}, state, AT(10, 5))
        self.assertEqual(recoveries, [TEAM])
        self.assertIsNone(state[TEAM]['alerted_run'])

    def test_a_sync_that_did_not_run_today_is_flagged_after_eight_once_a_day(self):
        yesterday = {TEAM: sync('success', AT(6, 35) - 86400)}
        self.assertIsNone(m.evaluate_syncs(yesterday, {}, AT(7, 55))[2])  # still within the morning window
        _, _, stale, state = m.evaluate_syncs(yesterday, {}, AT(8, 0))
        self.assertEqual(stale['exited_at'], AT(6, 35) - 86400)
        self.assertIsNone(m.evaluate_syncs(yesterday, state, AT(9, 0))[2])  # once a day
        self.assertIsNone(m.evaluate_syncs({TEAM: sync('success', AT(6, 35))}, {}, AT(9, 0))[2])
        self.assertIsNone(m.evaluate_syncs({TEAM: sync('success', None)}, {}, AT(9, 0))[2])  # just installed
        # A run that failed this morning is the failure alert's business, not a second stale card.
        _, _, stale, _ = m.evaluate_syncs({TEAM: sync('exit-code', AT(6, 35))}, {}, AT(9, 0))
        self.assertIsNone(stale)

    def test_a_never_run_weekly_recheck_is_quiet(self):
        failures, recoveries, stale, _ = m.evaluate_syncs(
            {'aios-cloud-video-team-recheck': sync('success', None)}, {}, AT(9, 0))
        self.assertEqual((failures, recoveries, stale), ([], [], None))

    def test_sync_status_reads_unix_timestamps_and_skips_missing_units(self):
        shown = Mock(stdout='LoadState=loaded\nResult=exit-code\nExecMainStatus=1\nExecMainExitTimestamp=@1793427300\n')
        with patch.object(m.subprocess, 'run', return_value=shown):
            self.assertEqual(m.sync_status(TEAM), {'result': 'exit-code', 'status': '1', 'exited_at': 1793427300})
        with patch.object(m.subprocess, 'run', return_value=Mock(stdout='LoadState=not-found\n')):
            self.assertIsNone(m.sync_status(TEAM))
        with patch.object(m.subprocess, 'run', return_value=Mock(stdout='LoadState=loaded\nResult=success\nExecMainExitTimestamp=\n')):
            self.assertIsNone(m.sync_status(TEAM)['exited_at'])
        with patch.object(m.subprocess, 'run', side_effect=FileNotFoundError('systemctl')):
            self.assertIsNone(m.sync_status(TEAM))

    def test_main_sends_a_red_failure_card_and_a_yellow_stale_card(self):
        for scenario, status, color, text in (
                ('failed', sync('exit-code', AT(6, 35)), 'red', '团队产出同步'),
                ('stale', sync('success', AT(6, 35) - 86400), 'yellow', '8 点前团队产出还没有同步')):
            with self.subTest(scenario=scenario), tempfile.TemporaryDirectory() as directory:
                state = Path(directory) / 'state.json'
                with patch.object(m.sys, 'argv', ['health']), patch.object(m, 'STATE_PATH', state), \
                        patch.object(m, 'UNITS', []), patch.object(m, 'SYNC_UNITS', [TEAM]), \
                        patch.object(m, 'sync_status', return_value=status), \
                        patch.object(m, 'business_link', return_value={'database': True}), \
                        patch.object(m.time, 'time', return_value=AT(9, 0)), \
                        patch.object(m, 'last_error', return_value='Error: vendor 500'), patch.object(m, 'send') as send:
                    self.assertEqual(m.main(), 0)
                send.assert_called_once()
                card = send.call_args.args[0]
                self.assertEqual(card['header']['template'], color)
                self.assertIn(text, json.dumps(card, ensure_ascii=False))
                saved = json.loads(state.read_text())['syncs']
                if scenario == 'failed':
                    self.assertEqual(saved[TEAM]['alerted_run'], AT(6, 35))
                else:
                    self.assertEqual(saved['stale_alerted_day'], '2026-10-31')


if __name__ == '__main__':
    unittest.main()
