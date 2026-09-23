import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridSimpleComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  LineChart,
  BarChart,
  GridSimpleComponent,
  LegendComponent,
  CanvasRenderer,
]);
