export interface DefaultRoleTemplate {
  code: string;
  name: string;
  description: string;
}

export const DEFAULT_ROLE_TEMPLATES: DefaultRoleTemplate[] = [
  {
    code: 'bd',
    name: 'BD',
    description: '可查看带货达人看板；可访问达人库，新增达人，并操作当前归属自己的达人记录',
  },
  {
    code: 'bd_manager',
    name: 'BD管理员',
    description: '可查看带货达人看板；达人库业务管理员，可操作所有达人记录，但不开放系统用户/角色管理',
  },
  {
    code: 'content_ops',
    name: '内容中台权限',
    description: '可查看素材库、上传素材，并维护自己上传或负责的素材档案',
  },
  {
    code: 'content_ops_manager',
    name: '内容中台负责人',
    description: '内容中台负责人权限，可维护全部素材档案与内容资产配置',
  },
  {
    code: 'operator',
    name: '运营操作员',
    description: '除数据运维与管理页面外可访问业务功能（看板/周报/月报/营销/导出）',
  },
  {
    code: 'dashboard_view',
    name: '看板查看者',
    description: '可查看看板全部页面（Overview、天猫、抖音、京东、微信小程序、小红书）',
  },
  {
    code: 'viewer',
    name: '查看者',
    description: '首页、看板概览、报告概览',
  },
  {
    code: 'tmall',
    name: '天猫运营',
    description: '首页、看板（Overview+天猫）、周报（概览+天猫）、月报',
  },
  {
    code: 'douyin',
    name: '抖音运营',
    description: '首页、看板（Overview+抖音）、周报（概览+抖音）、月报',
  },
  {
    code: 'xhs',
    name: '小红书运营',
    description: '首页、看板（Overview+小红书）、周报（概览+小红书）、月报',
  },
  {
    code: 'jd',
    name: '京东运营',
    description: '首页、看板（Overview+京东）、周报（概览+京东）、月报',
  },
  {
    code: 'wx',
    name: '微信运营',
    description: '首页、看板（Overview+微信）、周报（概览+微信）、月报',
  },
];
