INSERT INTO sample_inventory.samples (
  sample_code,
  sample_name,
  on_hand_quantity,
  reserved_quantity,
  version,
  created_by,
  updated_by
)
VALUES
  ('APPROVAL-MIG-CURRENT', 'Current approved fixture', 10, 2, 1, 'fixture', 'fixture'),
  ('APPROVAL-MIG-LEGACY', 'Legacy approved fixture', 8, 1, 1, 'fixture', 'fixture'),
  ('APPROVAL-MIG-UNCHANGED', 'Unchanged status fixture', 20, 0, 1, 'fixture', 'fixture'),
  ('APPROVAL-MIG-SKIP', 'Already debited fixture', 6, 1, 7, 'fixture', 'fixture');

INSERT INTO sample_inventory.inventory_movements (
  sample_id,
  movement_type,
  on_hand_delta,
  reserved_delta,
  resulting_on_hand_quantity,
  resulting_reserved_quantity,
  source_type,
  source_id,
  actor_user_id
)
SELECT
  id,
  'legacy_cutover_opening',
  CASE sample_code WHEN 'APPROVAL-MIG-SKIP' THEN 8 ELSE on_hand_quantity END,
  0,
  CASE sample_code WHEN 'APPROVAL-MIG-SKIP' THEN 8 ELSE on_hand_quantity END,
  reserved_quantity,
  'migration-fixture',
  sample_code || '-opening',
  'fixture'
FROM sample_inventory.samples
WHERE sample_code LIKE 'APPROVAL-MIG-%';

INSERT INTO sample_inventory.outbound_requests (
  sample_id,
  quantity,
  applicant,
  department,
  purpose,
  status,
  requested_at,
  time_quality,
  source_kind,
  source_record_id,
  created_by,
  updated_by,
  archived_at,
  archived_by
)
SELECT
  sample.id,
  fixture.quantity,
  'fixture applicant',
  'fixture department',
  'fixture purpose',
  fixture.status,
  NOW(),
  fixture.time_quality,
  'migration-fixture',
  fixture.source_record_id,
  'fixture',
  'fixture',
  fixture.archived_at,
  CASE WHEN fixture.archived_at IS NULL THEN NULL ELSE 'fixture' END
FROM (
  VALUES
    ('APPROVAL-MIG-CURRENT', 3, 'approved', 'known', 'approval-current', NULL::TIMESTAMPTZ),
    ('APPROVAL-MIG-LEGACY', 2, 'approved', 'legacy_request_only', 'approval-legacy', NULL::TIMESTAMPTZ),
    ('APPROVAL-MIG-UNCHANGED', 5, 'sampled', 'known', 'approval-sampled', NULL::TIMESTAMPTZ),
    ('APPROVAL-MIG-UNCHANGED', 1, 'pending', 'known', 'approval-pending', NULL::TIMESTAMPTZ),
    ('APPROVAL-MIG-UNCHANGED', 2, 'rejected', 'known', 'approval-rejected', NULL::TIMESTAMPTZ),
    ('APPROVAL-MIG-UNCHANGED', 3, 'approved', 'known', 'approval-archived', NOW()),
    ('APPROVAL-MIG-SKIP', 2, 'approved', 'known', 'approval-already-debited', NULL::TIMESTAMPTZ)
) AS fixture(sample_code, quantity, status, time_quality, source_record_id, archived_at)
JOIN sample_inventory.samples AS sample USING (sample_code);

INSERT INTO sample_inventory.inventory_movements (
  sample_id,
  movement_type,
  on_hand_delta,
  reserved_delta,
  resulting_on_hand_quantity,
  resulting_reserved_quantity,
  source_type,
  source_id,
  actor_user_id,
  metadata
)
SELECT
  outbound.sample_id,
  'outbound_pending_to_approved',
  -outbound.quantity,
  0,
  sample.on_hand_quantity,
  sample.reserved_quantity,
  'outbound_request',
  outbound.id::TEXT,
  'fixture',
  jsonb_build_object('reason', 'already_debited_fixture')
FROM sample_inventory.outbound_requests AS outbound
JOIN sample_inventory.samples AS sample ON sample.id = outbound.sample_id
WHERE outbound.source_record_id = 'approval-already-debited';

INSERT INTO sample_inventory.business_events (
  aggregate_type,
  aggregate_id,
  event_type,
  payload,
  actor_user_id
)
SELECT
  'sample',
  movement.sample_id::TEXT,
  'inventory.movement.recorded',
  jsonb_build_object(
    'movementId', movement.id,
    'sampleId', movement.sample_id,
    'sampleCode', sample.sample_code,
    'movementType', movement.movement_type,
    'onHandDelta', movement.on_hand_delta,
    'reservedDelta', movement.reserved_delta,
    'resultingOnHandQuantity', movement.resulting_on_hand_quantity,
    'resultingReservedQuantity', movement.resulting_reserved_quantity,
    'resultingAvailableQuantity', movement.resulting_available_quantity,
    'sourceType', movement.source_type,
    'sourceId', movement.source_id
  ),
  'fixture'
FROM sample_inventory.inventory_movements AS movement
JOIN sample_inventory.samples AS sample ON sample.id = movement.sample_id
JOIN sample_inventory.outbound_requests AS outbound
  ON movement.source_type = 'outbound_request'
  AND movement.source_id = outbound.id::TEXT
WHERE outbound.source_record_id = 'approval-already-debited';
