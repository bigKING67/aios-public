import type {
  LiveCenterAnalysisJob as ApiLiveCenterAnalysisJob,
  LiveCenterAnalysisCreateRequest as ApiLiveCenterAnalysisCreateRequest,
  LiveCenterDateBoundsResponse as ApiLiveCenterDateBoundsResponse,
  LiveCenterMinuteMetric as ApiLiveCenterMinuteMetric,
  LiveCenterMultipartResumeRequest as ApiLiveCenterMultipartResumeRequest,
  LiveCenterMultipartResumeResponse as ApiLiveCenterMultipartResumeResponse,
  LiveCenterPlaybackUrlResponse as ApiLiveCenterPlaybackUrlResponse,
  LiveCenterRecording as ApiLiveCenterRecording,
  LiveCenterRecordingSegment as ApiLiveCenterRecordingSegment,
  LiveCenterRecordingSegmentCleanupResponse as ApiLiveCenterRecordingSegmentCleanupResponse,
  LiveCenterSessionDetailResponse as ApiLiveCenterSessionDetailResponse,
  LiveCenterSessionItem as ApiLiveCenterSession,
  LiveCenterSessionListResponse as ApiLiveCenterSessionListResponse,
  LiveCenterUploadCompletePartRequest as ApiLiveCenterUploadCompletePartRequest,
  LiveCenterUploadCompleteRequest as ApiLiveCenterUploadCompleteRequest,
  LiveCenterUploadCreateRequest as ApiLiveCenterUploadCreateRequest,
  LiveCenterUploadCreateResponse as ApiLiveCenterUploadCreateResponse,
  LiveCenterUploadPartUrl as ApiLiveCenterUploadPartUrl,
} from '@/lib/generated-api-contract';

export interface LiveCenterSessionQueryParams {
  page: number;
  pageSize: number;
  keyword?: string;
  shopId?: string;
  anchorDouyinId?: string;
  startDate?: string;
  endDate?: string;
}

export type LiveCenterDateBoundsResponse = ApiLiveCenterDateBoundsResponse;
export type LiveCenterSession = ApiLiveCenterSession;
export type LiveCenterSessionListResponse = ApiLiveCenterSessionListResponse;

export type LiveCenterMinuteMetric = ApiLiveCenterMinuteMetric;

export type LiveCenterRecordingSegment = Pick<
  ApiLiveCenterRecordingSegment,
  'segmentId' | 'segmentIndex' | 'uploadStatus'
> & Omit<
  Partial<ApiLiveCenterRecordingSegment>,
  | 'segmentId'
  | 'segmentIndex'
  | 'uploadStatus'
  | 'recordingId'
  | 'fileName'
  | 'processingStatus'
> & {
  recordingId?: string | null;
  fileName: string | null;
  processingStatus: string | null;
  displaySegmentIndex?: number | null;
};

export type LiveCenterRecording = Pick<ApiLiveCenterRecording, 'recordingId'> & Omit<
  Partial<ApiLiveCenterRecording>,
  'recordingId' | 'segments' | 'status'
> & {
  status: string | null;
  segments: LiveCenterRecordingSegment[];
};

export type LiveCenterAnalysisJob = Pick<ApiLiveCenterAnalysisJob, 'status'> & Partial<
  Omit<ApiLiveCenterAnalysisJob, 'status'>
> & {
  analysis_json?: unknown;
  jobId?: string | null;
  analysis_profile?: string | null;
  prompt_version?: string | null;
  input_snapshot?: unknown;
  progress_percent?: number | null;
  processing_stage?: string | null;
  output_object_key?: string | null;
  response_id?: string | null;
  usage_json?: unknown;
  summary?: string | null;
  resultSummary?: string | null;
  generatedAt?: string | null;
  generated_at?: string | null;
  finishedAt?: string | null;
  [key: string]: unknown;
};

export type LiveCenterJsonPrimitive = string | number | boolean | null;

export type LiveCenterJsonValue =
  | LiveCenterJsonPrimitive
  | LiveCenterJsonValue[]
  | { [key: string]: LiveCenterJsonValue };

export type LiveCenterSessionDetailResponse = Omit<
  ApiLiveCenterSessionDetailResponse,
  'recording' | 'analyses'
> & {
  recording: LiveCenterRecording | null;
  analyses: LiveCenterAnalysisJob[];
};

export type LiveCenterRecordingUploadCreatePayload = Omit<
  ApiLiveCenterUploadCreateRequest,
  'contentType' | 'fileSizeBytes' | 'segmentIndex'
> & {
  contentType: string;
  fileSizeBytes: number;
  segmentIndex: number;
};

export type LiveCenterRecordingUploadCreateResponse = ApiLiveCenterUploadCreateResponse;
export type LiveCenterRecordingMultipartResumePayload = ApiLiveCenterMultipartResumeRequest;
export type LiveCenterRecordingMultipartResumeResponse = ApiLiveCenterMultipartResumeResponse;
export type LiveCenterRecordingUploadPart = ApiLiveCenterUploadPartUrl;

export type LiveCenterRecordingUploadCompletePayload = Omit<
  ApiLiveCenterUploadCompleteRequest,
  'fileSizeBytes'
> & {
  fileSizeBytes: number;
};

export type LiveCenterRecordingUploadCompletePart = ApiLiveCenterUploadCompletePartRequest;
export type LiveCenterPlaybackUrlResponse = ApiLiveCenterPlaybackUrlResponse;
export type LiveCenterRecordingSegmentCleanupResponse =
  ApiLiveCenterRecordingSegmentCleanupResponse;
export type LiveCenterAnalysisCreatePayload = ApiLiveCenterAnalysisCreateRequest;
