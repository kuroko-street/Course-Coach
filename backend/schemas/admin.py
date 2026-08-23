from typing import Literal

from pydantic import BaseModel


class AdminAction(BaseModel):
    action: Literal["KEEP", "DELETE"]
