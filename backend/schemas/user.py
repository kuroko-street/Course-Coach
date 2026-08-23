from pydantic import BaseModel, Field


class LoginMock(BaseModel):
    user_id: int = Field(..., ge=1)
