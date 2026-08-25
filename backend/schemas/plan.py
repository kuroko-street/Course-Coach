from pydantic import BaseModel, ConfigDict, Field


class PlanCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan_name: str = Field(..., min_length=1, max_length=255)


class PlanUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan_name: str = Field(..., min_length=1, max_length=255)


class PlanItemCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    course_id: int = Field(..., ge=1)
    academic_year: int = Field(..., ge=1900, le=2700)
    semester: str = Field(..., min_length=1, max_length=20)


class PlanItemMove(BaseModel):
    model_config = ConfigDict(extra="forbid")

    academic_year: int = Field(..., ge=1900, le=2700)
    semester: str = Field(..., min_length=1, max_length=20)
