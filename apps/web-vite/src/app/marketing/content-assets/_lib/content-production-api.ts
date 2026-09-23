import { apiClient } from '@/lib/api-client';

export interface ProductionClip {
  id: string;
  assetId: string;
  startMs: number;
  endMs: number;
  caption: string;
  volume: number;
}
export interface ProductionDraft {
  title: string;
  aspect: 'landscape' | 'portrait' | 'square';
  clips: ProductionClip[];
  rightsConfirmed: boolean;
}
export interface ProductionProject {
  projectId: string;
  title: string;
  revision: number;
  updatedAt: string;
  snapshot: ProductionDraft | null;
}
export interface ProductionJob {
  jobId: string;
  revision: number;
  preview: boolean;
  status: 'queued' | 'running' | 'cancel_requested' | 'cancelled' | 'failed' | 'completed';
  stage: string;
  errorMessage: string | null;
  playbackUrl: string | null;
  createdAt: string;
}
export interface ProductionClipHit {
  assetId: string;
  title: string;
  transcriptId: string;
  startMs: number;
  endMs: number;
  text: string;
  canUse: boolean;
  playbackUrl: string;
}
const base = '/v1/marketing/content-assets/production';
export const productionKeys = {
  capabilities: ['content-production', 'capabilities'] as const,
  projects: ['content-production', 'projects'] as const,
  detail: (id: string | null) => ['content-production', 'project', id] as const,
};
export async function fetchProductionCapabilities() {
  return (await apiClient.get<{ enabled: boolean; canWrite: boolean; planningEnabled: boolean; shotExtractionEnabled: boolean; semanticsEnabled: boolean }>(`${base}/capabilities`)).data;
}
export async function fetchProductionProjects() {
  return (await apiClient.get<{ items: ProductionProject[] }>(`${base}/projects`)).data.items;
}
export async function fetchProductionProject(id: string) {
  return (await apiClient.get<{ project: ProductionProject; jobs: ProductionJob[] }>(`${base}/projects/${id}`)).data;
}
export async function searchProductionClips(q: string, signal?: AbortSignal) {
  return (await apiClient.get<{ items: ProductionClipHit[] }>(`${base}/clips`, { params: { q }, signal })).data.items;
}
export async function saveProductionProject(draft: ProductionDraft, project?: ProductionProject | null) {
  const payload = { ...draft, expectedRevision: project?.revision ?? null };
  return project
    ? (await apiClient.put<ProductionProject>(`${base}/projects/${project.projectId}`, payload)).data
    : (await apiClient.post<ProductionProject>(`${base}/projects`, payload)).data;
}
export async function enqueueProductionRender(id: string, revision: number, preview: boolean) {
  return (await apiClient.post<{ jobId: string; status: string }>(`${base}/projects/${id}/renders`, { revision, preview })).data;
}
export async function cancelProductionRender(id: string, job: string) {
  return (await apiClient.post(`${base}/projects/${id}/renders/${job}/cancel`, {})).data;
}

export interface ProductionPlan {
  brief: string;
  searchText: string;
  targetSeconds: number;
  provider: string;
  model: string;
  basis: 'raw-transcript';
  sourceDurationMs: number;
  shots: { clip: ProductionClip; transcriptId: string; sourceTitle: string; evidence: string; reason: string }[];
  gaps: string[];
}
export async function createProductionPlan(request: { brief: string; searchText: string; assetIds: string[]; targetSeconds: number; modelCallConfirmed: boolean; rightsConfirmed: boolean }) {
  return (await apiClient.post<ProductionPlan>(`${base}/plans`, request, { timeout: 180000 })).data;
}

export interface ProductionVisualHit extends Omit<ProductionClipHit, 'transcriptId'> {
  analysisResultId: string;
  purpose: string;
  model: string;
}
export type ProductionSearchHit = ProductionClipHit | ProductionVisualHit;
export async function searchProductionVisualClips(q: string, signal?: AbortSignal) {
  return (await apiClient.get<{ items: ProductionVisualHit[] }>(`${base}/visual-clips`, { params: { q }, signal })).data.items;
}

export interface ProductionCatalogSummary {
  catalogId: string; assetId: string; title: string; createdAt: string; shotCount: number;
}
export interface ProductionCatalog {
  catalogId: string; assetId: string; clips: ProductionClip[]; playbackUrl: string;
  semanticStatus: 'not_analyzed'; boundaryStatus: 'cut_candidates_need_review';
}
export async function fetchProductionCatalogs() {
  return (await apiClient.get<{ items: ProductionCatalogSummary[] }>(`${base}/shot-catalogs`)).data.items;
}
export async function fetchProductionCatalog(id: string) {
  return (await apiClient.get<ProductionCatalog>(`${base}/shot-catalogs/${id}`)).data;
}
export async function importProductionCatalog(catalog: unknown, rightsConfirmed: boolean) {
  return (await apiClient.post<{ catalogId: string }>(`${base}/shot-catalogs`, { catalog, rightsConfirmed })).data;
}

export interface ProductionShotJob {
  jobId: string; assetId: string; status: ProductionJob['status']; stage: string;
  catalogId: string | null; errorMessage: string | null; createdAt: string;
}
export async function fetchProductionShotJobs() {
  return (await apiClient.get<{ items: ProductionShotJob[] }>(`${base}/shot-jobs`)).data.items;
}
export async function enqueueProductionShotJob(assetId: string, rightsConfirmed: boolean) {
  return (await apiClient.post<{ jobId: string; status: string }>(`${base}/shot-jobs`, { assetId, rightsConfirmed })).data;
}
export async function cancelProductionShotJob(id: string) {
  return (await apiClient.post(`${base}/shot-jobs/${id}/cancel`, {})).data;
}

export interface ProductionSemanticJob extends Omit<ProductionShotJob, 'assetId'> {
  catalogId: string;
}
export interface ProductionSemanticHit {
  catalogId: string; jobId: string; assetId: string; rawSha256: string; shotId: string;
  startMs: number; endMs: number; frameSha256: string; requestedAtMs: number;
  observation: { description: string; subjects: string[]; objects: string[]; setting: string; visibleText: string[]; reuseIdeas: string[] };
  model: string; promptVersion: string; playbackUrl: string;
}
export async function fetchProductionSemanticJobs() {
  return (await apiClient.get<{ items: ProductionSemanticJob[] }>(`${base}/semantic-jobs`)).data.items;
}
export async function enqueueProductionSemanticJob(catalogId: string, shotIds: string[], confirmed: boolean) {
  return (await apiClient.post(`${base}/semantic-jobs`, { catalogId, shotIds, rightsConfirmed: confirmed, modelCallConfirmed: confirmed })).data;
}
export async function cancelProductionSemanticJob(id: string) {
  return (await apiClient.post(`${base}/semantic-jobs/${id}/cancel`, {})).data;
}
export async function searchProductionSemanticClips(catalogId: string, q: string, signal?: AbortSignal) {
  return (await apiClient.get<{ items: ProductionSemanticHit[] }>(`${base}/shot-catalogs/${catalogId}/semantic-clips`, { params: { q }, signal })).data.items;
}
