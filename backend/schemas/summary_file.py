from pydantic import BaseModel, ConfigDict, Field


class SummaryFileCommentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str = Field(min_length=1, max_length=2000)
