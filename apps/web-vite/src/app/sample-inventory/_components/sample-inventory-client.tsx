"use client";

import { Layout } from "@/components/organisms/layout";
import { ProtectedRoute } from "@/components/protected-route";
import { SampleInventoryApplication } from "./sample-inventory-application";

export function SampleInventoryClient() {
  return (
    <ProtectedRoute>
      <Layout>
        <SampleInventoryApplication />
      </Layout>
    </ProtectedRoute>
  );
}
