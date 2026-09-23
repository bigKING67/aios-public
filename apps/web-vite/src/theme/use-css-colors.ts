import { useContext } from 'react';
import { ThemeContext } from './theme-context';

export function useCSSColors() {
  return useContext(ThemeContext);
}
