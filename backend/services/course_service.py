from db import get_connection
from domain.errors import ServiceError
from repositories.course_repository import CourseRepository
from repositories.catalog_repository import CatalogRepository

class CourseService:
    DASHBOARD_METRICS=frozenset(CourseRepository.RANKING_COLUMNS)
    def __init__(self,connection_factory=get_connection):
        self.connection_factory=connection_factory
        self.courses=CourseRepository()
    def _read(self,operation,*args,**kwargs):
        conn=self.connection_factory()
        try: return operation(conn,*args,**kwargs)
        finally: conn.close()
    def list_departments(self):
        return {'departments':[d['name'] for d in self._read(CatalogRepository().options)['departments']]}
    def list_tags(self):
        return {'tags':self._read(CatalogRepository().options)['tags']}
    def search(self,search=None,department=None,**kwargs):
        return self._read(self.courses.search,search,department,**kwargs)
    def detail(self,course_id):
        result=self._read(self.courses.get_detail,course_id)
        if result is None: raise ServiceError(404,'ไม่พบรายวิชาที่เปิดเผย')
        return result
    def instructor_profile(self,instructor_id):
        result=self._read(self.courses.get_instructor_profile,instructor_id)
        if not result: raise ServiceError(404,'ไม่พบผู้สอน')
        return dict(instructor=result[0],courses=result[1])
    def reviews(self,course_id,caller_id=None):
        return {'reviews':self._read(self.courses.list_reviews,course_id,caller_id)}
    def rankings(self,metric='reviews',department=None,min_reviews=0,filters=None):
        if metric not in self.DASHBOARD_METRICS: raise ServiceError(400,'Unsupported metric')
        return dict(metric=metric,rankings=self._read(self.courses.rankings,metric,department,min_reviews,filters))
    def dashboard_summary(self,filters=None):
        return {'summary':self._read(self.courses.dashboard_summary,filters)}
