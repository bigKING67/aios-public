import { DESIGN_BEHAVIOR_EXPECTED_GATES } from '../design/design-behavior-gates.mjs';
import {
  makeGateFinder,
} from './verify-ci-run-gate-utils.mjs';

const DESIGN_NON_BEHAVIOR_GATES = Object.freeze([
  {
    name: 'verify:design:raw-colors',
    label: '[verify:ci] design raw color audit',
  },
  {
    name: 'verify:design:typography',
    label: '[verify:ci] typography token audit',
  },
  {
    name: 'verify:design:tailwind',
    label: '[verify:ci] tailwind token aliases',
  },
  {
    name: 'verify:design:tailwind-non-color-aliases',
    label: '[verify:ci] tailwind non-color token aliases',
  },
  {
    name: 'verify:design:tailwind-utilities',
    label: '[verify:ci] tailwind utility colors',
  },
  {
    name: 'verify:design:legacy-colors',
    label: '[verify:ci] legacy status color token consumption',
  },
  {
    name: 'verify:design:docs',
    label: '[verify:ci] design docs drift',
  },
  {
    name: 'verify:design:token-generator',
    label: '[verify:ci] design token generator boundary',
  },
  {
    name: 'verify:design:antd-table-selectors',
    label: '[verify:ci] AntD table deep selector audit',
  },
  {
    name: 'verify:design:antd-theme-token-sync',
    label: '[verify:ci] AntD theme token sync',
  },
  {
    name: 'verify:design:echarts-theme-token-sync',
    label: '[verify:ci] ECharts theme token sync',
  },
  {
    name: 'verify:design:echarts-css-token-sync',
    label: '[verify:ci] ECharts CSS token sync',
  },
  {
    name: 'verify:design:token-values-sync',
    label: '[verify:ci] design token value helper sync',
  },
  {
    name: 'verify:design:mirror',
    label: '[verify:ci] design token mirror sync',
  },
  {
    name: 'verify:design:tokens',
    label: '[verify:ci] design token sync',
  },
]);

const designGate = makeGateFinder(DESIGN_NON_BEHAVIOR_GATES, 'DESIGN_NON_BEHAVIOR_GATES');
const designBehaviorGate = makeGateFinder(
  DESIGN_BEHAVIOR_EXPECTED_GATES,
  'DESIGN_BEHAVIOR_EXPECTED_GATES',
);

export const DESIGN_FOUNDATION_RUN_GATES = Object.freeze([
  designGate('verify:design:raw-colors'),
  designBehaviorGate('verify:design:raw-colors-behavior'),
  designBehaviorGate('verify:design:raw-color-source-allowlist-behavior'),
  designGate('verify:design:typography'),
  designBehaviorGate('verify:design:tailwind-behavior'),
  designGate('verify:design:tailwind'),
  designBehaviorGate('verify:design:tailwind-non-color-aliases-behavior'),
  designGate('verify:design:tailwind-non-color-aliases'),
  designBehaviorGate('verify:design:tailwind-utilities-behavior'),
  designGate('verify:design:tailwind-utilities'),
  designGate('verify:design:legacy-colors'),
  designBehaviorGate('verify:design:docs-behavior'),
  designGate('verify:design:docs'),
  designBehaviorGate('verify:design:token-generator-behavior'),
  designGate('verify:design:token-generator'),
  designBehaviorGate('verify:design:behavior-gate-registry-behavior'),
]);

export const DESIGN_TOKEN_HELPER_RUN_GATES = Object.freeze([
  designGate('verify:design:token-values-sync'),
  designBehaviorGate('verify:design:token-values-sync-behavior'),
]);

export const DESIGN_ADAPTER_RUN_GATES = Object.freeze([
  designGate('verify:design:antd-table-selectors'),
  designBehaviorGate('verify:design:antd-table-selectors-behavior'),
  designGate('verify:design:antd-theme-token-sync'),
  designBehaviorGate('verify:design:antd-theme-token-sync-behavior'),
  designGate('verify:design:echarts-theme-token-sync'),
  designBehaviorGate('verify:design:echarts-theme-token-sync-behavior'),
  designGate('verify:design:echarts-css-token-sync'),
  designBehaviorGate('verify:design:echarts-css-token-sync-behavior'),
]);

export const DESIGN_REGISTRY_RUN_GATES = Object.freeze([
  designBehaviorGate('verify:design:behavior-guard-quality-behavior'),
  designBehaviorGate('verify:design:behavior-guard-quality'),
  designBehaviorGate('verify:design:behavior-gate-registry'),
]);
