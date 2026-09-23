"""定时同步调度器"""
import os
import time
import schedule
from datetime import datetime

from feishu_data_hub.infra.utils import get_logger, FeishuNotifier
from feishu_data_hub.sync.main import sync_services, print_summary
import argparse

logger = get_logger('调度器')


def run_sync():
    """执行同步任务"""
    logger.info(f"定时任务触发: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    try:
        # 创建空参数（同步所有表）
        args = argparse.Namespace(
            douyin_trade_sale=False,
            douyin_trade_sale_live=False,
            douyin_trade_sale_card=False,
            taobao_trade_sale=False,
            xhs_trade_sale=False,
            taobao_alimama_scenario=False,
            jd_trade_sale=False,
            wx_trade_sale=False,
        )

        # 执行同步
        results, added_details, updated_details = sync_services(args)

        # 输出总结
        print_summary(results)

        # 发送通知
        notifier = FeishuNotifier()
        notifier.notify_sync_result(results, added_details, updated_details)

        logger.info("定时同步任务完成")

    except Exception as e:
        logger.error(f"定时同步任务失败: {e}", exc_info=True)


def main():
    """主函数"""
    # 从环境变量读取定时配置，默认每天 10:00
    sync_time = os.getenv('SYNC_SCHEDULE_TIME', '10:00')

    logger.info('=' * 50)
    logger.info('飞书数据同步调度器启动')
    logger.info(f'定时执行时间: 每天 {sync_time}')
    logger.info('=' * 50)

    # 设置定时任务
    schedule.every().day.at(sync_time).do(run_sync)

    logger.info(f"下次执行时间: {schedule.next_run()}")

    # 保持运行
    while True:
        schedule.run_pending()
        time.sleep(60)  # 每分钟检查一次


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        logger.info("调度器已停止")
