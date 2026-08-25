from pydantic import BaseModel, Field


class LoginMock(BaseModel):
    user_id: int = Field(..., ge=1)


class GoogleLogin(BaseModel):
    credential: str = Field(..., min_length=1)
