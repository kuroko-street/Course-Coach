from pydantic import BaseModel, ConfigDict, Field


class ReviewCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    course_id: int = Field(..., ge=1)
    content: str = Field(..., min_length=1)
    academic_year: int = Field(..., ge=1900, le=2700)
    semester: str = Field(..., min_length=1, max_length=20)
    section: str = Field(..., min_length=1, max_length=20)
    rating_satisfaction: int = Field(..., ge=1, le=5)
    rating_recommendation: int = Field(..., ge=1, le=5)
    rating_workload: int = Field(..., ge=1, le=5)
    rating_content: int = Field(..., ge=1, le=5)
    rating_teaching: int = Field(..., ge=1, le=5)
    rating_exam: int = Field(..., ge=1, le=5)


class ReviewUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str = Field(..., min_length=1)
    academic_year: int = Field(..., ge=1900, le=2700)
    semester: str = Field(..., min_length=1, max_length=20)
    section: str = Field(..., min_length=1, max_length=20)
    rating_satisfaction: int = Field(..., ge=1, le=5)
    rating_recommendation: int = Field(..., ge=1, le=5)
    rating_workload: int = Field(..., ge=1, le=5)
    rating_content: int = Field(..., ge=1, le=5)
    rating_teaching: int = Field(..., ge=1, le=5)
    rating_exam: int = Field(..., ge=1, le=5)


class CommentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str = Field(..., min_length=1, max_length=2000)
