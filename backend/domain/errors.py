class ServiceError(Exception):
    """Expected business/application error independent from FastAPI."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail
