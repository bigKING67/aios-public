'use client';

import { useEffect, useState, type RefObject } from 'react';

export function useScrollActivity(targetRef: RefObject<HTMLElement | null>) {
  const [isScrolling, setIsScrolling] = useState(false);

  useEffect(() => {
    const element = targetRef.current;
    if (!element) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let active = true;

    const handleScroll = () => {
      if (!active) {
        return;
      }

      setIsScrolling(true);
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        if (active) {
          setIsScrolling(false);
        }
      }, 680);
    };

    element.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      active = false;
      element.removeEventListener('scroll', handleScroll);
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [targetRef]);

  return isScrolling;
}
