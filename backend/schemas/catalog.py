"""Community course records: year/term and unordered teacher set identify a card."""
import re
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def normalize_text(value):
    return re.sub(r"\s+", " ", value.strip())


class CoursePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    university_id: Literal[1] = 1
    faculty_id: int = Field(gt=0)
    department_id: int = Field(gt=0)
    course_code: str = Field(min_length=1, max_length=30)
    course_name: str = Field(min_length=2, max_length=255)
    credits: Decimal = Field(gt=0, le=30, max_digits=4, decimal_places=1)
    academic_year: int = Field(ge=2500, le=3000)
    semester: Literal["1", "2", "summer"]
    instructor_ids: list[int] = Field(min_length=1, max_length=30)
    syllabus: str | None = Field(default=None, max_length=15000)
    additional_details: str | None = Field(default=None, max_length=15000)

    @field_validator("course_code", "course_name", mode="before")
    @classmethod
    def clean_text(cls, value):
        return normalize_text(value) if isinstance(value, str) else value

    @field_validator("instructor_ids")
    @classmethod
    def teacher_set(cls, value):
        if any(x <= 0 for x in value) or len(set(value)) != len(value):
            raise ValueError("Select each instructor once, using a valid instructor ID.")
        return sorted(value)


class InstructorPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=2, max_length=255)
    affiliation: str | None = Field(default=None, max_length=255)

    @field_validator("name", mode="before")
    @classmethod
    def clean_name(cls, value):
        return normalize_text(value) if isinstance(value, str) else value


class MergePreviewPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    primary_course_id: int = Field(gt=0)
    source_course_ids: list[int] = Field(min_length=1, max_length=20)
    final_course: CoursePayload
    reason: str = Field(min_length=5, max_length=2000)
    keep_plan_item_ids: list[int] = Field(default_factory=list, max_length=10000)
    keep_review_ids: list[int] = Field(default_factory=list, max_length=10000)
    accept_file_overage: bool = False

    @model_validator(mode="after")
    def different_sources(self):
        if self.primary_course_id in self.source_course_ids or len(set(self.source_course_ids)) != len(self.source_course_ids):
            raise ValueError("Primary and source courses must be different, with no repeated IDs.")
        if any(x <= 0 for x in self.source_course_ids):
            raise ValueError("Invalid source course ID.")
        self.source_course_ids.sort()
        if len(set(self.keep_plan_item_ids)) != len(self.keep_plan_item_ids):
            raise ValueError("Plan choices must not repeat.")
        self.keep_plan_item_ids.sort()
        if any(x<=0 for x in self.keep_review_ids) or len(set(self.keep_review_ids))!=len(self.keep_review_ids):
            raise ValueError('Review choices must contain distinct valid IDs.')
        self.keep_review_ids.sort()
        if len(self.reason.strip()) < 5:
            raise ValueError("Please explain why these records represent the same course context.")
        return self


class MergeConfirmPayload(MergePreviewPayload):
    preview_token: str = Field(min_length=20, max_length=5000)
    request_id: UUID
