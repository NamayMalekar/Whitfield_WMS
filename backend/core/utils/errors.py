"""Domain exceptions mapped to HTTP responses in main.py."""


class WMSError(Exception):
    status_code = 400
    code = "wms_error"

    def __init__(self, message: str, **context):
        super().__init__(message)
        self.message = message
        self.context = context


class NotFoundError(WMSError):
    status_code = 404
    code = "not_found"


class ConflictError(WMSError):
    status_code = 409
    code = "conflict"


class InsufficientStockError(ConflictError):
    code = "insufficient_stock"


class PermissionDeniedError(WMSError):
    status_code = 403
    code = "permission_denied"


class ValidationError(WMSError):
    status_code = 422
    code = "validation_error"
