import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import type { DocsPageModel } from '../docs-workspace-contracts';

export const GUIDE_DATAOPS_PATH = `${ROUTE_PATHS.docsGuide}/dataops`;

export const GUIDE_DATAOPS_PAGE: DocsPageModel = {
  key: 'guide',
  path: GUIDE_DATAOPS_PATH,
  eyebrow: '使用指南 · 管理员',
  title: '运维排障',
  subtitle: '数据没有按时更新时，管理员按 ADS → DWD / ODS → 失败节点的顺序排查。',
  primaryAction: {
    href: ROUTE_PATHS.opsDataops,
    label: '进入运维',
  },
  sections: [
    {
      id: 'guide-dataops',
      title: 'DataOps 排障顺序',
      steps: [
        { title: '先看 ADS 目标表', desc: '确认报告或看板读取的目标表是否已经刷新。' },
        { title: '再看 DWD / ODS 水位', desc: '如果 ADS 未更新，继续检查上游源表时间戳和行数。' },
        { title: '最后看失败节点', desc: '按 DataOps 面板里的失败节点、运行 ID 和通知链路逐层回溯。' },
      ],
    },
  ],
};
