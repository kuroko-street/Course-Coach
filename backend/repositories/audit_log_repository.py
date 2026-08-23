from db import dict_cursor


class AuditLogRepository:
    def create(self, conn, user_id, action, target_id, ip_address=None):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO audit_logs (user_id, action, target_id, ip_address)
                VALUES (%s, %s, %s, %s);
                """,
                (user_id, action, target_id, ip_address),
            )

    def list_recent(self, conn, limit):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                SELECT a.log_id, a.timestamp, a.action, a.target_id, a.ip_address,
                       u.username
                FROM audit_logs a
                LEFT JOIN users u ON u.user_id = a.user_id
                ORDER BY a.log_id DESC
                LIMIT %s;
                """,
                (limit,),
            )
            return cur.fetchall()
