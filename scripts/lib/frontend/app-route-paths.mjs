const DEFAULT_APP_ROOT = 'apps/web-vite/src/app';

export const APP_PAGE_FILE_PATTERN = /^apps\/web-vite\/src\/app(?:\/.*)?\/page\.(?:tsx|ts|jsx|js)$/;
export const APP_PAGE_EXTENSIONS = Object.freeze(['tsx', 'ts', 'jsx', 'js']);

export function isAppPageFile(file) {
  return APP_PAGE_FILE_PATTERN.test(file);
}

export function listAppPageFiles(repoRoot, options = {}) {
  const {
    listGitFiles,
  } = options;

  if (typeof listGitFiles !== 'function') {
    throw new TypeError('listAppPageFiles requires options.listGitFiles');
  }

  return listGitFiles([DEFAULT_APP_ROOT], {
    cwd: repoRoot,
    filter: isAppPageFile,
  });
}

export function routePathForPageFile(file) {
  if (!isAppPageFile(file)) {
    return null;
  }

  const routeSegment = file
    .replace(/^apps\/web-vite\/src\/app\/?/, '')
    .replace(/\/?page\.(?:tsx|ts|jsx|js)$/, '');

  if (!routeSegment) {
    return '/';
  }

  const reactRouterSegment = routeSegment
    .split('/')
    .map((segment) => {
      const dynamicMatch = /^\[([A-Za-z_$][\w$]*)\]$/.exec(segment);
      return dynamicMatch ? `:${dynamicMatch[1]}` : segment;
    })
    .join('/');

  return `/${reactRouterSegment}`;
}
