from sqlalchemy import Boolean, Column, Integer, String, Text
from sqlalchemy.orm import declarative_mixin, declared_attr

from app.db.session import Base


@declarative_mixin
class ResourceMixin:
    __abstract__ = True

    id = Column(Integer, primary_key=True)
    model_folder = Column(String, nullable=False, index=True, unique=True)
    preview_image = Column(String, nullable=True)
    debug_passed = Column(Boolean, default=False)
    added = Column(Boolean, default=False)
    raw_yaml = Column(Text, nullable=False)

    @declared_attr.directive
    def __tablename__(cls: type) -> str:  # noqa: N805
        return cls.__name__.lower() + "s"


class Mount(Base, ResourceMixin):
    mount_type = Column(String, nullable=True)
    star_rating = Column(String, nullable=True)
    subtype = Column(String, nullable=True)


class Pet(Base, ResourceMixin):
    rarity = Column(String, nullable=True)


class Npc(Base, ResourceMixin):
    rarity = Column(String, nullable=True)
