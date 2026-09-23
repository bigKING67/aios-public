import { ROUTE_PATHS } from '@/lib/route-policy-registry';

export function resolveSelectedMenuKey(pathname: string, routeKeys: readonly string[]): string {
  return routeKeys
    .filter((key) => pathname === key || (key !== ROUTE_PATHS.home && pathname.startsWith(`${key}/`)))
    .sort((a, b) => b.length - a.length)[0] ?? ROUTE_PATHS.home;
}

export function isDocsRoutePath(pathname: string): boolean {
  return pathname === ROUTE_PATHS.docs || pathname.startsWith(`${ROUTE_PATHS.docs}/`);
}

export function isEdgeToEdgeContentRoutePath(pathname: string): boolean {
  return (
    isDocsRoutePath(pathname) ||
    pathname === ROUTE_PATHS.sampleInventory ||
    pathname.startsWith(`${ROUTE_PATHS.sampleInventory}/`)
  );
}

export function resolveContentClassName(pathname: string): string {
  return isEdgeToEdgeContentRoutePath(pathname)
    ? 'mx-0 my-0 rounded-none p-0'
    : 'mx-3 my-3 rounded-lg p-3 sm:mx-4 sm:my-4 sm:p-4 lg:mx-6 lg:my-6 lg:p-6';
}
