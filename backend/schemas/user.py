from pydantic import BaseModel, ConfigDict, Field


class LoginMock(BaseModel):
    user_id: int = Field(..., ge=1)


class GoogleLogin(BaseModel):
    credential: str = Field(..., min_length=1)


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str = Field(..., min_length=1, max_length=100)
