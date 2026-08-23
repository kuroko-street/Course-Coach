# Course Coach — Sequence Diagram: Search Courses

## Main flow

```mermaid
sequenceDiagram
    autonumber
    actor Student
    participant Home as <<boundary>> Home
    participant ApiClient as <<control>> ApiClient
    participant CourseController as <<control>> CourseController
    participant CourseRepository as <<entity>> CourseRepository
    participant CourseDatabase as <<database>> PostgreSQL

    Student->>Home: Enter keyword / select department or tag
    Home->>Home: Validate and prepare search criteria
    Home->>ApiClient: searchCourses(keyword, department, tag)
    ApiClient->>CourseController: GET /api/courses?search=...&department=...
    CourseController->>CourseController: Normalize search parameters
    CourseController->>CourseRepository: findCourses(criteria)
    CourseRepository->>CourseDatabase: SELECT courses matching code, name, tag, and department
    CourseDatabase-->>CourseRepository: Course records
    CourseRepository-->>CourseController: List<Course>
    CourseController-->>ApiClient: HTTP 200 + course list (JSON)
    ApiClient-->>Home: List<Course>

    alt Courses found
        Home-->>Student: Display matching course cards
    else No course found
        Home-->>Student: Display "No courses found"
    end
```

## Alternative and error flows

```mermaid
sequenceDiagram
    autonumber
    actor Student
    participant Home as <<boundary>> Home
    participant ApiClient as <<control>> ApiClient
    participant CourseController as <<control>> CourseController
    participant CourseDatabase as <<database>> PostgreSQL

    Student->>Home: Enter search criteria
    Home->>ApiClient: searchCourses(criteria)
    ApiClient->>CourseController: GET /api/courses

    alt Valid request
        CourseController->>CourseDatabase: Query courses and tags
        CourseDatabase-->>CourseController: Matching records
        CourseController-->>ApiClient: HTTP 200 + results
        ApiClient-->>Home: Search results
        Home-->>Student: Display results
    else Database or server error
        CourseDatabase--xCourseController: Query failed
        CourseController-->>ApiClient: HTTP 500 + error detail
        ApiClient-->>Home: Throw search error
        Home-->>Student: Display error message
    end
```

## Participant responsibilities

- `Student` — actor who enters a keyword or selects a filter.
- `Home` — boundary class that receives input and displays results.
- `ApiClient` — control class responsible for frontend API communication.
- `CourseController` — control class representing the FastAPI course-search endpoint.
- `CourseRepository` — entity/data-access abstraction for retrieving courses.
- `CourseDatabase` — PostgreSQL database containing courses, tags, and their relationships.

> `CourseRepository` and `CourseController` are conceptual UML classes used to show responsibilities clearly. In the current implementation, their logic is contained in the `list_courses()` endpoint in `backend/main.py`.
