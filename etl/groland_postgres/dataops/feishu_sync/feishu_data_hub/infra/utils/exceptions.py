"""自定义异常类"""


class SyncException(Exception):
    """同步服务基础异常类"""
    pass


class FeishuAPIException(SyncException):
    """飞书API异常"""
    def __init__(self, message: str, code: int = None, response_data: dict = None):
        super().__init__(message)
        self.code = code
        self.response_data = response_data


class DatabaseException(SyncException):
    """数据库异常"""
    pass


class ConfigException(SyncException):
    """配置异常"""
    pass


class DataValidationException(SyncException):
    """数据验证异常"""
    pass
