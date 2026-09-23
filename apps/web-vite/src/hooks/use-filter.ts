'use client';

import { useCallback } from 'react';
import { useFilters } from '@/context/use-filters';

/**
 * useFilter Hook - 筛选状态管理
 *
 * 基于 FilterContext 的便利 Hook，提供简化的筛选状态接口
 *
 * 用法:
 * ```tsx
 * const { filters, updateFilter } = useFilter();
 * ```
 */
export function useFilter() {
  const { filters, updateFilter, setFilters, clearFilters, hasActiveFilters } =
    useFilters();

  /**
   * 更新单个筛选项的便利方法
   */
  const setDateRange = useCallback(
    (dateRange: [string, string] | undefined) => {
      updateFilter('dateRange', dateRange);
    },
    [updateFilter]
  );

  const setPlatforms = useCallback(
    (platforms: string[] | undefined) => {
      updateFilter('selectedPlatforms', platforms);
    },
    [updateFilter]
  );

  const setSortBy = useCallback(
    (sortBy: string | undefined, sortOrder: 'asc' | 'desc' = 'asc') => {
      setFilters({
        ...filters,
        sortBy,
        sortOrder,
      });
    },
    [filters, setFilters]
  );

  return {
    // 原始状态和方法
    filters,
    updateFilter,
    clearFilters,
    hasActiveFilters,

    // 便利方法
    setDateRange,
    setPlatforms,
    setSortBy,
  };
}

export default useFilter;
