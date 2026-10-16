import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import {
  AIOS_API_PATHS,
  type RecruitingRubric,
  type RecruitingSaveReviewRequest,
  type RecruitingSubmissionDetail,
  type RecruitingSubmissionListResponse,
} from "@/lib/generated-api-contract";

const QUERY_ROOT = ["admin", "recruiting"] as const;

export function useRecruitingSubmissions(page: number, pageSize: number) {
  return useQuery({
    queryKey: [...QUERY_ROOT, "submissions", page, pageSize],
    queryFn: async () => {
      const response = await apiClient.get<RecruitingSubmissionListResponse>(
        AIOS_API_PATHS.recruitingSubmissions,
        {
          params: { page, pageSize },
        },
      );
      return response.data;
    },
  });
}

export function useRecruitingSubmission(submissionId: string | null) {
  return useQuery({
    queryKey: [...QUERY_ROOT, "submission", submissionId],
    queryFn: async () => {
      const response = await apiClient.get<RecruitingSubmissionDetail>(
        AIOS_API_PATHS.recruitingSubmission(submissionId as string),
      );
      return response.data;
    },
    enabled: submissionId !== null,
  });
}

export function useRecruitingRubric(version: number | undefined) {
  return useQuery({
    queryKey: [...QUERY_ROOT, "rubric", version],
    queryFn: async () => {
      const response = await apiClient.get<RecruitingRubric>(
        AIOS_API_PATHS.recruitingRubric,
        { params: { questionSetVersion: version } },
      );
      return response.data;
    },
    enabled: version !== undefined,
    staleTime: Infinity,
  });
}

export function useSaveRecruitingReview(submissionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: RecruitingSaveReviewRequest) => {
      const response = await apiClient.put<RecruitingSubmissionDetail>(
        AIOS_API_PATHS.recruitingSubmissionReview(submissionId),
        payload,
      );
      return response.data;
    },
    onSuccess: (detail) => {
      queryClient.setQueryData(
        [...QUERY_ROOT, "submission", submissionId],
        detail,
      );
      void queryClient.invalidateQueries({
        queryKey: [...QUERY_ROOT, "submissions"],
      });
    },
  });
}
