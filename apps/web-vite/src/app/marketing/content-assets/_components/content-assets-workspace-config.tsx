import {
  BarChartOutlined,
  LinkOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  SettingOutlined,
  TeamOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { formatBytes, formatCompactNumber } from '../_lib/content-assets-formatters';
import type {
  ContentAssetCoverageSummary,
  ContentAssetSummary,
} from '../_lib/content-assets-types';
import type { ContentAssetsModuleKey } from './content-assets-module-nav-config';
import type { AssetListPreset, ModuleMetric, ModulePanelConfig } from './content-assets-workspace-types';

export function createHomeMetrics(summary: ContentAssetSummary | ContentAssetCoverageSummary): ModuleMetric[] {
  return [
    { label: '总素材', value: formatCompactNumber(summary.totalAssets), helper: '内部 asset_id 数量' },
    { label: '已就绪', value: formatCompactNumber(summary.readyAssets), helper: '预览 / 封面已生成' },
    { label: '待生成', value: formatCompactNumber(summary.pendingAssets), helper: '等待预览 / 封面' },
    { label: '原片体积', value: formatBytes(summary.totalRawSizeBytes), helper: 'TOS 原片合计' },
  ];
}

export function createCoverageTodos(coverage: ContentAssetCoverageSummary) {
  return [
    {
      label: '待补源',
      value: coverage.externalOnlyAssets,
      helper: '仍是外链/历史记录，未入 TOS',
      preset: { externalOnly: 'true' },
    },
    {
      label: '待生成预览',
      value: Math.max(coverage.rawReadyAssets - coverage.previewReadyAssets, 0),
      helper: '原片已入桶但缺 preview',
      preset: { assetStatus: 'pending_processing', externalOnly: 'false' },
    },
    {
      label: '待生成脚本',
      value: Math.max(coverage.rawReadyAssets - coverage.transcriptReadyAssets, 0),
      helper: '脚本/SRT 是独立链路',
      preset: { todo: 'missing_transcript' },
    },
    {
      label: '待绑定视频ID',
      value: Math.max(coverage.totalAssets - coverage.platformBoundAssets, 0),
      helper: '用于平台视频日报回流',
      preset: { todo: 'missing_platform_video' },
    },
    {
      label: '待绑定素材ID',
      value: Math.max(coverage.totalAssets - coverage.adMaterialBoundAssets, 0),
      helper: '用于千川等广告日报回流',
      preset: { todo: 'missing_ad_material' },
    },
    {
      label: '授权待确认',
      value: Math.max(coverage.totalAssets - coverage.authorizationKnownAssets, 0),
      helper: '商用/复剪风险需要补齐',
      preset: { todo: 'authorization_unknown' },
    },
    {
      label: 'AI失败任务',
      value: coverage.analysisFailedJobs,
      helper: '需要重试或检查额度',
      preset: { todo: 'missing_ai' },
    },
    {
      label: '脚本失败任务',
      value: coverage.transcriptFailedJobs,
      helper: '需要重试或检查转写服务',
      preset: { todo: 'missing_transcript' },
    },
  ].map((todo) => ({ ...todo, value: String(todo.value), preset: todo.preset as AssetListPreset }));
}

export function createModuleConfig(
  module: ContentAssetsModuleKey,
  summary: ContentAssetSummary | ContentAssetCoverageSummary
): ModulePanelConfig {
  const commonMetrics = createHomeMetrics(summary).slice(0, 3);
  const configs: Record<Exclude<ContentAssetsModuleKey, 'home' | 'assets' | 'production'>, ModulePanelConfig> = {
    ai: {
      title: 'AI分析中心',
      eyebrow: '智能分析',
      description: '集中查看转写、前三秒钩子、卖点、风险词、平台适配和复剪建议。',
      icon: <RobotOutlined />,
      metrics: [
        { label: '待分析', value: formatCompactNumber(summary.pendingAssets), helper: '等待分析任务消费' },
        { label: '已就绪', value: formatCompactNumber(summary.readyAssets), helper: '可进入 AI 分析' },
        { label: '素材总量', value: formatCompactNumber(summary.totalAssets), helper: '分析候选池' },
      ],
      actions: [
        { label: '查看待生成素材', helper: '筛选 pending_processing / processing' },
        { label: '查看 AI 摘要', helper: '沉淀素材卖点和钩子类型' },
        { label: '生成复剪建议', helper: '把高潜素材转成复剪任务' },
      ],
    },
    video: {
      title: '视频处理',
      eyebrow: '视频处理链路',
      description: '管理原片、预览视频、封面、抽帧等派生资产处理队列。',
      icon: <VideoCameraOutlined />,
      metrics: [
        { label: '待生成', value: formatCompactNumber(summary.pendingAssets), helper: '预览 / 封面队列' },
        { label: '已就绪', value: formatCompactNumber(summary.readyAssets), helper: '预览已生成' },
        { label: '原片体积', value: formatBytes(summary.totalRawSizeBytes), helper: '原片存储占用' },
      ],
      actions: [
        { label: '检查转码队列', helper: '定位预览生成失败素材' },
        { label: '检查封面队列', helper: '补齐卡片和详情页视觉预览' },
        { label: '查看原片对象', helper: '核对存储桶 / 对象路径' },
      ],
    },
    review: {
      title: '内容审核',
      eyebrow: '风险审核',
      description: '规划中：集中处理风险词、授权状态、商用可用性和平台合规检查。',
      icon: <SafetyCertificateOutlined />,
      metrics: commonMetrics,
      actions: [
        { label: '授权待确认', helper: '检查授权状态和到期时间' },
        { label: '风险词复核', helper: '结合转写文本和 AI 识别结果' },
        { label: '可商用确认', helper: '为投放和复剪提供准入依据' },
      ],
    },
    publish: {
      title: '发布管理',
      eyebrow: '发布管理',
      description: '维护抖音、小红书、视频号等平台发布身份和素材投放前状态。',
      icon: <SendOutlined />,
      metrics: commonMetrics,
      actions: [
        { label: '补平台视频 ID', helper: '一条内部视频可关联多个平台视频身份' },
        { label: '补发布标题', helper: '沉淀平台侧标题和发布状态' },
        { label: '检查可投放素材', helper: '按生命周期阶段进入测试' },
      ],
    },
    matching: {
      title: '回流匹配',
      eyebrow: '表现数据回流',
      description: '处理平台日报中尚未匹配到 asset_id 的素材 ID、视频 ID 和笔记 ID。',
      icon: <LinkOutlined />,
      metrics: commonMetrics,
      actions: [
        { label: '查看未匹配日报', helper: '按 material_id / video_id 聚合处理' },
        { label: '选择目标素材', helper: '确认外部 ID 属于哪个内部 asset_id' },
        { label: '写入身份映射', helper: '后续 DWD / DWS 自动承接表现数据' },
      ],
    },
    tasks: {
      title: '协作任务',
      eyebrow: '团队协作',
      description: '规划中：承接复剪、补授权、补 ID、重跑处理和投放复盘任务。',
      icon: <TeamOutlined />,
      metrics: [
        { label: '任务池', value: '--', helper: '待接入任务数据' },
        { label: '待生成素材', value: formatCompactNumber(summary.pendingAssets), helper: '可生成处理任务' },
        { label: '待补源', value: formatCompactNumber(summary.externalOnlyAssets), helper: '历史外链素材' },
      ],
      actions: [
        { label: '创建复剪任务', helper: '从高 ROI / 高 CTR 素材派生' },
        { label: '补充素材档案', helper: '分配负责人维护产品、达人、标签' },
        { label: '处理失败重试', helper: '将失败处理任务重新排队' },
      ],
    },
    stats: {
      title: '数据统计',
      eyebrow: '资产统计',
      description: '查看素材数量、入库趋势、处理状态、平台覆盖和投放表现回流。',
      icon: <BarChartOutlined />,
      metrics: [
        { label: '素材总数', value: formatCompactNumber(summary.totalAssets), helper: '当前资产池' },
        { label: '就绪率', value: ratioText(summary.readyAssets, summary.totalAssets), helper: 'ready / total' },
        { label: '原片体积', value: formatBytes(summary.totalRawSizeBytes), helper: '公网下载需控制' },
      ],
      actions: [
        { label: '查看资产概览', helper: '按状态、平台、产品拆解' },
        { label: '查看表现回流', helper: '待接入 dws / ads 快照' },
        { label: '查看未匹配队列', helper: '处理平台 video_id / material_id 匹配' },
      ],
    },
    settings: {
      title: '系统设置',
      eyebrow: '系统配置',
      description: '维护存储桶、短时签名链接、未来 CDN、处理队列和权限策略。',
      icon: <SettingOutlined />,
      metrics: [
        { label: '分发方式', value: '短时签名', helper: '未备案阶段' },
        { label: '目标域名', value: 'video', helper: 'video.groland-inc.com' },
        { label: '存储桶', value: 'TOS', helper: 'aios-content-assets' },
      ],
      actions: [
        { label: '检查 TOS 配置', helper: 'AK/SK 仅在后端环境变量' },
        { label: '配置 Bucket CORS', helper: '允许浏览器直传签名链接' },
        { label: '切换 CDN 模式', helper: '备案后启用 video.groland-inc.com' },
      ],
    },
  };
  return configs[module as Exclude<ContentAssetsModuleKey, 'home' | 'assets' | 'production'>];
}

function ratioText(value: number, total: number): string {
  if (total <= 0) return '--';
  return `${((value / total) * 100).toFixed(1)}%`;
}
