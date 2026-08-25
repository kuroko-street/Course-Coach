from typing import Literal

from pydantic import BaseModel, Field


class AdminAction(BaseModel):
    action: Literal["KEEP", "DELETE"]


class CurriculumCreate(BaseModel):
    curriculum_name: str = Field(min_length=2, max_length=255)
    academic_year: int = Field(ge=2500, le=3000)
    department: str = Field(min_length=2, max_length=255)
    degree_level: str = Field(default="ปริญญาตรี", min_length=2, max_length=100)


class InstructorCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)


class CurriculumMapping(BaseModel):
    curriculum_id: int = Field(gt=0)
    recommended_year: int = Field(ge=1, le=8)
    recommended_semester: str = Field(min_length=1, max_length=20)
    requirement_type: Literal["REQUIRED", "ELECTIVE"] = "REQUIRED"


class CourseManagePayload(BaseModel):
    course_code: str = Field(min_length=2, max_length=20)
    course_name: str = Field(min_length=2, max_length=255)
    department: str = Field(min_length=2, max_length=255)
    prerequisites: str | None = None
    syllabus: str | None = None
    teaching_format: str | None = None
    workload: str | None = None
    assessment: str | None = None
    curriculum_mappings: list[CurriculumMapping] = []
    tag_names: list[str] = Field(default_factory=list, max_length=20)
    instructor_names: list[str] = Field(default_factory=list, max_length=20)


class CourseStatus(BaseModel):
    is_active: bool


class CourseImportRow(BaseModel):
    row_number: int = Field(ge=2)
    course_code: str = Field(min_length=2, max_length=20)
    course_name: str = Field(min_length=2, max_length=255)
    department: str = Field(min_length=2, max_length=255)
    curriculum_name: str = Field(min_length=2, max_length=255)
    curriculum_year: int = Field(ge=2500, le=3000)
    recommended_year: int = Field(ge=1, le=8)
    recommended_semester: str = Field(min_length=1, max_length=20)
    requirement_type: Literal["REQUIRED", "ELECTIVE"] = "REQUIRED"
    prerequisites: str | None = None
    syllabus: str | None = None


class CourseImportRequest(BaseModel):
    rows: list[CourseImportRow] = Field(min_length=1, max_length=500)


class StudentEnrollmentImportRow(BaseModel):
    row_number: int = Field(ge=2)
    student_name: str | None = Field(default=None, max_length=100)
    student_number: str = Field(pattern=r"^\d{8}$")
    email: str = Field(pattern=r"^[^@\s]+@kmitl\.ac\.th$", max_length=255)
    course_code: str = Field(min_length=2, max_length=20)
    academic_year: int = Field(ge=2500, le=3000)
    semester: str = Field(min_length=1, max_length=20)
    section: str = Field(min_length=1, max_length=20)


class StudentEnrollmentImportRequest(BaseModel):
    rows: list[StudentEnrollmentImportRow] = Field(min_length=1, max_length=2000)
