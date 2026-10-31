import '@testing-library/jest-dom/vitest';
import { MotionGlobalConfig } from 'motion/react';
import { createElement, type ComponentType, type ReactNode } from 'react';
import { vi } from 'vitest';

// lobe-ui animates through motion; happy-dom rejects a cancelled animation's `finished` promise,
// which surfaces as an unhandled rejection. Tests assert state, not motion, so animations jump.
MotionGlobalConfig.skipAnimations = true;

// LobeProvider lazy-loads the toast/modal hosts and motion features after the first screen; warm
// those modules so a dialog opened in a test does not wait on a cold module transform.
await Promise.all([import('@/components/lobe-hosts'), import('@/components/motion-features')]);

// Every lobe-ui component needs the LobeProvider the app mounts at its root (motion, toast and
// modal hosts), so component tests render inside it too; a test's own wrapper nests inside.
vi.mock('@testing-library/react', async (importOriginal) => {
  const library = await importOriginal<typeof import('@testing-library/react')>();
  const { LobeProvider } = await import('@/components/lobe-provider');
  type RenderOptions = NonNullable<Parameters<typeof library.render>[1]>;
  const render = (ui: Parameters<typeof library.render>[0], options: RenderOptions = {}) => {
    const Inner = options.wrapper as ComponentType<{ children: ReactNode }> | undefined;
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(LobeProvider, null, Inner ? createElement(Inner, null, children) : children);
    return library.render(ui, { ...options, wrapper });
  };
  return { ...library, render };
});
