/**
 * 图表数据转换工具
 *
 * 提供周趋势等图表数据的格式化和数值转换功能
 */

export interface TrendPoint {
  date: string;
  value: number;
}

export interface FormattedChartData {
  series: Array<{
    name: string;
    data: number[];
  }>;
  xAxis: string[];
  /** 用于 Tooltip 显示：每个数据点对应的日期 */
  dates?: {
    thisWeek: string[];  // 本周每个点的日期，格式：YYYY/M/D
    prevWeek: string[];  // 上周每个点的日期，格式：YYYY/M/D
  };
  periodInfo?: {
    thisWeekStart: string;
    prevWeekStart: string;
  };
}

/**
 * 转换后端周报趋势数据为图表格式
 *
 * @param points 后端返回的 7 天趋势点位数据（周六到周五）
 * @param prevWeekPoints 上周的趋势数据（可选）
 * @param weekStartDate 本周开始日期（周六），用于生成周期信息
 * @returns 适配 LineChart 的图表数据结构
 *
 * @example
 * const points = [
 *   { date: '2026-02-14', value: 10000 },  // 周六
 *   { date: '2026-02-15', value: 12000 },
 *   ...
 * ]
 * const chartData = formatWeeklyTrendData(points, prevWeekPoints, '2026-02-14');
 * // => {
 * //   series: [
 * //     { name: '本周', data: [10000, 12000, ...] },
 * //     { name: '上周', data: [8500, 10200, ...] }
 * //   ],
 * //   xAxis: ['周六', '周日', '周一', '周二', '周三', '周四', '周五'],
 * //   periodInfo: {
 * //     thisWeekStart: '2026-02-14',
 * //     prevWeekStart: '2026-02-07'
 * //   }
 * // }
 */
export function formatWeeklyTrendData(
  points: TrendPoint[],
  prevWeekPoints?: TrendPoint[],
  weekStartDate?: string
): FormattedChartData | null {
  if (!points || points.length === 0) return null;

  const thisWeekData = points.map((p) => p.value);

  // 使用实际上周数据或模拟数据
  const prevWeekData = prevWeekPoints
    ? prevWeekPoints.map((p) => p.value)
    : points.map((p) => Math.round(p.value * 0.85));

  // 计算上周开始日期（weekStartDate 减去 7 天）
  let prevWeekStart = '';
  if (weekStartDate) {
    const date = new Date(weekStartDate);
    date.setDate(date.getDate() - 7);
    prevWeekStart = date.toISOString().split('T')[0];
  }

  // 格式化日期为 YYYY/M/D 格式
  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-');
    return `${year}/${parseInt(month)}/${parseInt(day)}`;
  };

  // 提取本周每个点的日期
  const thisWeekDates = points.map((p) => formatDate(p.date));

  // 提取上周每个点的日期
  const prevWeekDates = prevWeekPoints
    ? prevWeekPoints.map((p) => formatDate(p.date))
    : [];

  return {
    series: [
      {
        name: '本周',
        data: thisWeekData,
      },
      {
        name: '上周',
        data: prevWeekData,
      },
    ],
    xAxis: ['周六', '周日', '周一', '周二', '周三', '周四', '周五'],
    dates: {
      thisWeek: thisWeekDates,
      prevWeek: prevWeekDates,
    },
    periodInfo: weekStartDate
      ? {
          thisWeekStart: weekStartDate,
          prevWeekStart,
        }
      : undefined,
  };
}

/**
 * 数字格式化（紧凑格式）
 *
 * 用于在图表上显示更紧凑的数值表示：
 * - 123456 -> "12.35万"
 * - 1234 -> "1,234"
 * - 0 -> "0"
 *
 * @param value 待格式化的数值
 * @returns 格式化后的字符串
 */
export function formatNumberCompact(
  value: number | null | undefined
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0';
  }

  if (value >= 10000) {
    const tenThousand = value / 10000;
    return `${
      Number.isInteger(tenThousand)
        ? tenThousand
        : tenThousand.toFixed(2)
    }万`;
  }

  // 使用本地化的千位分隔符
  return value.toLocaleString('zh-CN');
}
