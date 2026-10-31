import { useMutation } from '@tanstack/react-query';
import { toast } from '@lobehub/ui';
import { resolveClientErrorMessage } from '@/lib/client-error';
import {
  downloadCreatorLibraryTemplate,
  exportCreatorLibraryCsv,
  importCreators,
} from '../_lib/creator-library-api';
import { downloadBlobFile, downloadTextFile } from '../_lib/creator-library-csv';
import type { CreatorLibraryQueryParams } from '../_lib/creator-library-types';

interface UseCreatorLibraryFileActionsParams {
  queryParams: CreatorLibraryQueryParams;
  onImportSuccess: (importedCount: number) => void;
  onImportClose: () => void;
}

export function useCreatorLibraryFileActions({
  queryParams,
  onImportClose,
  onImportSuccess,
}: UseCreatorLibraryFileActionsParams) {
  const importMutation = useMutation({
    mutationFn: importCreators,
    onSuccess: (result) => {
      toast.success(`导入完成：成功 ${result.imported} 行，异常 ${result.failed} 行`);
      onImportClose();
      onImportSuccess(result.imported);
    },
    onError: (err) => toast.error(resolveClientErrorMessage(err, '导入失败')),
  });

  const templateMutation = useMutation({
    mutationFn: downloadCreatorLibraryTemplate,
    onSuccess: (blob) => {
      downloadBlobFile('influencer_library_template.xlsx', blob);
    },
    onError: (err) => toast.error(resolveClientErrorMessage(err, '下载模板失败')),
  });

  const exportMutation = useMutation({
    mutationFn: () => exportCreatorLibraryCsv(queryParams),
    onSuccess: (csv) => {
      downloadTextFile('influencer_library_export.csv', csv);
    },
    onError: (err) => toast.error(resolveClientErrorMessage(err, '导出失败')),
  });

  return {
    exportMutation,
    importMutation,
    templateMutation,
  };
}
