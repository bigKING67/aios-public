import { useCallback, useState } from 'react';

import { GOODS_QUADRANT_ORDER } from './dashboard-config';
import type { GoodsQuadrantKey } from './dashboard-config';

export function useDashboardGoodsMatrixState() {
  const [goodsMatrixVisibleQuadrants, setGoodsMatrixVisibleQuadrants] = useState<GoodsQuadrantKey[]>([
    ...GOODS_QUADRANT_ORDER,
  ]);

  const toggleGoodsMatrixQuadrant = useCallback((quadrant: GoodsQuadrantKey) => {
    setGoodsMatrixVisibleQuadrants((prev) => {
      const hasTarget = prev.includes(quadrant);
      if (hasTarget && prev.length === 1) {
        return prev;
      }
      const toggled = hasTarget ? prev.filter((item) => item !== quadrant) : [...prev, quadrant];
      return GOODS_QUADRANT_ORDER.filter((item) => toggled.includes(item));
    });
  }, []);

  return {
    goodsMatrixVisibleQuadrants,
    toggleGoodsMatrixQuadrant,
  };
}
