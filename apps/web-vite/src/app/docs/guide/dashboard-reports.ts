import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import type { DocsPageModel } from '../docs-workspace-contracts';

export const GUIDE_DASHBOARD_REPORTS_PATH = `${ROUTE_PATHS.docsGuide}/dashboard-reports`;

export const GUIDE_DASHBOARD_REPORTS_PAGE: DocsPageModel = {
  key: 'guide',
  path: GUIDE_DASHBOARD_REPORTS_PATH,
  eyebrow: '使用指南',
  title: '看板与报告',
  subtitle: '从看板发现问题，到周报归因、月报复盘和 AI 总结。',
  primaryAction: {
    href: ROUTE_PATHS.dashboard,
    label: '打开看板',
  },
  sections: [
    {
      id: 'guide-dashboard',
      title: '看板怎么读',
      paragraphs: [
        '看板用于实时浏览核心经营指标，适合“先看全局、再下钻”的日常管理动作。',
        '建议先看 GMV、退款、访客、转化等主指标，再进入商品、平台或达人等专项页面确认异常来自哪里。',
      ],
    },
    {
      id: 'guide-weekly',
      title: '周报阅读顺序',
      lead: '周报适合复盘一周内的经营变化，阅读顺序应从结论进入证据，而不是先翻表格。',
      steps: [
        { title: '先看 GMV 波动归因', desc: '确认本周涨跌来自哪个平台、商品或主要经营变量。' },
        { title: '再看商品与渠道定位', desc: '锁定贡献或拖累最大的商品，再看该商品在哪些渠道发生变化。' },
        { title: '最后看漏斗和量化归因', desc: '用流量、转化、客单、费用和 ROI 等因子解释渠道变化。' },
      ],
    },
    {
      id: 'guide-monthly',
      title: '月报使用建议',
      paragraphs: [
        '月报用于月度复盘与策略回顾，重点关注趋势稳定性、平台结构变化和策略延续性。',
        '不要把月报当成周报的放大版；月报应更关注结构性变化和下月动作优先级。',
      ],
    },
    {
      id: 'guide-ai-summary',
      title: 'AI 总结使用建议',
      paragraphs: [
        'AI 总结用于提炼结论，不替代指标核对。建议先完成业务口径确认再触发 AI 生成。',
        '出现异常结论时，回到看板、漏斗与量化归因复核，不直接把 AI 输出写成最终判断。',
      ],
    },
  ],
};
