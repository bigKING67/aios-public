import { it } from 'vitest';
import { assertFreshRuntimeState } from './assert-fresh-state';

it('isolates globals, DOM, storage and modules from the other file', assertFreshRuntimeState);
