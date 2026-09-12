import re
from db import dict_cursor
from domain.errors import ServiceError
from repositories.review_repository import REVIEW_FIELDS

ASPECTS = ('satisfaction','recommendation','workload','content','teaching','exam')

# Each lateral aggregate produces ONE row per course: teachers and tags cannot
# multiply reviews/likes. The search vector is computed per query, not persisted.
COURSE_ROWS = """
 SELECT c.*,f.name AS faculty_name,u.name AS university_name,
 COALESCE(i.instructors,'[]'::json) AS instructors,COALESCE(i.names,'') AS instructor_names,
 COALESCE(t.tags,'[]'::json) AS tags,COALESCE(t.names,'') AS tag_names,
 COALESCE(a.names,'') AS aliases,
 rs.*,COALESCE(ls.total_likes,0) AS total_likes,COALESCE(cs.total_comments,0) AS total_comments
 FROM courses c JOIN faculties f USING(faculty_id) JOIN universities u ON u.university_id=c.university_id
 LEFT JOIN LATERAL (SELECT json_agg(json_build_object('instructor_id',i.instructor_id,'name',i.name,'affiliation',i.affiliation) ORDER BY i.name,i.instructor_id) AS instructors,string_agg(i.name,' ') AS names
 FROM course_instructors ci JOIN instructors i USING(instructor_id) WHERE ci.course_id=c.course_id) i ON TRUE
 LEFT JOIN LATERAL (SELECT json_agg(x ORDER BY x.review_count DESC,x.tag_id) AS tags,string_agg(x.tag_name,' ') AS names FROM
 (SELECT t.tag_id,t.tag_name,COUNT(*) AS review_count FROM reviews r JOIN review_tags rt USING(review_id) JOIN tags t USING(tag_id) WHERE r.course_id=c.course_id AND r.status='ACTIVE' GROUP BY t.tag_id,t.tag_name) x) t ON TRUE
 LEFT JOIN LATERAL (SELECT string_agg(course_code || ' ' || course_name,' ') AS names FROM course_aliases WHERE canonical_course_id=c.course_id) a ON TRUE
 CROSS JOIN LATERAL (SELECT COUNT(*) AS review_count,COUNT(DISTINCT reviewer_id) AS reviewer_count,
 """ + ','.join(f'ROUND(AVG(rating_{a}),2) AS avg_{a}' for a in ASPECTS) + """
 FROM reviews r WHERE r.course_id=c.course_id AND r.status='ACTIVE') rs
 LEFT JOIN LATERAL (SELECT COUNT(*) AS total_likes FROM review_likes l JOIN reviews r USING(review_id) WHERE r.course_id=c.course_id AND r.status='ACTIVE') ls ON TRUE
 LEFT JOIN LATERAL (SELECT COUNT(*) AS total_comments FROM review_comments rc JOIN reviews r USING(review_id) WHERE r.course_id=c.course_id AND r.status='ACTIVE' AND rc.status='ACTIVE') cs ON TRUE
"""


class CourseRepository:
    RANKING_COLUMNS = {'reviews':'review_count','likes':'total_likes',**{a:f'avg_{a}' for a in ASPECTS}}
    _ADVANCED_QUERY = re.compile(r'(^|\s)(OR\b|-) |"', re.IGNORECASE | re.VERBOSE)

    @classmethod
    def _plain_terms(cls, query):
        return [] if not query or cls._ADVANCED_QUERY.search(query) else re.findall(r'[^\W_]+',query.casefold(),re.UNICODE)

    @staticmethod
    def filters(filters=None, admin=False):
        filters = filters or {}
        clauses=['c.university_id=1','c.merged_into_course_id IS NULL']
        if not admin: clauses.append('c.is_active')
        params=[]
        for key in ('faculty_id','department_id','academic_year','semester','department'):
            if filters.get(key) not in (None,''):
                clauses.append(f'c.{key}=%s'); params.append(filters[key])
        if filters.get('code'):
            clauses.append('c.code_normalized=%s'); params.append(filters['code'].strip().casefold())
        if filters.get('instructor_ids'):
            clauses.append('EXISTS(SELECT 1 FROM course_instructors ci WHERE ci.course_id=c.course_id AND ci.instructor_id=ANY(%s))'); params.append(filters['instructor_ids'])
        for tag in filters.get('tag_ids') or []:
            clauses.append("EXISTS(SELECT 1 FROM reviews r JOIN review_tags rt USING(review_id) WHERE r.course_id=c.course_id AND r.status='ACTIVE' AND rt.tag_id=%s)"); params.append(tag)
        return ' AND '.join(clauses),params

    def search(self,conn,search=None,department=None,filters=None,page=1,page_size=20,admin=False):
        filters=dict(filters or {})
        if department: filters['department']=department
        where,params=self.filters(filters,admin)
        query=(search or '').strip()[:300]
        terms=self._plain_terms(query)
        prefix=' & '.join(f'{t}:*' for t in terms)
        sql="WITH base AS ("+COURSE_ROWS+" WHERE "+where+"""), docs AS (
          SELECT b.*,concat_ws(' ',course_code,course_name,instructor_names,tag_names,department,aliases) AS search_text,
          setweight(to_tsvector('simple',course_code || ' ' || course_name || ' ' || instructor_names),'A') ||
          setweight(to_tsvector('simple',tag_names || ' ' || aliases),'B') || setweight(to_tsvector('simple',department),'C') AS search_document FROM base b
        ), q AS (SELECT %s::text AS raw,websearch_to_tsquery('simple',%s) AS web,
        CASE WHEN %s='' THEN NULL ELSE to_tsquery('simple',%s) END AS prefix,%s::text[] AS terms), matches AS (
        SELECT c.*,CASE WHEN lower(course_code)=lower(q.raw) AND q.raw<>'' THEN 100
          WHEN lower(course_name)=lower(q.raw) AND q.raw<>'' THEN 90
          WHEN EXISTS(SELECT 1 FROM json_array_elements(c.tags) t WHERE lower(t->>'tag_name')=lower(q.raw)) THEN 80
          WHEN EXISTS(SELECT 1 FROM json_array_elements(c.instructors) i WHERE lower(i->>'name')=lower(q.raw)) THEN 70
          WHEN q.raw<>'' AND lower(course_code) LIKE lower(q.raw)||'%%' THEN 60 ELSE 0 END
          + ts_rank_cd(search_document,q.web)*30
          + COALESCE(ts_rank_cd(search_document,q.prefix),0)*20
          + CASE WHEN q.raw<>'' THEN word_similarity(lower(q.raw),lower(search_text))*10 ELSE 0 END
          + CASE WHEN cardinality(q.terms)>0 AND NOT EXISTS(SELECT 1 FROM unnest(q.terms) term WHERE position(term in lower(search_text))=0) THEN 5 ELSE 0 END AS relevance
        FROM docs c CROSS JOIN q WHERE q.raw='' OR search_document@@q.web OR search_document@@q.prefix
        OR (cardinality(q.terms)>0 AND NOT EXISTS(SELECT 1 FROM unnest(q.terms) term WHERE position(term in lower(search_text))=0))
        OR (cardinality(q.terms)>0 AND word_similarity(lower(q.raw),lower(search_text))>=0.55))
        """
        params += [query,query,prefix,prefix,terms]
        with dict_cursor(conn) as cur:
            cur.execute(sql+' SELECT COUNT(*) AS total FROM matches',params); total=cur.fetchone()['total']
            cur.execute(sql+' SELECT * FROM matches ORDER BY relevance DESC,review_count DESC,course_code,academic_year DESC,semester,course_id LIMIT %s OFFSET %s',[*params,page_size,(page-1)*page_size])
            rows=cur.fetchall()
        return dict(courses=rows,total=total,page=page,page_size=page_size)

    def get_detail(self,conn,course_id):
        with dict_cursor(conn) as cur:
            cur.execute('SELECT course_id,merged_into_course_id FROM courses WHERE course_id=%s',(course_id,)); original=cur.fetchone()
            if original is None: return None
            visited=set()
            while original['merged_into_course_id']:
                if original['course_id'] in visited: raise ServiceError(409,'Course redirect cycle')
                visited.add(original['course_id'])
                cur.execute('SELECT course_id,merged_into_course_id FROM courses WHERE course_id=%s',(original['merged_into_course_id'],)); original=cur.fetchone()
            cur.execute(COURSE_ROWS+' WHERE c.course_id=%s AND c.is_active AND c.merged_into_course_id IS NULL',(original['course_id'],))
            row=cur.fetchone()
        if row:
            row['averages']={key:row[key] for key in ['review_count',*(f'avg_{a}' for a in ASPECTS)]}
            row['redirected_from']=course_id if course_id!=row['course_id'] else None
        return row

    def list_reviews(self,conn,course_id,caller_id=None):
        course=self.get_detail(conn,course_id)
        if not course: raise ServiceError(404,'Course not found')
        with dict_cursor(conn) as cur:
            cur.execute(f"""SELECT {REVIEW_FIELDS},COALESCE(NULLIF(u.display_name,''),u.username) AS reviewer_name,u.avatar_url AS reviewer_avatar,
            (SELECT COUNT(*) FROM review_likes l WHERE l.review_id=r.review_id) AS like_count,
            (SELECT COUNT(*) FROM review_comments rc WHERE rc.review_id=r.review_id AND rc.status='ACTIVE') AS comment_count,
            EXISTS(SELECT 1 FROM review_likes l WHERE l.review_id=r.review_id AND l.user_id=%s) AS liked_by_me,
            EXISTS(SELECT 1 FROM review_reports rp WHERE rp.review_id=r.review_id AND rp.reporter_id=%s) AS reported_by_me,
            COALESCE((SELECT json_agg(t ORDER BY t.tag_id) FROM review_tags rt JOIN tags t USING(tag_id) WHERE rt.review_id=r.review_id),'[]'::json) AS tags
            FROM reviews r JOIN users u ON u.user_id=r.reviewer_id WHERE r.course_id=%s AND r.status='ACTIVE' ORDER BY r.created_at DESC,r.review_id DESC""",(caller_id,caller_id,course['course_id']))
            return cur.fetchall()

    def get_instructor_profile(self,conn,instructor_id):
        with dict_cursor(conn) as cur:
            cur.execute('SELECT instructor_id,name,affiliation,bio FROM instructors WHERE instructor_id=%s',(instructor_id,)); instructor=cur.fetchone()
            if not instructor: return None
            cur.execute(COURSE_ROWS+" WHERE c.is_active AND c.merged_into_course_id IS NULL AND EXISTS(SELECT 1 FROM course_instructors ci WHERE ci.course_id=c.course_id AND ci.instructor_id=%s) ORDER BY c.academic_year DESC,c.course_id",(instructor_id,))
            return instructor,cur.fetchall()

    def rankings(self,conn,metric='reviews',department=None,min_reviews=0,filters=None):
        filters=dict(filters or {})
        if department: filters['department']=department
        where,params=self.filters(filters)
        column=self.RANKING_COLUMNS[metric]
        with dict_cursor(conn) as cur:
            cur.execute('WITH ranked AS ('+COURSE_ROWS+' WHERE '+where+') SELECT *, '+column+' AS metric_value FROM ranked WHERE review_count>=%s ORDER BY '+column+' DESC NULLS LAST,review_count DESC,avg_satisfaction DESC NULLS LAST,course_code,course_id LIMIT 100',[*params,min_reviews])
            return cur.fetchall()

    def dashboard_summary(self,conn,filters=None):
        where,params=self.filters(filters)
        with dict_cursor(conn) as cur:
            cur.execute('WITH chosen AS (SELECT c.course_id FROM courses c WHERE '+where+"""), active AS (SELECT r.* FROM reviews r JOIN chosen USING(course_id) WHERE status='ACTIVE')
            SELECT (SELECT COUNT(*) FROM chosen) AS course_count,COUNT(*) AS review_count,COUNT(DISTINCT reviewer_id) AS reviewer_count,
            ROUND(AVG(rating_satisfaction),2) AS avg_satisfaction,
            (SELECT COUNT(*) FROM review_likes l JOIN active a USING(review_id)) AS total_likes,
            (SELECT COUNT(*) FROM review_comments rc JOIN active a USING(review_id) WHERE rc.status='ACTIVE') AS total_comments FROM active""",params)
            return cur.fetchone()
