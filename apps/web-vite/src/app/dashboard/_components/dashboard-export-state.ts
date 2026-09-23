import { useState } from 'react';

export function useDashboardExportState() {
  const [isExportingDetails, setIsExportingDetails] = useState(false);
  const [isExportingLiveDetails, setIsExportingLiveDetails] = useState(false);
  const [isExportingLiveGoodsDetails, setIsExportingLiveGoodsDetails] = useState(false);
  const [isExportingShortVideoDetails, setIsExportingShortVideoDetails] = useState(false);

  return {
    isExportingDetails,
    setIsExportingDetails,
    isExportingLiveDetails,
    setIsExportingLiveDetails,
    isExportingLiveGoodsDetails,
    setIsExportingLiveGoodsDetails,
    isExportingShortVideoDetails,
    setIsExportingShortVideoDetails,
  };
}
