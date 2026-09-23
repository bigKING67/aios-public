import { Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { GOODS_CARD_TABLE_COLUMN_DEFINITIONS } from './dashboard-metric-definitions';
import type { NumericInput } from './dashboard-formatters';
import { compareNullableNumbers, compareText } from './dashboard-sorters';
import { formatGoodsCardFieldValue } from './dashboard-traffic-model';
import type {
  DashboardGoodsCardRow,
  GoodsCardColumnDefinition,
} from './dashboard-types';

export interface DashboardGoodsCardTableClassNames {
  goodsDataShellHeaderCell: string;
  goodsDataShellBodyCell: string;
  goodsCardHeaderCell: string;
  goodsCardIdentityHeaderCell: string;
  goodsCardActionHeaderCell: string;
  goodsCardBodyCell: string;
  goodsCardProductCell: string;
  goodsCardProductName: string;
  goodsCardTrafficButton: string;
}

function buildGoodsCardHeaderCellProps(classNames: DashboardGoodsCardTableClassNames) {
  return { className: `${classNames.goodsDataShellHeaderCell} ${classNames.goodsCardHeaderCell}` };
}

function buildGoodsCardIdentityHeaderCellProps(classNames: DashboardGoodsCardTableClassNames) {
  return {
    className: `${classNames.goodsDataShellHeaderCell} ${classNames.goodsCardHeaderCell} ${classNames.goodsCardIdentityHeaderCell}`,
  };
}

function buildGoodsCardActionHeaderCellProps(classNames: DashboardGoodsCardTableClassNames) {
  return {
    className: `${classNames.goodsDataShellHeaderCell} ${classNames.goodsCardHeaderCell} ${classNames.goodsCardActionHeaderCell}`,
  };
}

function buildGoodsCardBodyCellProps(classNames: DashboardGoodsCardTableClassNames) {
  return {
    className: `${classNames.goodsDataShellBodyCell} ${classNames.goodsCardBodyCell}`,
  };
}

function renderGoodsCardFieldCell(definition: GoodsCardColumnDefinition, row: DashboardGoodsCardRow) {
  const value = row[definition.key];
  if (definition.format === 'link') {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) {
      return '--';
    }
    return (
      <a href={normalized} target="_blank" rel="noreferrer">
        打开链接
      </a>
    );
  }
  return formatGoodsCardFieldValue(value, definition.format, definition.digits ?? 2);
}

function isNumericGoodsCardColumn(definition: GoodsCardColumnDefinition): boolean {
  return (
    definition.format === 'integer' ||
    definition.format === 'number' ||
    definition.format === 'rate' ||
    definition.format === 'currency'
  );
}

export function buildDashboardGoodsCardColumns({
  isMobile,
  classNames,
  onOpenTraffic,
}: {
  isMobile: boolean;
  classNames: DashboardGoodsCardTableClassNames;
  onOpenTraffic: (row: DashboardGoodsCardRow) => void;
}): ColumnsType<DashboardGoodsCardRow> {
  const headerCellProps = () => buildGoodsCardHeaderCellProps(classNames);
  const identityHeaderCellProps = () => buildGoodsCardIdentityHeaderCellProps(classNames);
  const actionHeaderCellProps = () => buildGoodsCardActionHeaderCellProps(classNames);
  const bodyCellProps = () => buildGoodsCardBodyCellProps(classNames);

  const productInfoColumn: ColumnsType<DashboardGoodsCardRow>[number] = {
    title: '商品信息',
    key: 'goods_card_product',
    width: isMobile ? 300 : 380,
    fixed: isMobile ? undefined : 'left',
    align: 'center',
    onHeaderCell: identityHeaderCellProps,
    onCell: bodyCellProps,
    sorter: (left, right) => compareText(left.product_title || '', right.product_title || ''),
    render: (_value, row) => {
      const productTitle = row.product_title?.trim() || '(未命名商品)';
      return (
        <div className={classNames.goodsCardProductCell}>
          <span className={classNames.goodsCardProductName} title={productTitle}>
            {productTitle}
          </span>
        </div>
      );
    },
  };

  const fieldColumns: ColumnsType<DashboardGoodsCardRow> = GOODS_CARD_TABLE_COLUMN_DEFINITIONS.map(
    (definition, index) => ({
      title: definition.title,
      dataIndex: definition.key,
      key: definition.key,
      width: isMobile ? Math.min(Math.max(definition.width, 112), 260) : definition.width,
      align: isNumericGoodsCardColumn(definition) ? (isMobile ? 'left' : 'right') : 'center',
      ellipsis: definition.format === 'text',
      onHeaderCell: index < 3 ? identityHeaderCellProps : headerCellProps,
      onCell: bodyCellProps,
      sorter: (left, right) => {
        if (isNumericGoodsCardColumn(definition)) {
          return compareNullableNumbers(left[definition.key] as NumericInput, right[definition.key] as NumericInput);
        }
        return compareText(
          left[definition.key] === null || left[definition.key] === undefined ? '' : String(left[definition.key]),
          right[definition.key] === null || right[definition.key] === undefined ? '' : String(right[definition.key])
        );
      },
      render: (_value, row) => renderGoodsCardFieldCell(definition, row),
    })
  );

  const actionColumn: ColumnsType<DashboardGoodsCardRow>[number] = {
    title: '操作',
    key: 'action',
    width: 132,
    fixed: isMobile ? undefined : 'right',
    align: 'center',
    onHeaderCell: actionHeaderCellProps,
    onCell: bodyCellProps,
    render: (_value, row) => (
      <Button
        type="link"
        size="small"
        className={classNames.goodsCardTrafficButton}
        onClick={() => onOpenTraffic(row)}
      >
        查看流量来源
      </Button>
    ),
  };

  return [productInfoColumn, ...fieldColumns, actionColumn];
}
