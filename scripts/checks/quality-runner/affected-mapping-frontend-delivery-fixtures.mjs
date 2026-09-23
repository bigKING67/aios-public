import {
  selectAffectedGates,
} from '../../lib/quality/quality-affected.mjs';
import {
  assertFrontendBuildAffectedMapping,
} from './affected-mapping-frontend-build-fixtures.mjs';
import {
  assertFrontendSmokeAffectedMapping,
} from './affected-mapping-frontend-smoke-fixtures.mjs';

export function assertFrontendDeliveryAffectedMapping({
  assertFalse,
  assertTrue,
  registry,
}) {
  const frontendGateRegistryAuditHelper = selectAffectedGates(registry, ['scripts/lib/frontend/frontend-gate-registry-audit.mjs']);
  assertTrue(frontendGateRegistryAuditHelper.names.includes('verify:frontend:structure-gate-registry'), 'frontend registry audit helper source should select structure registry gate');
  assertTrue(frontendGateRegistryAuditHelper.names.includes('verify:frontend:structure-gate-registry-behavior'), 'frontend registry audit helper source should select structure registry behavior gate');
  assertTrue(frontendGateRegistryAuditHelper.names.includes('verify:frontend:delivery-gate-registry'), 'frontend registry audit helper source should select delivery registry gate');
  assertTrue(frontendGateRegistryAuditHelper.names.includes('verify:frontend:delivery-gate-registry-behavior'), 'frontend registry audit helper source should select delivery registry behavior gate');

  const deliveryRegistryBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/frontend/frontend-delivery-registry-behavior-fixtures.mjs']);
  assertTrue(deliveryRegistryBehaviorFixture.names.includes('lint:scripts'), 'frontend delivery registry behavior fixture should keep script lint coverage');
  assertTrue(deliveryRegistryBehaviorFixture.names.includes('verify:frontend:delivery-gate-registry'), 'frontend delivery registry behavior fixture should keep production registry coverage');
  assertTrue(deliveryRegistryBehaviorFixture.names.includes('verify:frontend:delivery-gate-registry-behavior'), 'frontend delivery registry behavior fixture should select behavior registry gate');
  assertFalse(deliveryRegistryBehaviorFixture.names.includes('verify:backend:size'), 'frontend delivery registry behavior fixture should not fall back to backend size gate');

  assertFrontendBuildAffectedMapping({
    assertFalse,
    assertTrue,
    registry,
  });
  assertFrontendSmokeAffectedMapping({
    assertFalse,
    assertTrue,
    registry,
  });
}
