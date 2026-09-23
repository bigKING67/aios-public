import { useCallback, useState } from 'react';
import type { Key } from 'react';

export function useDashboardNullableDrawerState<T>() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<T | null>(null);

  const openDrawer = useCallback((item: T | null) => {
    if (!item) {
      return;
    }

    setSelectedItem(item);
    setIsOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsOpen(false);
  }, []);

  const resetDrawer = useCallback(() => {
    closeDrawer();
    setSelectedItem(null);
  }, [closeDrawer]);

  return {
    isOpen,
    selectedItem,
    setSelectedItem,
    openDrawer,
    closeDrawer,
    resetDrawer,
  };
}

export function useDashboardExpandableNullableDrawerState<T>() {
  const {
    isOpen,
    selectedItem,
    setSelectedItem,
    openDrawer,
    closeDrawer,
    resetDrawer: resetBaseDrawer,
  } = useDashboardNullableDrawerState<T>();
  const [expandedRowKeys, setExpandedRowKeys] = useState<Key[]>([]);

  const resetExpandedRowKeys = useCallback(() => {
    setExpandedRowKeys([]);
  }, []);

  const resetDrawer = useCallback(() => {
    resetBaseDrawer();
    resetExpandedRowKeys();
  }, [resetBaseDrawer, resetExpandedRowKeys]);

  return {
    isOpen,
    selectedItem,
    setSelectedItem,
    openDrawer,
    closeDrawer,
    resetDrawer,
    expandedRowKeys,
    setExpandedRowKeys,
    resetExpandedRowKeys,
  };
}
