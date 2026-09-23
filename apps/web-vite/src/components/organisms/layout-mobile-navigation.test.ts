import { describe, expect, it } from 'vitest';
import { centerSelectedMobileMenuItem } from './layout-mobile-navigation';

function setElementGeometry(
  element: HTMLElement,
  geometry: { clientWidth?: number; offsetLeft?: number; offsetWidth?: number }
) {
  for (const [property, value] of Object.entries(geometry)) {
    Object.defineProperty(element, property, { configurable: true, value });
  }
}

describe('centerSelectedMobileMenuItem', () => {
  it('centers the selected item inside the mobile navigation viewport', () => {
    const container = document.createElement('div');
    const selectedItem = document.createElement('div');
    selectedItem.className = 'ant-menu-item-selected';
    container.appendChild(selectedItem);
    setElementGeometry(container, { clientWidth: 320 });
    setElementGeometry(selectedItem, { offsetLeft: 480, offsetWidth: 96 });

    expect(centerSelectedMobileMenuItem(container)).toBe(true);
    expect(container.scrollLeft).toBe(368);
  });

  it('does not move a hidden desktop-only mobile navigation tree', () => {
    const container = document.createElement('div');
    const selectedItem = document.createElement('div');
    selectedItem.className = 'ant-menu-submenu-selected';
    container.appendChild(selectedItem);
    setElementGeometry(container, { clientWidth: 0 });
    setElementGeometry(selectedItem, { offsetLeft: 480, offsetWidth: 96 });
    container.scrollLeft = 24;

    expect(centerSelectedMobileMenuItem(container)).toBe(false);
    expect(container.scrollLeft).toBe(24);
  });
});
