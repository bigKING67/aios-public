import { ModalHost, ToastHost } from '@lobehub/ui';

/**
 * Hosts for lobe's imperative `toast()` and `confirmModal()` / `createModal()` APIs. LobeProvider
 * loads this module lazily (lobe's Modal pulls motion's drag controls); it imports from the package
 * entry so the hosts share one module instance with the API calls in every environment.
 */
export default function LobeHosts() {
  return (
    <>
      <ToastHost position="top" />
      <ModalHost />
    </>
  );
}
