from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ReviewUpdate(BaseModel):
    """Year, term and teachers belong to the course, not a second review identity."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    content: str = Field(..., min_length=1, max_length=10000)
    rating_satisfaction: int = Field(..., ge=1, le=5, strict=True)
    rating_recommendation: int = Field(..., ge=1, le=5, strict=True)
    rating_workload: int = Field(..., ge=1, le=5, strict=True)
    rating_content: int = Field(..., ge=1, le=5, strict=True)
    rating_teaching: int = Field(..., ge=1, le=5, strict=True)
    rating_exam: int = Field(..., ge=1, le=5, strict=True)
    tag_ids: list[Annotated[int, Field(ge=1, strict=True)]] = Field(default_factory=list, max_length=16)

    @field_validator("tag_ids")
    @classmethod
    def unique_tags(cls, values):
        if len(values) != len(set(values)):
            raise ValueError("Choose each tag only once.")
        return values


class ReviewCreate(ReviewUpdate):
    course_id: int = Field(..., ge=1, strict=True)


class CommentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    content: str = Field(..., min_length=1, max_length=2000)
