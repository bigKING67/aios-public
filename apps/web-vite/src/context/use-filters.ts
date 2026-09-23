import { useContext } from 'react';
import { FilterContext, type FilterContextType } from './filter-context-state';

export function useFilters(): FilterContextType {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error(
      'useFilters must be used within FilterProvider. ' +
      'Make sure ViteProviders wraps the app with <FilterProvider>.'
    );
  }
  return context;
}
