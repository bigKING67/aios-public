import { expectTypeOf, it } from 'vitest';

import type { components, operations } from '@/generated/api/aios-v2';

type PermissionResponse = operations['permissions_get_permissions']['responses'][200]['content']['application/json'];
type PermissionItem = components['schemas']['PermissionItem'];

it('accepts both permission response shapes emitted by the backend', () => {
  // OpenAPI 6's XOR helper incorrectly constrained this union's index signature.
  expectTypeOf<{ items: PermissionItem[]; total: number }>().toExtend<PermissionResponse>();
  expectTypeOf<Record<string, PermissionItem[]>>().toExtend<PermissionResponse>();
  expectTypeOf<{ total: string }>().not.toExtend<PermissionResponse>();
  expectTypeOf<{ admin: number[] }>().not.toExtend<PermissionResponse>();
});
