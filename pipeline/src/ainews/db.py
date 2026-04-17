import psycopg
from pgvector.psycopg import register_vector
from .config import settings


def get_connection() -> psycopg.Connection:
    conn = psycopg.connect(
        host=settings.database_host,
        port=settings.database_port,
        dbname=settings.database_name,
        user=settings.database_user,
        password=settings.database_password,
        sslmode="require",
    )
    register_vector(conn)
    return conn
