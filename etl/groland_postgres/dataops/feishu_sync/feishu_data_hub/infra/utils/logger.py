"""日志模块"""
import logging
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

# 存储已配置的 logger，避免重复添加 handler
_configured_loggers = set()

# Windows 终端 UTF-8 编码支持
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')


def get_logger(
    name: str,
    log_level: Optional[str] = None,
    log_dir: Optional[str] = None
) -> logging.Logger:
    """
    获取配置好的logger实例

    Args:
        name: logger名称
        log_level: 日志级别，默认从环境变量LOG_LEVEL读取，否则为INFO
        log_dir: 日志目录，默认从环境变量LOG_DIR读取，否则为'logs'

    Returns:
        配置好的logger实例
    """
    # 获取配置
    if log_level is None:
        log_level = os.getenv('LOG_LEVEL', 'INFO')
    if log_dir is None:
        log_dir = os.getenv('LOG_DIR', 'logs')

    # 创建日志目录
    log_path = Path(log_dir)
    log_path.mkdir(parents=True, exist_ok=True)

    # 创建日志文件路径
    log_file = log_path / f"{datetime.now().strftime('%Y-%m-%d')}.log"

    # 创建或获取logger
    logger = logging.getLogger(name)

    # 如果logger已经配置过，直接返回
    if name in _configured_loggers:
        return logger

    # 设置日志级别
    logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    # 创建文件处理器
    file_handler = logging.FileHandler(log_file, encoding='utf-8')
    file_handler.setLevel(logging.DEBUG)

    # 创建控制台处理器
    console_handler = logging.StreamHandler()
    console_handler.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    # 创建格式化器
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    file_handler.setFormatter(formatter)
    console_handler.setFormatter(formatter)

    # 添加处理器
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

    # 标记为已配置
    _configured_loggers.add(name)

    # 防止日志传播到根logger
    logger.propagate = False

    return logger


def reset_loggers() -> None:
    """
    重置所有已配置的logger（主要用于测试）
    """
    global _configured_loggers
    for name in _configured_loggers:
        logger = logging.getLogger(name)
        # 移除所有handler
        for handler in logger.handlers[:]:
            handler.close()
            logger.removeHandler(handler)
    _configured_loggers.clear()
