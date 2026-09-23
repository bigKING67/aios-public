import { createContext } from 'react';

export interface FilterState {
  dateRange?: [string, string];
  weekPeriod?: string;
  monthPeriod?: string;
  selectedPlatforms?: string[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  customFilters?: Record<string, unknown>;
  isActive?: boolean;
}

export interface FilterContextType {
  filters: FilterState;
  updateFilter: <Key extends keyof FilterState>(key: Key, value: FilterState[Key]) => void;
  setFilters: (filters: FilterState) => void;
  clearFilters: () => void;
  hasActiveFilters: () => boolean;
}

export const FilterContext = createContext<FilterContextType | undefined>(undefined);
