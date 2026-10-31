import '@lobehub/ui/theme.css';
import '@lobehub/ui/style.css';
import '@fontsource-variable/geist/wght.css';
import '@fontsource-variable/geist-mono/wght.css';
import '@/styles/aios-theme.css';
import { ConfigProvider } from '@lobehub/ui';
import { zhCn } from '@lobehub/ui/i18n';
import { initThemePreference } from '@/lib/theme-preference';
import { LazyMotion, m } from 'motion/react';
import { createContext, lazy, Suspense, useContext, type ReactNode } from 'react';

// lobe-ui reads its theme from <html data-theme / data-neutral-color>. No neutral palette is set,
// so surfaces, text and borders use lobe's untinted gray (v3, DESIGN.md › Color Roles); the
// viewer's remembered appearance picks light or dark (light by default; DESIGN.md › Themes).
initThemePreference();

// HarmonyOS Sans SC, the CJK face lobe-ui ships, from npmmirror (owner decision 2026-10-24). It
// draws Chinese only where PingFang is missing (Windows): macOS never fetches the font files. lobe
// appends the stylesheet after the first render; its other CDN fonts (Latin, mono, KaTeX) stay off.
// Tests do not load it.
const CJK_WEBFONTS = ['https://registry.npmmirror.com/@lobehub/webfont-harmony-sans-sc/1.0.0/files/css/index.css'];
const LOAD_CJK_WEBFONTS = process.env.NODE_ENV !== 'test';

const InsideLobeProvider = createContext(false);

// lobe-ui animates through the motion component it is given. The light `m` component keeps the
// first screen small; the animation features load right after it (domMax covers layout animations).
const loadMotionFeatures = () => import('./motion-features').then((module) => module.domMax);

// Toasts raised before the hosts mount wait in lobe's pending queue; confirmModal() calls wait in
// the modal store. Both are opened by user actions after the first screen.
const LobeHosts = lazy(() => import('./lobe-hosts'));

/**
 * lobe-ui runtime for the whole app (ViteProviders): theme, lobe stylesheets, v2 tokens and the
 * self-hosted Geist fonts, with motion features and the toast/modal hosts loading after the first
 * screen. lobe's built-in copy (pagination, empty text, pickers) uses its zh-CN resources. Tests
 * render inside it too.
 */
export function LobeProvider({ children }: { children: ReactNode }) {
  // Nested providers (a route shell under the app root, a test wrapper) reuse the outer one, so
  // there is one set of toast and modal hosts.
  if (useContext(InsideLobeProvider)) return <>{children}</>;
  return (
    <InsideLobeProvider.Provider value>
      <LazyMotion features={loadMotionFeatures}>
        <ConfigProvider motion={m} locale="zh-CN" resources={zhCn} enableCustomFonts={LOAD_CJK_WEBFONTS} customFonts={CJK_WEBFONTS}>
          {children}
          <Suspense fallback={null}>
            <LobeHosts />
          </Suspense>
        </ConfigProvider>
      </LazyMotion>
    </InsideLobeProvider.Provider>
  );
}
