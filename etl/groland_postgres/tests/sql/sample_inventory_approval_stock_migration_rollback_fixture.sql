INSERT INTO sample_inventory.samples (
  sample_code,
  sample_name,
  on_hand_quantity,
  reserved_quantity,
  created_by,
  updated_by
)
VALUES
  ('APPROVAL-MIG-ROLLBACK-SAFE', 'Safe rollback fixture', 10, 0, 'fixture', 'fixture'),
  ('APPROVAL-MIG-ROLLBACK-BLOCKED', 'Blocked rollback fixture', 5, 4, 'fixture', 'fixture');

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
  updated_by
)
SELECT
  sample.id,
  fixture.quantity,
  'fixture applicant',
  'fixture department',
  'fixture purpose',
  'approved',
  NOW(),
  'known',
  'migration-fixture',
  fixture.source_record_id,
  'fixture',
  'fixture'
FROM (
  VALUES
    ('APPROVAL-MIG-ROLLBACK-SAFE', 2, 'approval-rollback-safe'),
    ('APPROVAL-MIG-ROLLBACK-BLOCKED', 2, 'approval-rollback-blocked')
) AS fixture(sample_code, quantity, source_record_id)
JOIN sample_inventory.samples AS sample USING (sample_code);
