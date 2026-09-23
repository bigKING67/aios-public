const SELECTED_MENU_ITEM_SELECTOR = '.ant-menu-item-selected, .ant-menu-submenu-selected';

export function centerSelectedMobileMenuItem(scrollContainer: HTMLElement): boolean {
  if (scrollContainer.clientWidth === 0) return false;

  const selectedItem = scrollContainer.querySelector<HTMLElement>(SELECTED_MENU_ITEM_SELECTOR);
  if (!selectedItem) return false;

  const centeredLeft = selectedItem.offsetLeft
    - (scrollContainer.clientWidth - selectedItem.offsetWidth) / 2;
  scrollContainer.scrollLeft = Math.max(0, centeredLeft);
  return true;
}
