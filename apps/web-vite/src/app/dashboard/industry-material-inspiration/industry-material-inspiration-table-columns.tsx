import type { ColumnsType } from 'antd/es/table';
import {
  resolveText,
  type IndustryMaterialTableRow,
} from './industry-material-inspiration-client-helpers';
import { AudienceTagCell, SellingPointTagCell } from './industry-material-tag-cells';
import {
  BrandCell,
  ExposureCell,
  NumericCell,
  RankCell,
  TextCell,
  VideoCell,
} from './industry-material-table-cells';

export const TABLE_COLUMNS: ColumnsType<IndustryMaterialTableRow> = [
  {
    title: '排名',
    key: 'rank',
    width: 96,
    align: 'center',
    fixed: 'left',
    render: (_, row) => <RankCell value={row.rank} />,
  },
  {
    title: '品牌',
    key: 'brandName',
    width: 140,
    align: 'center',
    fixed: 'left',
    render: (_, row) => <BrandCell row={row} />,
  },
  {
    title: '视频',
    key: 'assetId',
    width: 640,
    align: 'left',
    fixed: 'left',
    render: (_, row) => <VideoCell row={row} />,
  },
  {
    title: '产品',
    key: 'product',
    width: 180,
    align: 'center',
    render: (_, row) => <TextCell value={resolveText(row.product, row.productName)} />,
  },
  {
    title: '核心人群',
    key: 'audience',
    width: 320,
    align: 'left',
    render: (_, row) => <AudienceTagCell value={resolveText(row.audience)} />,
  },
  {
    title: '营销卖点',
    key: 'sellingPoint',
    width: 400,
    align: 'left',
    render: (_, row) => <SellingPointTagCell value={resolveText(row.sellingPoint)} />,
  },
  {
    title: '曝光',
    key: 'exposure',
    width: 128,
    align: 'center',
    render: (_, row) => <ExposureCell row={row} />,
  },
  {
    title: '完播率',
    key: 'completionRate',
    width: 116,
    align: 'right',
    render: (_, row) => <NumericCell value={row.completionRate} formatter="rate" />,
  },
  {
    title: 'CTR',
    key: 'ctr',
    width: 108,
    align: 'right',
    render: (_, row) => <NumericCell value={row.ctr} formatter="rate" />,
  },
  {
    title: 'CVR',
    key: 'cvr',
    width: 108,
    align: 'right',
    render: (_, row) => <NumericCell value={row.cvr} formatter="rate" />,
  },
  {
    title: '3S播放率',
    key: 'play3sRate',
    width: 120,
    align: 'right',
    render: (_, row) => <NumericCell value={row.play3sRate} formatter="rate" />,
  },
  {
    title: '5S播放率',
    key: 'play5sRate',
    width: 120,
    align: 'right',
    render: (_, row) => <NumericCell value={row.play5sRate} formatter="rate" />,
  },
  {
    title: '互动率',
    key: 'interactionRate',
    width: 116,
    align: 'right',
    render: (_, row) => <NumericCell value={row.interactionRate} formatter="rate" />,
  },
  {
    title: 'PVR',
    key: 'pvr',
    width: 108,
    align: 'right',
    render: (_, row) => <NumericCell value={row.pvr} formatter="rate" />,
  },
];
