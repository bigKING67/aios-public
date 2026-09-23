type DashboardEchartsCore = typeof import('echarts/core');

let dashboardEchartsRuntimePromise: Promise<DashboardEchartsCore> | null = null;

export function loadDashboardEchartsRuntime(): Promise<DashboardEchartsCore> {
  dashboardEchartsRuntimePromise ??= import('./dashboard-echarts-registration')
    .then((registration) => registration.getDashboardEchartsRuntime())
    .catch((error: unknown) => {
      dashboardEchartsRuntimePromise = null;
      throw error;
    });

  return dashboardEchartsRuntimePromise;
}
