/**
 * Ant Design v6 AIOS 品牌蓝主题配置
 *
 * 设计原则：
 * 1. 主色：#2F6EEA（品牌蓝）- 全站主按钮与交互强调统一色
 * 2. 圆角：更圆润（base: 6px, lg: 12px）
 * 3. 间距：更宽松（增强呼吸感）
 * 4. 阴影：更细腻（使用 Ant Design v6 新的阴影系统）
 * 5. 过渡：更平滑
 *
 * 版本：v6.0.0
 * 更新时间：2026-02-11
 */

import type { ThemeConfig } from 'antd';
import {
  DESIGN_COLOR_VALUES,
  DESIGN_FONT_FAMILY,
  DESIGN_SHADOW_VALUES,
} from '@/lib/design-token-values';

const colors = DESIGN_COLOR_VALUES;
const aiosFontFamily = DESIGN_FONT_FAMILY;

const ANT_DARK_THEME_ADAPTER_COLORS = {
  backgroundBase: '#141414',
  textBase: '#FFFFFFCC',
  border: '#434343',
} as const;

export const aiosBrandTheme: ThemeConfig = {
  // ============ Token 系统 ============
  token: {
    // 颜色 Token
    colorPrimary: colors.primary,           // 品牌蓝（全站统一主色）
    colorSuccess: colors.success,           // 健康/成功绿
    colorWarning: colors.warning,           // 高对比警告棕黄
    colorError: colors.danger,              // 错误/危险红
    colorInfo: colors.info,                 // 信息色 = 品牌蓝文字色
    colorSuccessBg: colors.statusSuccessBg,
    colorSuccessBorder: colors.statusSuccessBorder,
    colorSuccessText: colors.statusSuccess,
    colorWarningBg: colors.statusWarningBg,
    colorWarningBorder: colors.statusWarningBorder,
    colorWarningText: colors.statusWarning,
    colorErrorBg: colors.statusDangerBg,
    colorErrorBorder: colors.statusDangerBorder,
    colorErrorText: colors.statusDanger,
    colorInfoBg: colors.statusInfoBg,
    colorInfoBorder: colors.statusInfoBorder,
    colorInfoText: colors.statusInfo,
    colorTextBase: colors.textPrimary,      // 哑光黑，避免纯黑
    colorTextLightSolid: colors.textInverse, // 品牌蓝实心按钮上的文字

    // 圆角 Token - v6 新系统更灵活
    borderRadius: 6,                   // 基础圆角（更圆润）
    borderRadiusLG: 12,                // 大圆角
    borderRadiusSM: 4,                 // 小圆角
    borderRadiusXS: 2,                 // 极小圆角

    // 间距 Token - 增强呼吸感
    margin: 16,                        // 基础边距
    marginXS: 8,                       // 小边距
    marginSM: 12,                      // 中小边距
    marginLG: 24,                      // 大边距
    marginXL: 32,                      // 超大边距
    padding: 16,
    paddingXS: 8,
    paddingSM: 12,
    paddingLG: 24,
    paddingXL: 32,

    // 字体
    fontFamily: aiosFontFamily,
    fontSize: 14,
    fontSizeHeading1: 38,
    fontSizeHeading2: 30,
    fontSizeHeading3: 24,
    fontSizeHeading4: 20,
    fontSizeHeading5: 16,
    lineHeight: 1.5714285714,          // 良好的行高
    lineHeightHeading1: 1.2,
    lineHeightHeading2: 1.35,

    // 阴影 - v6 新的柔和阴影系统
    boxShadow: DESIGN_SHADOW_VALUES.lg,

    // 控件
    controlHeight: 36,                 // 按钮/输入框高度
    controlHeightSM: 28,
    controlHeightLG: 44,

    // 过渡
    motionEaseInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    motionEaseOut: 'cubic-bezier(0, 0, 0.2, 1)',
    motionEaseOutCirc: 'cubic-bezier(0.04, 0.93, 0.82, 0.74)',
    motionUnit: 0.1,                   // 100ms 基准

    // 链接
    colorLink: colors.statusInfo,
    colorLinkHover: colors.statusInfoStrong,
    colorLinkActive: colors.statusInfoStrong,
  },

  // ============ 组件 Token 系统 ============
  components: {
    // Button
    Button: {
      colorPrimary: colors.primary,
      colorTextLightSolid: colors.textInverse,
      controlHeight: 36,
      borderRadius: 6,
      controlOutline: 'var(--brand-focus-ring)',
    },

    // Card - 现代卡片风格
    Card: {
      boxShadow: DESIGN_SHADOW_VALUES.sm,
      borderRadiusLG: 12,
      colorBorder: colors.border,          // 浅灰边框
    },

    // Input
    Input: {
      colorBorder: colors.border,
      borderRadius: 6,
      controlHeight: 36,
      colorTextPlaceholder: colors.textTertiary,
    },

    // Select - 圆润下拉框
    Select: {
      colorBorder: colors.border,
      borderRadius: 6,
      controlHeight: 36,
    },

    // Table
    Table: {
      colorBorder: colors.border,
      headerBg: colors.backgroundTertiary, // 浅灰表头
      headerSortActiveBg: colors.backgroundSecondary,
      rowHoverBg: colors.backgroundTertiary,
      borderRadius: 6,
    },

    // Collapse
    Collapse: {
      colorBorder: colors.border,
      borderRadiusLG: 6,
    },

    // Modal
    Modal: {
      borderRadiusLG: 12,
      boxShadow: DESIGN_SHADOW_VALUES.lg,
    },

    // Drawer
    Drawer: {
      borderRadiusLG: 12,
      boxShadow: DESIGN_SHADOW_VALUES.lg,
    },

    // Notification
    Notification: {
      borderRadiusLG: 8,
    },

    // Message
    Message: {
      borderRadiusLG: 8,
    },

    // Tooltip
    Tooltip: {
      borderRadius: 4,
    },

    // DatePicker
    DatePicker: {
      borderRadius: 6,
      controlHeight: 36,
    },

    // Form
    Form: {
      labelFontSize: 14,
      labelColor: colors.textPrimary,
    },

    // Pagination
    Pagination: {
      itemActiveBg: colors.primary,
      itemActiveColor: colors.textInverse,
    },

    // Tag
    Tag: {
      borderRadiusSM: 4,
      borderRadius: 6,
    },

    // Badge
    Badge: {
      colorError: colors.danger,
      colorWarning: colors.warning,
      colorSuccess: colors.success,
    },

    // Segmented
    Segmented: {
      itemSelectedBg: colors.primary,
      itemSelectedColor: colors.textInverse,
    },
  },
};

/**
 * 深色主题配置（可选，P3 功能）
 *
 * 仅作为 Ant Design dark adapter exception 保留，不代表当前运行时启用 dark mode。
 */
export const darkTheme: ThemeConfig = {
  token: {
    colorPrimary: colors.primary,
    fontFamily: aiosFontFamily,
    colorBgBase: ANT_DARK_THEME_ADAPTER_COLORS.backgroundBase,
    colorTextBase: ANT_DARK_THEME_ADAPTER_COLORS.textBase,
    colorBorder: ANT_DARK_THEME_ADAPTER_COLORS.border,
  },
};
