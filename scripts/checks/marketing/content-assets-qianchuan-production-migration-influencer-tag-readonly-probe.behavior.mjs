#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  formatQianchuanInfluencerTagReadonlyProbe,
  parseQianchuanInfluencerTagReadonlyProbeArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-influencer-tag-readonly-probe-cli.mjs';
import {
  runQianchuanInfluencerTagReadonlyProbe,
  validateQianchuanInfluencerTagPostrepairReadonlyProbe,
  validateQianchuanInfluencerTagReadonlyProbe,
} from '../../lib/migrations/aios-qianchuan-production-migration-influencer-tag-readonly-probe.mjs';

const TARGET_IDENTITY = 'warehouse/20260510_1800';
const TARGET_CHECKSUM = '8d94ae900ab7ece5f389cd93f1a7510597556b7022f9cddbe32884af82430a6a';
const TARGET_SOURCE = 'etl/groland_postgres/sql/migrations/20260510_1800__normalize_influencer_library_anchor_tags.sql';

const p1Artifact = {
  path: '/tmp/reviewed-p1.json',
  bytes: 100,
  sha256: 'a'.repeat(64),
};
const p1dProbeArtifact = {
  path: '/tmp/p1d-probe.json',
  bytes: 100,
  sha256: 'b'.repeat(64),
};
const p1Packet = {
  mode: 'offline_readonly_reviewed_p1_overlay',
  policy: {
    productionWritesAuthorized: false,
    ledgerWritesAuthorized: false,
  },
  summary: { byWave: { P1D: 5 } },
  entries: [{
    namespace: 'warehouse',
    version: '20260510_1800',
    relativePath: TARGET_SOURCE,
    checksum: TARGET_CHECKSUM,
    source: { bytes: 2371, path: TARGET_SOURCE, sha256: TARGET_CHECKSUM },
    authoritativeClassification: 'unknown',
    reviewWaveLabel: 'P1D',
    review: { decision: null, reviewer: null },
    effects: {
      satisfied: 0,
      unsatisfied: 1,
      unsatisfiedCurrentEffects: [{
        expectedPresent: true,
        key: 'routine:function:ads.fn_influencer_library_normalize_anchor_tag(text)',
        present: false,
      }],
    },
    unsupportedSignals: ['dml_or_backfill', 'procedural_body'],
  }],
};
const entryEvidence = [
  {
    family: 'influencer_tag_normalization',
    entries: [TARGET_IDENTITY],
    evidenceState: 'missing_runtime_contract_with_data_drift',
    decision: null,
    reviewer: null,
  },
  ...Array.from({ length: 7 }, (_value, index) => ({
    family: `fixture_${index}`,
    entries: [`warehouse/fixture_${index}`],
    evidenceState: 'fixture',
    decision: null,
    reviewer: null,
  })),
];
const p1dProbe = {
  schemaVersion: 1,
  mode: 'live_readonly_p1d_catalog_data_shape_probe',
  policy: {
    transaction: 'BEGIN READ ONLY / ROLLBACK',
    productionWritesAuthorized: false,
    ledgerWritesAuthorized: false,
    deployAuthorized: false,
    ownerDecisionRecorded: false,
    arkInvoked: false,
  },
  summary: {
    entries: 8,
    families: 8,
    ownerDecisionReady: false,
  },
  entryEvidence,
  dataShapes: {
    normalization: {
      activeRows: '285',
      rowsWithNormalizedTags: '96',
      mismatchRows: '3',
    },
  },
};

const columnContracts = new Map([
  ['id', ['bigint', true]],
  ['tags', ['text[]', true]],
  ['anchor_desc', ['text', false]],
  ['updated_at', ['timestamp without time zone', true]],
  ['is_deleted', ['boolean', true]],
]);

class FakeClient {
  constructor({ failOn = null, mismatchRows = 3, normalizePresent = false } = {}) {
    this.failOn = failOn;
    this.mismatchRows = mismatchRows;
    this.normalizePresent = normalizePresent;
    this.queries = [];
  }

  async query(sql, params = []) {
    this.queries.push({ sql, params });
    if (this.failOn && sql.includes(this.failOn)) throw new Error('fixture query failure');
    if (sql === 'BEGIN READ ONLY' || sql.startsWith('SET LOCAL') || sql === 'ROLLBACK') return { rows: [] };
    if (sql.includes('aios_qianchuan_influencer_tag:table_stats')) {
      return { rows: [{
        qualified_name: 'ads.influencer_library',
        oid: '100',
        relation_kind: 'r',
        heap_bytes: '65536',
        index_bytes: '32768',
        total_bytes: '98304',
        estimated_live_rows: '286',
        estimated_dead_rows: '1',
        granted_locks: '1',
        waiting_locks: '0',
      }] };
    }
    if (sql.includes('aios_qianchuan_influencer_tag:primary_key')) {
      return { rows: [{ constraint_name: 'influencer_library_pkey', definition: 'PRIMARY KEY (id)' }] };
    }
    if (sql.includes('aios_qianchuan_influencer_tag:columns')) {
      return { rows: params[1].map((columnName, index) => ({
        column_name: columnName,
        position: String(index + 1),
        data_type: columnContracts.get(columnName)[0],
        not_null: columnContracts.get(columnName)[1],
      })) };
    }
    if (sql.includes('aios_qianchuan_influencer_tag:routines')) {
      return { rows: params[0].map((signature) => {
        const isNormalize = signature.includes('normalize_anchor_tag');
        const present = !isNormalize || this.normalizePresent;
        return {
          signature,
          oid: present ? '200' : null,
          routine_kind: present
            ? (signature.includes('initialize_influencer_library') ? 'p' : 'f')
            : null,
          definition: present ? `fixture definition ${signature}` : null,
        };
      }) };
    }
    if (sql.includes('aios_qianchuan_influencer_tag:trigger')) {
      return { rows: [{
        oid: '300',
        trigger_name: 'trg_touch_influencer_library_updated_at',
        enabled: 'O',
        definition: 'CREATE TRIGGER fixture EXECUTE FUNCTION ads.fn_touch_influencer_library_updated_at()',
      }] };
    }
    if (sql.includes('aios_qianchuan_influencer_tag:impact_summary')) {
      return { rows: [{
        active_rows: '285',
        rows_with_normalized_tags: '96',
        mismatch_rows: String(this.mismatchRows),
        tags_only_mismatch_rows: this.mismatchRows === 3 ? '1' : String(this.mismatchRows),
        anchor_desc_only_mismatch_rows: this.mismatchRows === 3 ? '1' : '0',
        both_mismatch_rows: this.mismatchRows === 3 ? '1' : '0',
        estimated_backup_bytes: '768',
        max_updated_at: '2026-07-24 12:00:00',
      }] };
    }
    if (sql.includes('aios_qianchuan_influencer_tag:impact_rows')) {
      return { rows: [
        {
          id: '1', row_version: '10', updated_at: '2026-07-20 12:00:00',
          before_tags: ['服装'], before_anchor_desc: '服装',
          expected_tags: ['服饰主播'], expected_anchor_desc: '服饰主播',
        },
        {
          id: '2', row_version: '11', updated_at: '2026-07-21 12:00:00',
          before_tags: ['美妆'], before_anchor_desc: '美妆类主播',
          expected_tags: ['美妆主播'], expected_anchor_desc: '美妆主播',
        },
        {
          id: '3', row_version: '12', updated_at: '2026-07-22 12:00:00',
          before_tags: ['穿搭类主播'], before_anchor_desc: '穿搭',
          expected_tags: ['穿搭', '穿搭主播'], expected_anchor_desc: '穿搭、穿搭主播',
        },
      ] };
    }
    throw new Error(`Unexpected fixture SQL: ${sql.slice(0, 100)}`);
  }
}

function assertReadOnlyQueries(client) {
  const forbidden = /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|CALL|PERFORM|COMMIT|pg_advisory_lock|baseline|apply|Ark)\b/i;
  for (const { sql } of client.queries) {
    const allowed = sql === 'BEGIN READ ONLY'
      || sql === 'ROLLBACK'
      || /^SET LOCAL statement_timeout = '\d+ms'$/.test(sql)
      || /^\/\*[\s\S]*?\*\/\s*(?:SELECT|WITH)\b/i.test(sql);
    assert.equal(allowed, true, `unexpected SQL outside the read-only allowlist: ${sql}`);
    if (sql !== 'BEGIN READ ONLY' && sql !== 'ROLLBACK') {
      assert.equal(forbidden.test(sql), false, `write-like SQL token found: ${sql}`);
    }
  }
}

const client = new FakeClient();
const result = await runQianchuanInfluencerTagReadonlyProbe({
  client,
  p1Artifact,
  p1Packet,
  p1Sha256: p1Artifact.sha256,
  p1dProbe,
  p1dProbeArtifact,
  p1dProbeSha256: p1dProbeArtifact.sha256,
  now: () => new Date('2026-07-25T05:00:00.000Z'),
});
assert.equal(validateQianchuanInfluencerTagReadonlyProbe(result), result);
assert.equal(result.summary.mismatchRows, 3);
assert.equal(result.summary.impactRowsCaptured, 3);
assert.equal(result.summary.normalizeFunctionPresent, false);
assert.equal(result.summary.waitingLocks, 0);
assert.equal(result.impactRows[0].beforeSha256.length, 64);
assert.notEqual(result.impactRows[0].beforeSha256, result.impactRows[0].expectedSha256);
assert.equal(client.queries.at(-1).sql, 'ROLLBACK');
assertReadOnlyQueries(client);

const textOutput = formatQianchuanInfluencerTagReadonlyProbe(result, {
  path: '/tmp/influencer-tag.json', bytes: 1000, sha256: 'c'.repeat(64),
});
assert.match(textOutput, /mismatch_rows=3 captured=3/);
assert.doesNotMatch(textOutput, /服装|穿搭|beforeSha256/);

const postrepair = structuredClone(result);
postrepair.summary.normalizeFunctionPresent = true;
postrepair.summary.mismatchRows = 0;
postrepair.summary.tagsOnlyMismatchRows = 0;
postrepair.summary.anchorDescOnlyMismatchRows = 0;
postrepair.summary.bothMismatchRows = 0;
postrepair.summary.impactRowsCaptured = 0;
postrepair.summary.estimatedBackupBytes = 0;
postrepair.impactRows = [];
Object.assign(postrepair.catalog.routines[0], {
  present: true,
  routineKind: 'f',
  definitionBytes: 512,
  definitionSha256: 'd'.repeat(64),
});
assert.equal(validateQianchuanInfluencerTagPostrepairReadonlyProbe(postrepair), postrepair);
assert.throws(
  () => validateQianchuanInfluencerTagReadonlyProbe(postrepair),
  /repair readiness evidence is incomplete/,
);

await assert.rejects(
  runQianchuanInfluencerTagReadonlyProbe({
    client: new FakeClient(),
    p1Artifact,
    p1Packet,
    p1Sha256: '0'.repeat(64),
    p1dProbe,
    p1dProbeArtifact,
    p1dProbeSha256: p1dProbeArtifact.sha256,
  }),
  /Reviewed P1 overlay SHA-256 differs/,
);

const failingClient = new FakeClient({ failOn: 'impact_summary' });
await assert.rejects(
  runQianchuanInfluencerTagReadonlyProbe({
    client: failingClient,
    p1Artifact,
    p1Packet,
    p1Sha256: p1Artifact.sha256,
    p1dProbe,
    p1dProbeArtifact,
    p1dProbeSha256: p1dProbeArtifact.sha256,
  }),
  /fixture query failure/,
);
assert.equal(failingClient.queries.at(-1).sql, 'ROLLBACK');
assertReadOnlyQueries(failingClient);

const oversizedClient = new FakeClient({ mismatchRows: 1001 });
await assert.rejects(
  runQianchuanInfluencerTagReadonlyProbe({
    client: oversizedClient,
    p1Artifact,
    p1Packet,
    p1Sha256: p1Artifact.sha256,
    p1dProbe,
    p1dProbeArtifact,
    p1dProbeSha256: p1dProbeArtifact.sha256,
  }),
  /exact 1000-row bound/,
);
assert.equal(oversizedClient.queries.at(-1).sql, 'ROLLBACK');
assertReadOnlyQueries(oversizedClient);

const runtimePresentClient = new FakeClient({ normalizePresent: true });
const runtimePresent = await runQianchuanInfluencerTagReadonlyProbe({
  client: runtimePresentClient,
  p1Artifact,
  p1Packet,
  p1Sha256: p1Artifact.sha256,
  p1dProbe,
  p1dProbeArtifact,
  p1dProbeSha256: p1dProbeArtifact.sha256,
});
assert.throws(
  () => validateQianchuanInfluencerTagReadonlyProbe(runtimePresent),
  /evidence is incomplete/,
);

assert.deepEqual(
  parseQianchuanInfluencerTagReadonlyProbeArgs([
    '--p1', '/tmp/p1.json',
    `--p1-sha256=${'a'.repeat(64)}`,
    '--p1d-probe', '/tmp/p1d.json',
    `--p1d-probe-sha256=${'b'.repeat(64)}`,
    '--output', '/tmp/probe.json',
    '--postrepair',
    '--json',
  ]),
  {
    help: false,
    json: true,
    outputPath: '/tmp/probe.json',
    postrepair: true,
    p1Path: '/tmp/p1.json',
    p1Sha256: 'a'.repeat(64),
    p1dProbePath: '/tmp/p1d.json',
    p1dProbeSha256: 'b'.repeat(64),
  },
);
for (const option of ['--apply', '--baseline', '--deploy', '--write-ledger', '--record-decision']) {
  assert.throws(
    () => parseQianchuanInfluencerTagReadonlyProbeArgs([option]),
    /Unknown qianchuan influencer-tag read-only probe option/,
  );
}

console.log('[qianchuan-influencer-tag-readonly-probe-behavior] OK: pinned unresolved boundary, exact catalog/data impact, bounded row capture, rollback, redacted output, and write denial passed.');
