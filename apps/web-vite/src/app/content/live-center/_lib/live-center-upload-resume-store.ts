import type {
  LiveCenterRecordingUploadCompletePart,
  LiveCenterRecordingUploadCreateResponse,
} from './live-center-types';

const DB_NAME = 'aios-live-center-recording-uploads';
const DB_VERSION = 1;
const STORE_NAME = 'multipartUploads';

export interface LiveCenterResumableMultipartUploadRecord {
  id: string;
  sessionId: string;
  segmentIndex: number;
  fileName: string;
  fileSizeBytes: number;
  fileLastModified: number;
  recordingId: string;
  segmentId: string;
  objectKey: string;
  uploadId: string;
  partSizeBytes: number;
  expiresAt: string;
  completedParts: LiveCenterRecordingUploadCompletePart[];
  createdAt: string;
  updatedAt: string;
}

interface BuildRecordInput {
  file: File;
  segmentIndex: number;
  sessionId: string;
  upload: LiveCenterRecordingUploadCreateResponse;
}

export function buildLiveCenterUploadResumeKey(
  sessionId: string,
  segmentIndex: number,
  file: File
): string {
  return [
    sessionId,
    String(segmentIndex),
    file.name,
    String(file.size),
    String(file.lastModified || 0),
  ].join('::');
}

export function createLiveCenterResumableUploadRecord({
  file,
  segmentIndex,
  sessionId,
  upload,
}: BuildRecordInput): LiveCenterResumableMultipartUploadRecord | null {
  if (!upload.uploadId || !upload.partSizeBytes || upload.uploadStrategy !== 'multipart') {
    return null;
  }

  const now = new Date().toISOString();
  return {
    id: buildLiveCenterUploadResumeKey(sessionId, segmentIndex, file),
    sessionId,
    segmentIndex,
    fileName: file.name,
    fileSizeBytes: file.size,
    fileLastModified: file.lastModified || 0,
    recordingId: upload.recordingId,
    segmentId: upload.segmentId,
    objectKey: upload.objectKey,
    uploadId: upload.uploadId,
    partSizeBytes: upload.partSizeBytes,
    expiresAt: upload.expiresAt,
    completedParts: upload.completedParts || [],
    createdAt: now,
    updatedAt: now,
  };
}

export async function getLiveCenterResumableUploadRecord(
  sessionId: string,
  segmentIndex: number,
  file: File
): Promise<LiveCenterResumableMultipartUploadRecord | null> {
  const db = await openResumeDatabase();
  if (!db) return null;
  const id = buildLiveCenterUploadResumeKey(sessionId, segmentIndex, file);
  return readRecord(db, id);
}

export async function saveLiveCenterResumableUploadRecord(
  record: LiveCenterResumableMultipartUploadRecord
): Promise<void> {
  const db = await openResumeDatabase();
  if (!db) return;
  await putRecord(db, {
    ...record,
    completedParts: normalizeCompletedParts(record.completedParts),
    updatedAt: new Date().toISOString(),
  });
}

export async function saveLiveCenterResumableUploadPart(
  recordId: string,
  part: LiveCenterRecordingUploadCompletePart
): Promise<void> {
  const db = await openResumeDatabase();
  if (!db) return;
  const record = await readRecord(db, recordId);
  if (!record) return;
  await putRecord(db, {
    ...record,
    completedParts: normalizeCompletedParts([...record.completedParts, part]),
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteLiveCenterResumableUploadRecord(recordId: string): Promise<void> {
  const db = await openResumeDatabase();
  if (!db) return;
  await deleteRecord(db, recordId);
}

async function openResumeDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return null;
  }

  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function readRecord(
  db: IDBDatabase,
  id: string
): Promise<LiveCenterResumableMultipartUploadRecord | null> {
  return new Promise((resolve) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => {
      resolve((request.result as LiveCenterResumableMultipartUploadRecord | undefined) ?? null);
    };
    request.onerror = () => resolve(null);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => db.close();
    transaction.onabort = () => db.close();
  });
}

function putRecord(
  db: IDBDatabase,
  record: LiveCenterResumableMultipartUploadRecord
): Promise<void> {
  return new Promise((resolve) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(record);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      resolve();
    };
    transaction.onabort = () => {
      db.close();
      resolve();
    };
  });
}

function deleteRecord(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      resolve();
    };
    transaction.onabort = () => {
      db.close();
      resolve();
    };
  });
}

function normalizeCompletedParts(
  parts: LiveCenterRecordingUploadCompletePart[]
): LiveCenterRecordingUploadCompletePart[] {
  const byPartNumber = new Map<number, LiveCenterRecordingUploadCompletePart>();
  parts.forEach((part) => {
    if (part.partNumber > 0 && part.etag.trim()) {
      byPartNumber.set(part.partNumber, {
        partNumber: part.partNumber,
        etag: part.etag,
      });
    }
  });
  return Array.from(byPartNumber.values()).sort((left, right) => left.partNumber - right.partNumber);
}
