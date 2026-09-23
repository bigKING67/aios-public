"""飞书同步 CLI 入口（仅保留 sync 能力）"""
import argparse
import sys


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog='feishu-data-hub',
        description='飞书数据同步工具（PostgreSQL -> 飞书多维表）',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  feishu-data-hub sync                          # 同步所有表
  feishu-data-hub sync --douyin-trade-sale      # 只同步指定表
  feishu-data-hub sync --scheduler              # 启动定时调度器
        """,
    )
    subparsers = parser.add_subparsers(dest='command', help='可用命令')

    sync_parser = subparsers.add_parser('sync', help='数据同步')
    sync_parser.add_argument('--douyin-trade-sale', action='store_true', help='同步抖音全店成交明细表')
    sync_parser.add_argument('--douyin-trade-sale-live', action='store_true', help='同步抖音全店成交直播明细表')
    sync_parser.add_argument('--douyin-trade-sale-card', action='store_true', help='同步抖音商品卡成交明细表')
    sync_parser.add_argument('--taobao-trade-sale', action='store_true', help='同步天猫全店交易数据表')
    sync_parser.add_argument('--xhs-trade-sale', action='store_true', help='同步小红书店铺交易数据表')
    sync_parser.add_argument('--taobao-alimama-scenario', action='store_true', help='同步淘宝阿里妈妈场景营销数据表')
    sync_parser.add_argument('--jd-trade-sale', action='store_true', help='同步京东店铺成交数据表')
    sync_parser.add_argument('--wx-trade-sale', action='store_true', help='同步微信小程序店铺成交数据表')
    sync_parser.add_argument('--scheduler', action='store_true', help='启动定时调度器')
    return parser


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()

    if args.command != 'sync':
        parser.print_help()
        return 0

    if args.scheduler:
        from feishu_data_hub.sync.scheduler import main as scheduler_main
        scheduler_main()
        return 0

    from feishu_data_hub.sync.main import main as sync_main

    sync_args = ['sync']
    if args.douyin_trade_sale:
        sync_args.append('--douyin-trade-sale')
    if args.douyin_trade_sale_live:
        sync_args.append('--douyin-trade-sale-live')
    if args.douyin_trade_sale_card:
        sync_args.append('--douyin-trade-sale-card')
    if args.taobao_trade_sale:
        sync_args.append('--taobao-trade-sale')
    if args.xhs_trade_sale:
        sync_args.append('--xhs-trade-sale')
    if args.taobao_alimama_scenario:
        sync_args.append('--taobao-alimama-scenario')
    if args.jd_trade_sale:
        sync_args.append('--jd-trade-sale')
    if args.wx_trade_sale:
        sync_args.append('--wx-trade-sale')
    sys.argv = sync_args
    return sync_main()


if __name__ == '__main__':
    sys.exit(main())
