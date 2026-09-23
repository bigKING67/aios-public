import { useMutation } from '@tanstack/react-query';
import type { MessageInstance } from 'antd/es/message/interface';
import { resolveClientErrorMessage } from '@/lib/client-error';
import {
  downloadCreatorLibraryTemplate,
  exportCreatorLibraryCsv,
  importCreators,
} from '../_lib/creator-library-api';
import { downloadBlobFile, downloadTextFile } from '../_lib/creator-library-csv';
import type { CreatorLibraryQueryParams } from '../_lib/creator-library-types';

interface UseCreatorLibraryFileActionsParams {
  messageApi: MessageInstance;
  queryParams: CreatorLibraryQueryParams;
  onImportSuccess: (importedCount: number) => void;
  onImportClose: () => void;
}

export function useCreatorLibraryFileActions({
  messageApi,
  queryParams,
  onImportClose,
  onImportSuccess,
}: UseCreatorLibraryFileActionsParams) {
  const importMutation = useMutation({
    mutationFn: importCreators,
    onSuccess: (result) => {
      messageApi.success(`导入完成：成功 ${result.imported} 行，异常 ${result.failed} 行`);
      onImportClose();
      onImportSuccess(result.imported);
    },
    onError: (err) => messageApi.error(resolveClientErrorMessage(err, '导入失败')),
  });

  const templateMutation = useMutation({
    mutationFn: downloadCreatorLibraryTemplate,
    onSuccess: (blob) => {
      downloadBlobFile('influencer_library_template.xlsx', blob);
    },
    onError: (err) => messageApi.error(resolveClientErrorMessage(err, '下载模板失败')),
  });

  const exportMutation = useMutation({
    mutationFn: () => exportCreatorLibraryCsv(queryParams),
    onSuccess: (csv) => {
      downloadTextFile('influencer_library_export.csv', csv);
    },
    onError: (err) => messageApi.error(resolveClientErrorMessage(err, '导出失败')),
  });

  return {
    exportMutation,
    importMutation,
    templateMutation,
  };
}
