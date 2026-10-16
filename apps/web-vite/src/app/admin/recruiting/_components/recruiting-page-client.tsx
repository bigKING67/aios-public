"use client";

import { useMemo, useState } from "react";
import { Alert, Button, Card, Empty, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { LinkOutlined, ReloadOutlined } from "@ant-design/icons";
import { Badge } from "@/components/atoms/badge";
import { Layout } from "@/components/organisms/layout";
import { ProtectedRoute } from "@/components/protected-route";
import { ADMIN_READ_PERMISSIONS } from "@/lib/permissions";
import { resolveClientErrorMessage } from "@/lib/client-error";
import { ROUTE_PATHS } from "@/lib/route-policy-registry";
import type { RecruitingSubmissionListItem } from "@/lib/generated-api-contract";
import { useRecruitingSubmissions } from "../_lib/recruiting-api";
import {
  VERDICT_BADGE_STATUS,
  VERDICT_LABELS,
  formatDuration,
  isVerdict,
} from "../_lib/recruiting-review-model";
import { RecruitingSubmissionDrawer } from "./recruiting-submission-drawer";
import { recruitingClasses as styles } from "../_lib/recruiting-classes";

function buildColumns(
  onOpen: (submissionId: string) => void,
): ColumnsType<RecruitingSubmissionListItem> {
  return [
    {
      title: "候选人",
      width: 140,
      dataIndex: "candidateName",
      key: "candidateName",
    },
    {
      title: "学校",
      width: 200,
      dataIndex: "schoolAndGrade",
      key: "schoolAndGrade",
      ellipsis: true,
    },
    {
      title: "提交时间",
      width: 190,
      dataIndex: "submittedAt",
      key: "submittedAt",
      render: (value: string) => (
        <span className={styles.tabular}>
          {new Date(value).toLocaleString("zh-CN")}
        </span>
      ),
    },
    {
      title: "用时",
      width: 120,
      dataIndex: "durationSeconds",
      key: "durationSeconds",
      render: (value: number | null) => (
        <span className={styles.tabular}>{formatDuration(value)}</span>
      ),
    },
    {
      title: "总分",
      width: 80,
      key: "total",
      align: "right",
      render: (_, item) => (
        <span className={styles.tabular}>
          {item.review ? item.review.total : "—"}
        </span>
      ),
    },
    {
      title: "结论",
      width: 130,
      key: "verdict",
      render: (_, item) =>
        item.review && isVerdict(item.review.verdict) ? (
          <Badge status={VERDICT_BADGE_STATUS[item.review.verdict]}>
            {VERDICT_LABELS[item.review.verdict]}
          </Badge>
        ) : (
          <Badge status="neutral">待评分</Badge>
        ),
    },
    {
      title: "操作",
      width: 110,
      key: "actions",
      render: (_, item) => (
        <Button
          type="link"
          size="small"
          onClick={() => onOpen(item.submissionId)}
        >
          查看答卷
        </Button>
      ),
    },
  ];
}

export function RecruitingPageClient() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const submissions = useRecruitingSubmissions(page, pageSize);
  const columns = useMemo(() => buildColumns(setSelectedId), []);
  const candidateLink = `${window.location.origin}${ROUTE_PATHS.joinAiIntern}`;

  return (
    <ProtectedRoute
      requiredPermission={ADMIN_READ_PERMISSIONS}
      permissionMode="any"
    >
      <Layout>
        <Card
          title="招聘测评"
          extra={
            <Button
              icon={<ReloadOutlined />}
              loading={submissions.isFetching}
              onClick={() => submissions.refetch()}
            >
              刷新
            </Button>
          }
        >
          <p className={styles.pageHint}>
            AI 应用开发实习生 · 候选人答题链接（无需登录）：
            <a href={candidateLink} target="_blank" rel="noopener noreferrer">
              <LinkOutlined /> {candidateLink}
            </a>
          </p>
          {submissions.error ? (
            <Alert
              type="error"
              showIcon
              title={resolveClientErrorMessage(
                submissions.error,
                "答卷列表加载失败",
              )}
              description="只有管理员可以查看答卷。"
            />
          ) : (
            <Table
              rowKey="submissionId"
              columns={columns}
              dataSource={submissions.data?.items ?? []}
              loading={submissions.isLoading}
              scroll={{ x: 970 }}
              locale={{
                emptyText: <Empty description="还没有候选人提交答卷" />,
              }}
              pagination={{
                current: page,
                pageSize,
                total: submissions.data?.total ?? 0,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 份`,
                onChange: (nextPage, nextSize) => {
                  setPage(nextSize === pageSize ? nextPage : 1);
                  setPageSize(nextSize);
                },
              }}
            />
          )}
        </Card>
        <RecruitingSubmissionDrawer
          submissionId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      </Layout>
    </ProtectedRoute>
  );
}
