import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

const config: Config = {
  content: [
    './apps/web-vite/src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      /**
       * 色彩系统 - 与 AIOS 设计系统（design-tokens.css）完全对齐
       * 原则：优先使用 CSS 变量，禁止硬编码色值
       * 参考：https://github.com/...aios/apps/web-vite/src/styles/design-tokens.css
       */
      colors: {
        // ========== 语义色（优先使用） ==========
        // 文字色系
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary': 'var(--text-tertiary)',
        'text-disabled': 'var(--text-disabled)',
        'text-inverse': 'var(--text-inverse)',

        // 背景色系
        'bg-global': 'var(--bg-global)',
        'bg-card': 'var(--bg-card)',
        'bg-hover': 'var(--bg-hover)',
        'bg-subtle': 'var(--bg-subtle)',
        'bg-disabled': 'var(--bg-disabled)',
        'bg-input': 'var(--bg-input)',

        // 边界色系
        'border-color': 'var(--border-color)',
        'border-color-hover': 'var(--border-color-hover)',
        'divider-color': 'var(--divider-color)',

        // 功能色系（WCAG AA 对比度已验证）
        'color-success': 'var(--color-success)',
        'color-danger': 'var(--color-danger)',
        'color-warning': 'var(--color-warning)',
        'color-info': 'var(--color-info)',
        'status-success': 'var(--status-success)',
        'status-success-strong': 'var(--status-success-strong)',
        'status-success-bg': 'var(--status-success-bg)',
        'status-success-border': 'var(--status-success-border)',
        'status-warning': 'var(--status-warning)',
        'status-warning-strong': 'var(--status-warning-strong)',
        'status-warning-bg': 'var(--status-warning-bg)',
        'status-warning-border': 'var(--status-warning-border)',
        'status-danger': 'var(--status-danger)',
        'status-danger-strong': 'var(--status-danger-strong)',
        'status-danger-bg': 'var(--status-danger-bg)',
        'status-danger-border': 'var(--status-danger-border)',
        'status-info': 'var(--status-info)',
        'status-info-strong': 'var(--status-info-strong)',
        'status-info-bg': 'var(--status-info-bg)',
        'status-info-border': 'var(--status-info-border)',
        'status-neutral': 'var(--status-neutral)',
        'status-neutral-strong': 'var(--status-neutral-strong)',
        'status-neutral-bg': 'var(--status-neutral-bg)',
        'status-neutral-border': 'var(--status-neutral-border)',
        'trend-up': 'var(--trend-up)',
        'trend-down': 'var(--trend-down)',
        'trend-neutral': 'var(--trend-neutral)',
        'trend-up-muted': 'var(--trend-up-muted)',
        'trend-down-muted': 'var(--trend-down-muted)',
        'platform-tmall': 'var(--platform-tmall)',
        'platform-douyin': 'var(--platform-douyin)',
        'platform-xiaohongshu': 'var(--platform-xiaohongshu)',
        'platform-kuaishou': 'var(--platform-kuaishou)',
        'platform-jd': 'var(--platform-jd)',
        'platform-wechat': 'var(--platform-wechat)',
        'platform-unknown': 'var(--platform-unknown)',
        'chart-series-1': 'var(--chart-series-1)',
        'chart-series-2': 'var(--chart-series-2)',
        'chart-series-3': 'var(--chart-series-3)',
        'chart-series-4': 'var(--chart-series-4)',
        'chart-series-5': 'var(--chart-series-5)',
        'chart-series-6': 'var(--chart-series-6)',
        'chart-series-muted': 'var(--chart-series-muted)',
        'chart-series-highlight': 'var(--chart-series-highlight)',
        'domain-traffic-l1': 'var(--domain-traffic-l1-text)',
        'domain-traffic-l2': 'var(--domain-traffic-l2-text)',
        'domain-traffic-l3': 'var(--domain-traffic-l3-text)',
        'domain-topsis-star': 'var(--domain-topsis-star-text)',
        'domain-topsis-stable': 'var(--domain-topsis-stable-text)',
        'domain-topsis-opportunity': 'var(--domain-topsis-opportunity-text)',
        'domain-topsis-long-tail': 'var(--domain-topsis-long-tail-text)',
        'domain-creator-s': 'var(--domain-creator-s-text)',
        'domain-creator-a': 'var(--domain-creator-a-text)',
        'domain-creator-b': 'var(--domain-creator-b-text)',
        'domain-creator-c': 'var(--domain-creator-c-text)',

        // 品牌色系
        'brand-primary': 'var(--brand-primary)',
        'brand-secondary': 'var(--brand-secondary)',
        'brand-bright': 'var(--brand-bright)',
        'brand-border': 'var(--brand-border)',
        'brand-text': 'var(--brand-text)',
        'brand-on-primary': 'var(--brand-on-primary)',
        'brand-dark': 'var(--brand-dark)',

      },

      /**
       * 圆角系统 - 与 design-tokens.css 对齐（4px 标准）
       */
      borderRadius: {
        none: 'var(--border-radius-none)',
        xs: 'var(--border-radius-sm)',
        sm: 'var(--border-radius-base)',
        base: 'var(--border-radius-base)',
        md: 'var(--border-radius-md)',
        lg: 'var(--border-radius-lg)',
        xl: 'var(--border-radius-xl)',
        '2xl': 'var(--border-radius-2xl)',
        full: 'var(--border-radius-full)',
      },

      /**
       * 间距系统 - 与 design-tokens.css 的 8px 栅格对齐
       */
      spacing: {
        0: 'var(--spacing-0)',
        1: 'var(--spacing-1)',
        2: 'var(--spacing-2)',
        3: 'var(--spacing-3)',
        4: 'var(--spacing-4)',
        5: 'var(--spacing-5)',
        6: 'var(--spacing-6)',
        8: 'var(--spacing-8)',
        12: 'var(--spacing-12)',
        16: 'var(--spacing-16)',
        20: 'var(--spacing-20)',
        24: 'var(--spacing-24)',
      },

      /**
       * 阴影系统 - 与 design-tokens.css 对齐（克制、轻微）
       */
      boxShadow: {
        none: 'var(--shadow-none)',
        xs: 'var(--shadow-sm)',
        sm: 'var(--shadow-sm)',
        base: 'var(--shadow-base)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
        '2xl': 'var(--shadow-xl)',
      },

      /**
       * 字体系统 - 与 design-tokens.css 对齐
       */
      fontFamily: {
        sans: ['var(--font-family-base)'],
        base: ['var(--font-family-base)'],
        display: ['var(--font-family-display)'],
        mono: ['var(--font-family-mono)'],
      },

      fontSize: {
        xs: ['var(--font-size-xs)', { lineHeight: '1.25' }],
        sm: ['var(--font-size-sm)', { lineHeight: '1.35' }],
        base: ['var(--font-size-base)', { lineHeight: 'var(--line-height-normal)' }],
        lg: ['var(--font-size-lg)', { lineHeight: 'var(--line-height-normal)' }],
        xl: ['var(--font-size-xl)', { lineHeight: '1.15' }],
        '2xl': ['var(--font-size-2xl)', { lineHeight: 'var(--line-height-tight)' }],
        '3xl': ['var(--font-size-3xl)', { lineHeight: 'var(--line-height-snug)' }],
        '4xl': ['var(--font-size-data-lg)', { lineHeight: 'var(--line-height-tight)' }],
        '5xl': ['var(--font-size-marketing-lg)', { lineHeight: 'var(--line-height-tight)' }],
        '6xl': ['var(--font-size-marketing-xl)', { lineHeight: 'var(--line-height-tight)' }],
        display: ['var(--font-size-display)', { lineHeight: '1.18', letterSpacing: 'var(--letter-spacing-tight)' }],
        'section-title': [
          'var(--font-size-section-title)',
          { lineHeight: '1.25', letterSpacing: 'var(--letter-spacing-title)' },
        ],

        // 数据展示字体（等宽）- 需在组件使用 font-mono 实现等宽效果
        'data-lg': ['var(--font-size-data-lg)', { lineHeight: 'var(--line-height-tight)' }],
        'data-md': ['var(--font-size-data-md)', { lineHeight: 'var(--line-height-tight)' }],
        'data-sm': ['var(--font-size-data-sm)', { lineHeight: 'var(--line-height-normal)' }],
      },

      /**
       * 响应式断点 - 与 design-tokens.css 对齐
       */
      screens: {
        xs: '0px',
        sm: '576px',
        md: '768px',
        lg: '992px',
        xl: '1200px',
        '2xl': '1600px',
      },

      /**
       * 过渡系统 - 与 design-tokens.css 对齐
       */
      transitionDuration: {
        fast: 'var(--transition-duration-fast)',
        base: 'var(--transition-duration-base)',
        slow: 'var(--transition-duration-slow)',
      },
      transitionTimingFunction: {
        'ease-in-out': 'var(--transition-easing-standard)',
        'ease-out': 'var(--transition-easing-out)',
        'ease-in': 'var(--transition-easing-in)',
      },
    },
  },
  corePlugins: {
    preflight: true,
  },
  plugins: [
    plugin(function ({ addBase, addComponents }) {
      // 基础样式 - 与 design-tokens.css 对齐
      addBase({
        html: {
          fontSize: 'var(--font-size-base)',
          fontFamily: 'var(--font-family-base)',
        },
        body: {
          backgroundColor: 'var(--bg-global)',
          color: 'var(--text-primary)',
          transition: 'background-color var(--transition-base), color var(--transition-base)',
        },
      });

      // 实用组件 - 使用 CSS 变量和语义色
      addComponents({
        '.card': {
          backgroundColor: 'var(--bg-card)',
          borderRadius: 'var(--border-radius-base)',
          boxShadow: 'var(--shadow-base)',
          padding: 'var(--spacing-4)',
        },
        '.card-hover': {
          '@apply transition-all': {},
          '&:hover': {
            boxShadow: 'var(--shadow-md)',
          },
        },
        '.badge-success': {
          '@apply inline-flex items-center px-3 py-1 font-medium text-sm': {},
          backgroundColor: 'var(--status-success-bg)',
          color: 'var(--status-success)',
          borderColor: 'var(--status-success-border)',
          borderWidth: '1px',
          borderRadius: 'var(--border-radius-full)',
        },
        '.badge-warning': {
          '@apply inline-flex items-center px-3 py-1 font-medium text-sm': {},
          backgroundColor: 'var(--status-warning-bg)',
          color: 'var(--status-warning)',
          borderColor: 'var(--status-warning-border)',
          borderWidth: '1px',
          borderRadius: 'var(--border-radius-full)',
        },
        '.badge-error': {
          '@apply inline-flex items-center px-3 py-1 font-medium text-sm': {},
          backgroundColor: 'var(--status-danger-bg)',
          color: 'var(--status-danger)',
          borderColor: 'var(--status-danger-border)',
          borderWidth: '1px',
          borderRadius: 'var(--border-radius-full)',
        },
        '.badge-danger': {
          '@apply inline-flex items-center px-3 py-1 font-medium text-sm': {},
          backgroundColor: 'var(--status-danger-bg)',
          color: 'var(--status-danger)',
          borderColor: 'var(--status-danger-border)',
          borderWidth: '1px',
          borderRadius: 'var(--border-radius-full)',
        },
        '.badge-info': {
          '@apply inline-flex items-center px-3 py-1 font-medium text-sm': {},
          backgroundColor: 'var(--status-info-bg)',
          color: 'var(--status-info)',
          borderColor: 'var(--status-info-border)',
          borderWidth: '1px',
          borderRadius: 'var(--border-radius-full)',
        },
        '.badge-neutral': {
          '@apply inline-flex items-center px-3 py-1 font-medium text-sm': {},
          backgroundColor: 'var(--status-neutral-bg)',
          color: 'var(--status-neutral-strong)',
          borderColor: 'var(--status-neutral-border)',
          borderWidth: '1px',
          borderRadius: 'var(--border-radius-full)',
        },
      });
    }),
  ],
};
export default config;
