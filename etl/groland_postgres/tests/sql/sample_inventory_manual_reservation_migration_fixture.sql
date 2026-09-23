INSERT INTO sample_inventory.samples (
  sample_code,
  sample_name,
  on_hand_quantity,
  reserved_quantity,
  created_by,
  updated_by
)
VALUES
  ('MANUAL-RESERVATION-MIGRATION', 'Legacy reserved fixture', 10, 3, 'fixture', 'fixture'),
  ('MANUAL-RESERVATION-ZERO', 'Zero reserved fixture', 8, 0, 'fixture', 'fixture');

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
  on_hand_quantity,
  0,
  on_hand_quantity,
  0,
  'migration-fixture',
  sample_code || '-opening',
  'fixture'
FROM sample_inventory.samples
WHERE sample_code IN ('MANUAL-RESERVATION-MIGRATION', 'MANUAL-RESERVATION-ZERO');

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
  'outbound_pending_to_approved',
  0,
  reserved_quantity,
  on_hand_quantity,
  reserved_quantity,
  'migration-fixture',
  sample_code || '-legacy-reservation',
  'fixture'
FROM sample_inventory.samples
WHERE sample_code = 'MANUAL-RESERVATION-MIGRATION';
