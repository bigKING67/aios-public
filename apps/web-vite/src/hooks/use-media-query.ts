'use client';

import { useSyncExternalStore } from 'react';

/**
 * useMediaQuery Hook - 响应式媒体查询
 *
 * 用于在运行时检测媒体查询状态，实现响应式布局
 *
 * 用法:
 * ```tsx
 * const isMobile = useMediaQuery('(max-width: 640px)');
 * const isTablet = useMediaQuery('(max-width: 1024px)');
 * const isDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
 * ```
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = (onStoreChange: () => void) => {
    if (typeof window === 'undefined') {
      return () => {};
    }

    const media = window.matchMedia(query);
    const listener = () => {
      onStoreChange();
    };

    // 同时适配标准 change 事件与旧版 MediaQueryList listener API。
    if (media.addEventListener) {
      media.addEventListener('change', listener);
    } else {
      // 旧 API: addListener (已弃用但可用于兼容)
      media.addListener(listener);
    }

    return () => {
      if (media.removeEventListener) {
        media.removeEventListener('change', listener);
      } else {
        media.removeListener(listener);
      }
    };
  };

  const getSnapshot = () => {
    if (typeof window === 'undefined') {
      return false;
    }

    return window.matchMedia(query).matches;
  };

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/**
 * 常用的响应式 Breakpoints
 */
export const mediaQueryBreakpoints = {
  // 移动设备
  mobile: '(max-width: 640px)',
  // 平板设备
  tablet: '(max-width: 1024px)',
  // 台式机
  desktop: '(min-width: 1025px)',

  // 高度检查
  tallScreen: '(min-height: 800px)',
  shortScreen: '(max-height: 600px)',

  // 深色模式
  darkMode: '(prefers-color-scheme: dark)',
  lightMode: '(prefers-color-scheme: light)',

  // 触屏设备
  touchDevice: '(hover: none) and (pointer: coarse)',
  hoverDevice: '(hover: hover)',
};

/**
 * 便利 Hook：检查是否移动设备
 */
export function useIsMobile(): boolean {
  return useMediaQuery(mediaQueryBreakpoints.mobile);
}

/**
 * 便利 Hook：检查是否平板设备
 */
export function useIsTablet(): boolean {
  return useMediaQuery(mediaQueryBreakpoints.tablet);
}

/**
 * 便利 Hook：检查是否桌面设备
 */
export function useIsDesktop(): boolean {
  return useMediaQuery(mediaQueryBreakpoints.desktop);
}

/**
 * 便利 Hook：检查是否深色模式
 */
export function useIsDarkMode(): boolean {
  return useMediaQuery(mediaQueryBreakpoints.darkMode);
}

export default useMediaQuery;
