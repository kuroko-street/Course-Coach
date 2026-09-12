from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Literal


class PlanCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan_name: str = Field(..., min_length=1, max_length=255)

    @field_validator('plan_name',mode='before')
    @classmethod
    def strip_name(cls,value):
        return value.strip() if isinstance(value,str) else value


class PlanUpdate(PlanCreate):
    model_config = ConfigDict(extra="forbid")

    plan_name: str = Field(..., min_length=1, max_length=255)


class PlanItemCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    course_id: int = Field(..., ge=1)
    academic_year: int = Field(..., ge=2500, le=3000)
    semester: Literal['1','2','summer']


class PlanItemMove(BaseModel):
    model_config = ConfigDict(extra="forbid")

    academic_year: int = Field(..., ge=2500, le=3000)
    semester: Literal['1','2','summer']
