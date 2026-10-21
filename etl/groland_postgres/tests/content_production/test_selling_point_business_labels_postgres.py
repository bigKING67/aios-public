"""Business-label metadata migration against the disposable studio database."""
import json
import os
from pathlib import Path
import unittest
import uuid

import psycopg2

DB = os.getenv('CONTENT_PRODUCTION_TEST_DATABASE_URL')
MIGRATION = Path(__file__).resolve().parents[4] / 'sql/migrations/043_content_ai_studio_makeup_effect_label.sql'


@unittest.skipUnless(DB, 'disposable database required')
class SellingPointBusinessLabelTests(unittest.TestCase):
    def test_makeup_effect_migration_preserves_keys_order_and_historical_evidence(self):
        with psycopg2.connect(DB) as conn:
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT labels FROM ads.content_segment_presets WHERE preset_key='selling_point' AND version=1")
                    active = cur.fetchone()[0]
                    original_keys = [label['key'] for label in active]
                    old = [dict(label) for label in active]
                    for label in old:
                        if label['key'] == 'no_caking':
                            label.update(name='不卡粉', definition='旧定义', custom_note='preserved')
                    cur.execute("UPDATE ads.content_segment_presets SET labels=%s::JSONB WHERE preset_key='selling_point' AND version=1",
                                (json.dumps(old),))
                    asset = str(uuid.uuid4())
                    cur.execute("INSERT INTO ads.marketing_content_assets (asset_id,title) VALUES (%s,'label migration fixture')", (asset,))
                    for index, label in enumerate(('no_caking', 'natural_look')):
                        cur.execute("""INSERT INTO ads.content_segments
                            (segment_id,owner_user_id,asset_id,source_content_hash,start_ms,end_ms,
                             preset_key,preset_version,label_key,origin,status,evidence,continues_previous)
                            VALUES (%s,'label-fixture',%s,%s,%s,%s,'selling_point',1,%s,'human','suggested',%s::JSONB,%s)""",
                            (str(uuid.uuid4()), asset, 'a' * 64, index * 1000, (index + 1) * 1000, label,
                             json.dumps({'quote': '历史证据', 'promptVersion': 'selling-point-v4'}), bool(index)))
                    snapshot = "SELECT TO_JSONB(s) FROM ads.content_segments s WHERE asset_id=%s ORDER BY start_ms"
                    cur.execute(snapshot, (asset,))
                    before = cur.fetchall()
                    cur.execute(MIGRATION.read_text())
                    cur.execute("SELECT labels FROM ads.content_segment_presets WHERE preset_key='selling_point' AND version=1")
                    updated = cur.fetchone()[0]
                    self.assertEqual([label['key'] for label in updated], original_keys)
                    effect = next(label for label in updated if label['key'] == 'no_caking')
                    self.assertEqual((effect['name'], effect['custom_note']), ('妆效', 'preserved'))
                    self.assertIn('自然、清透、不假白、无粉感、扒脸', effect['definition'])
                    self.assertEqual([label for label in old if label['key'] != 'no_caking'],
                                     [label for label in updated if label['key'] != 'no_caking'])
                    cur.execute(snapshot, (asset,))
                    self.assertEqual(cur.fetchall(), before)
                    cur.execute(MIGRATION.read_text())
                    cur.execute("SELECT labels FROM ads.content_segment_presets WHERE preset_key='selling_point' AND version=1")
                    self.assertEqual(cur.fetchone()[0], updated)
            finally:
                conn.rollback()

    def test_endorsement_migration_preserves_legacy_rows_and_is_idempotent(self):
        migration = MIGRATION.with_name('045_content_ai_studio_endorsement_categories.sql')
        with psycopg2.connect(DB) as conn:
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT labels FROM ads.content_segment_presets WHERE preset_key='selling_point' AND version=1")
                    old = [label for label in cur.fetchone()[0] if label['key'] not in ('star_endorsement', 'kol_endorsement', 'expert_endorsement')]
                    old.append({'key': 'celebrity_endorsement', 'name': '明星背书', 'definition': '旧范围含明星、达人、专家'})
                    cur.execute("UPDATE ads.content_segment_presets SET labels=%s::JSONB WHERE preset_key='selling_point' AND version=1", (json.dumps(old),))
                    asset = str(uuid.uuid4())
                    cur.execute("INSERT INTO ads.marketing_content_assets (asset_id,title) VALUES (%s,'endorsement migration fixture')", (asset,))
                    cur.execute("INSERT INTO ads.content_segments (segment_id,owner_user_id,asset_id,source_content_hash,start_ms,end_ms,preset_key,preset_version,label_key,origin,status,evidence) VALUES (%s,'fixture',%s,%s,0,1000,'selling_point',1,'celebrity_endorsement','human','suggested',%s::JSONB)", (str(uuid.uuid4()), asset, 'a'*64, json.dumps({'quote': '旧背书不可自动推断类别'})))
                    snapshot = "SELECT TO_JSONB(s) FROM ads.content_segments s WHERE asset_id=%s"
                    cur.execute(snapshot, (asset,))
                    before = cur.fetchall()
                    cur.execute(migration.read_text())
                    cur.execute(snapshot, (asset,))
                    self.assertEqual(cur.fetchall(), before)
                    cur.execute("SELECT labels FROM ads.content_segment_presets WHERE preset_key='selling_point' AND version=1")
                    updated = cur.fetchone()[0]
                    self.assertEqual([x['key'] for x in updated], ['moisturizing', 'skincare', 'no_caking', 'long_wear', 'star_endorsement', 'kol_endorsement', 'expert_endorsement'])
                    cur.execute(migration.read_text())
                    cur.execute("SELECT labels FROM ads.content_segment_presets WHERE preset_key='selling_point' AND version=1")
                    self.assertEqual(cur.fetchone()[0], updated)
            finally:
                conn.rollback()
