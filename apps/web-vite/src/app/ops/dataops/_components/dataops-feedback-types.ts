import { confirmModal, type ModalConfirmConfig, type ToastAPI } from '@lobehub/ui';

/**
 * Feedback the DataOps state hooks receive by injection (tests pass stubs): `toast` for
 * messages and `confirmModal` for confirmations.
 */
export type DataOpsMessageApi = Pick<ToastAPI, 'success' | 'info' | 'warning' | 'error'>;

export interface DataOpsModalApi {
  confirm: (config: ModalConfirmConfig) => unknown;
}

export const DATAOPS_MODAL_API: DataOpsModalApi = { confirm: confirmModal };
