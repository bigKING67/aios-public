'use client';

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

export function useCreatorLoginRedirect(currentPath: string) {
  const navigate = useNavigate();

  return useCallback(() => {
    navigate(`/login?redirect=${encodeURIComponent(currentPath)}`);
  }, [currentPath, navigate]);
}
