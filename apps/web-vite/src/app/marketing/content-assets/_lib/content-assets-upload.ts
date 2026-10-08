import type { ContentAssetUploadCreateResponse, ContentAssetUploadProgress } from './content-assets-types';

/**
 * Browser half of a library upload: hash the file, PUT it to the signed TOS
 * URL with progress. Shared by the asset library and the AI 创作中心 uploader.
 */
export async function calculateFileSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function uploadFileToTos(
  upload: ContentAssetUploadCreateResponse,
  file: File,
  onProgress: (progress: ContentAssetUploadProgress) => void
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(upload.method, upload.uploadUrl);
    Object.entries(upload.headers).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });
    xhr.upload.onprogress = (event) => {
      const totalBytes = event.lengthComputable ? event.total : file.size || null;
      onProgress({
        stage: 'uploading',
        loadedBytes: event.loaded,
        totalBytes,
        percent: totalBytes ? Math.min(99, Math.round((event.loaded / totalBytes) * 100)) : null,
      });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      const detail = xhr.responseText ? `：${xhr.responseText.slice(0, 240)}` : '';
      reject(new Error(`TOS 上传失败（HTTP ${xhr.status}）${detail}`));
    };
    xhr.onerror = () => reject(new Error('TOS 上传失败：网络连接异常'));
    xhr.ontimeout = () => reject(new Error('TOS 上传失败：请求超时'));
    xhr.send(file);
  });
}
