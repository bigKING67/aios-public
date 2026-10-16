import { apiClient } from "@/lib/api-client";
import {
  AIOS_API_PATHS,
  type RecruitingPublicSubmissionRequest,
  type RecruitingPublicSubmissionResponse,
} from "@/lib/generated-api-contract";

export async function submitAiInternTest(
  payload: RecruitingPublicSubmissionRequest,
): Promise<RecruitingPublicSubmissionResponse> {
  const response = await apiClient.post<RecruitingPublicSubmissionResponse>(
    AIOS_API_PATHS.recruitingPublicSubmissions,
    payload,
  );
  return response.data;
}
