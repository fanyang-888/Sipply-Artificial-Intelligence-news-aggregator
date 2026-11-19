from logging.config import fileConfig

from alembic import context
from dotenv import load_dotenv
from sqlalchemy import create_engine, pool

load_dotenv()

from app.config import settings
from app.db import Base
from app.models import Article, IngestUrlState, Source  # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Tables in the database that no model maps, on purpose. Autogenerate (and
# `alembic check`) would otherwise write a drop for each one and its indexes.
# - drafts: the retired LinkedIn-draft feature; kept for its data, no longer read
#   or written (backend/README.md).
UNMAPPED_TABLES = {"drafts"}


def include_object(obj, name, type_, reflected, compare_to) -> bool:
    if type_ == "table" and reflected and compare_to is None and name in UNMAPPED_TABLES:
        return False
    return True


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url.get_secret_value(),
        target_metadata=target_metadata,
        include_object=include_object,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(
        settings.database_url.get_secret_value(),
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
