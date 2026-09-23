'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  FilterContext,
  type FilterContextType,
  type FilterState,
} from './filter-context-state';

/**
 * 全局筛选状态类型定义
 * 支持日期范围、平台选择、排序等常见筛选条件
 */
/**
 * FilterProvider - 全局筛选状态提供者
 *
 * 用法:
 * ```tsx
 * <FilterProvider>
 *   <YourComponent />
 * </FilterProvider>
 * ```
 */
export function FilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFiltersState] = useState<FilterState>({
    dateRange: undefined,
    weekPeriod: undefined,
    selectedPlatforms: undefined,
    sortBy: undefined,
    sortOrder: 'asc',
    customFilters: {},
    isActive: false,
  });

  // 更新单个筛选项
  const updateFilter = useCallback(<Key extends keyof FilterState,>(
    key: Key,
    value: FilterState[Key]
  ) => {
    setFiltersState((prevFilters) => {
      if (areFilterValuesEqual(prevFilters[key], value)) {
        return prevFilters;
      }

      const nextFilters = {
        ...prevFilters,
        [key]: value,
      };

      // 检查是否有活跃筛选
      nextFilters.isActive = checkHasActiveFilters(nextFilters);

      // key = isActive 时，最终计算值可能与旧状态一致，直接复用旧引用
      if (areFilterStatesEqual(prevFilters, nextFilters)) {
        return prevFilters;
      }

      return nextFilters;
    });
  }, []);

  // 批量更新筛选项
  const setFilters = useCallback((newFilters: FilterState) => {
    setFiltersState((prevFilters) => {
      const merged = {
        ...prevFilters,
        ...newFilters,
      };
      // 检查是否有活跃筛选
      merged.isActive = checkHasActiveFilters(merged);
      return merged;
    });
  }, []);

  // 清除所有筛选
  const clearFilters = useCallback(() => {
    setFiltersState({
      dateRange: undefined,
      weekPeriod: undefined,
      selectedPlatforms: undefined,
      sortBy: undefined,
      sortOrder: 'asc',
      customFilters: {},
      isActive: false,
    });
  }, []);

  // 检查是否有活跃筛选
  const hasActiveFilters = useCallback((): boolean => {
    return (
      filters.dateRange !== undefined ||
      filters.weekPeriod !== undefined ||
      (filters.selectedPlatforms ? filters.selectedPlatforms.length > 0 : false) ||
      filters.sortBy !== undefined ||
      (filters.customFilters ? Object.keys(filters.customFilters).length > 0 : false)
    );
  }, [filters]);

  const value: FilterContextType = useMemo(
    () => ({
      filters,
      updateFilter,
      setFilters,
      clearFilters,
      hasActiveFilters,
    }),
    [filters, updateFilter, setFilters, clearFilters, hasActiveFilters]
  );

  return (
    <FilterContext.Provider value={value}>
      {children}
    </FilterContext.Provider>
  );
}

/**
 * 辅助函数：检查是否有活跃筛选
 */
function checkHasActiveFilters(state: FilterState): boolean {
  return (
    state.dateRange !== undefined ||
    state.weekPeriod !== undefined ||
    (state.selectedPlatforms ? state.selectedPlatforms.length > 0 : false) ||
    state.sortBy !== undefined ||
    (state.customFilters ? Object.keys(state.customFilters).length > 0 : false)
  );
}

/**
 * 辅助函数：比较筛选值是否相等
 * - 基础类型: Object.is
 * - 数组/对象: 递归比较，避免语义相同值触发不必要更新
 */
function areFilterValuesEqual(previousValue: unknown, nextValue: unknown): boolean {
  if (Object.is(previousValue, nextValue)) {
    return true;
  }

  if (Array.isArray(previousValue) && Array.isArray(nextValue)) {
    if (previousValue.length !== nextValue.length) {
      return false;
    }

    for (let index = 0; index < previousValue.length; index += 1) {
      if (!areFilterValuesEqual(previousValue[index], nextValue[index])) {
        return false;
      }
    }
    return true;
  }

  if (isPlainObject(previousValue) && isPlainObject(nextValue)) {
    const previousKeys = Object.keys(previousValue);
    const nextKeys = Object.keys(nextValue);

    if (previousKeys.length !== nextKeys.length) {
      return false;
    }

    for (const key of previousKeys) {
      if (!Object.prototype.hasOwnProperty.call(nextValue, key)) {
        return false;
      }

      if (!areFilterValuesEqual(previousValue[key], nextValue[key])) {
        return false;
      }
    }

    return true;
  }

  return false;
}

/**
 * 辅助函数：比较两个筛选状态对象是否相等
 */
function areFilterStatesEqual(previousState: FilterState, nextState: FilterState): boolean {
  const keys = new Set<keyof FilterState>([
    ...(Object.keys(previousState) as Array<keyof FilterState>),
    ...(Object.keys(nextState) as Array<keyof FilterState>),
  ]);

  for (const key of keys) {
    if (!areFilterValuesEqual(previousState[key], nextState[key])) {
      return false;
    }
  }

  return true;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 导出类型供其他地方使用
 */
export type { FilterContextType, FilterState } from './filter-context-state';
