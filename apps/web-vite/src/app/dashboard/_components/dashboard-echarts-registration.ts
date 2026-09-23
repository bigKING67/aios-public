import * as echarts from 'echarts/core';
import { BarChart, LineChart, ScatterChart } from 'echarts/charts';
import { GridSimpleComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

type DashboardEchartsCore = typeof import('echarts/core');

let hasRegisteredDashboardEcharts = false;

export function registerDashboardEcharts(echarts: DashboardEchartsCore) {
  if (hasRegisteredDashboardEcharts) {
    return;
  }

  echarts.use([
    LineChart,
    BarChart,
    ScatterChart,
    GridSimpleComponent,
    LegendComponent,
    CanvasRenderer,
  ]);
  hasRegisteredDashboardEcharts = true;
}

export function getDashboardEchartsRuntime(): DashboardEchartsCore {
  registerDashboardEcharts(echarts);
  return echarts;
}
