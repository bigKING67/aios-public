"use client";

import { Alert, Spin } from "antd";
import { useQuery } from "@tanstack/react-query";

import { Layout } from "@/components/organisms/layout";
import { ProtectedRoute } from "@/components/protected-route";
import { resolveClientErrorMessage } from "@/lib/client-error";
import { frontendEnv } from "@/lib/frontend-env";
import { fetchSampleInventoryAccessPolicy } from "../_lib/sample-inventory-api";
import { SampleInventoryApplication } from "./sample-inventory-application";

function SampleInventoryAccessGate() {
  const accessPolicyQuery = useQuery({
    queryKey: ["sample-inventory", "access-policy"],
    queryFn: fetchSampleInventoryAccessPolicy,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const policy = accessPolicyQuery.data;
  const policyMatchesBuild =
    policy?.mode === frontendEnv.sampleInventoryAccessMode &&
    policy.anonymousRead === (policy.mode === "public") &&
    policy.anonymousWrite === (policy.mode === "public");

  return (
    <Layout>
      {accessPolicyQuery.isLoading ? (
        <div className="flex min-h-[320px] items-center justify-center">
          <Spin size="large" description="正在确认样品库存访问策略" />
        </div>
      ) : accessPolicyQuery.error ? (
        <Alert
          type="error"
          showIcon
          title="样品库存访问策略加载失败"
          description={resolveClientErrorMessage(accessPolicyQuery.error, "请检查 API 服务状态后重试。")}
        />
      ) : !policyMatchesBuild ? (
        <Alert
          type="error"
          showIcon
          title="样品库存访问配置不一致"
          description="前端与 API 的访问模式不一致，已停止加载业务数据。请统一配置后重新发布。"
        />
      ) : (
        <SampleInventoryApplication />
      )}
    </Layout>
  );
}

export function SampleInventoryClient() {
  const content = <SampleInventoryAccessGate />;
  return frontendEnv.sampleInventoryAccessMode === "authenticated" ? (
    <ProtectedRoute>{content}</ProtectedRoute>
  ) : (
    content
  );
}
