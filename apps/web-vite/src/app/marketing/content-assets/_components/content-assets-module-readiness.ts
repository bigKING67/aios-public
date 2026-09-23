import type { ContentAssetsModuleKey } from './content-assets-module-nav-config';

export function resolveModuleReadiness(module: ContentAssetsModuleKey): {
  stateLabel: string;
  currentEntry: string;
  pendingScope: string;
  items: Array<{ label: string; value: string; helper: string }>;
} {
  if (module === 'review') {
    return {
      stateLabel: '规划中',
      currentEntry: '授权、可复剪和风险备注目前在素材详情的业务档案中维护。',
      pendingScope: '内容审核还没有独立审核流、风险词队列或授权到期提醒，不展示虚构待办数。',
      items: [
        { label: '已接入', value: '业务档案', helper: '授权状态、可商用、可复剪字段' },
        { label: '人工动作', value: '详情编辑', helper: '逐条补充审核说明和授权备注' },
        { label: '待接入', value: '审核队列', helper: '风险词、到期提醒、批量复核' },
      ],
    };
  }
  if (module === 'publish') {
    return {
      stateLabel: '身份已接入',
      currentEntry: '平台视频 / 笔记 ID 和广告素材 ID 已在详情页的数据映射中维护。',
      pendingScope: '发布管理尚未连接平台发布接口或发布状态同步，不展示可发布假操作。',
      items: [
        { label: '已接入', value: '数据映射', helper: 'video_id / note_id / item_id / material_id' },
        { label: '真实用途', value: '日报回流', helper: '外部 ID 用于承接平台表现数据' },
        { label: '待接入', value: '发布同步', helper: '平台发布状态和标题回填' },
      ],
    };
  }
  if (module === 'tasks') {
    return {
      stateLabel: '规划中',
      currentEntry: '协作动作目前来自素材详情、处理队列和回流匹配，不单独生成虚构任务池。',
      pendingScope: '协作任务尚未接入任务表、负责人、截止时间和状态流转，因此不展示规划数值 badge。',
      items: [
        { label: '已接入', value: '处理动作', helper: '上传、补队列、重试、绑定外部 ID' },
        { label: '真实来源', value: '素材状态', helper: '待生成、待补源、未匹配等状态' },
        { label: '待接入', value: '任务系统', helper: '负责人、优先级、截止时间和 SLA' },
      ],
    };
  }
  if (module === 'stats') {
    return {
      stateLabel: '基础已接入',
      currentEntry: '当前真实统计来自素材库 summary、视频处理队列和回流匹配面板。',
      pendingScope: '数据统计尚未接入独立趋势、平台覆盖和投放效果聚合，不展示静态图表占位。',
      items: [
        { label: '已接入', value: '基础汇总', helper: '总素材、已就绪、待生成、原片体积' },
        { label: '已接入', value: '回流匹配', helper: '未匹配日报组和外部 ID 聚合' },
        { label: '待接入', value: '趋势看板', helper: '入库趋势、覆盖率、投放效果' },
      ],
    };
  }
  return {
    stateLabel: '只读说明',
    currentEntry: '系统配置目前由后端环境变量、TOS 签名链路和权限策略承接，前端只展示真实可操作入口。',
    pendingScope: '系统设置尚未提供安全的前端配置写入接口，不展示会误导用户的保存按钮。',
    items: [
      { label: '已接入', value: 'TOS 签名', helper: '播放和下载通过短时签名链接' },
      { label: '已接入', value: '权限控制', helper: '上传、编辑、重试受写权限保护' },
      { label: '待接入', value: '配置面板', helper: 'Bucket、CDN、队列和权限策略' },
    ],
  };
}
