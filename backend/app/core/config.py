from __future__ import annotations

from pathlib import Path
from typing import Any

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    project_root: Path = Path(__file__).resolve().parents[3]
    data_dir: Path = Path("data")
    workspace_dir: Path = Path("workspace")
    sources_dir: Path = Path("sources")
    assets_dir: Path = Path("workspace/assets")
    patch_jobs_dir: Path = Path("workspace/patch-jobs")

    db_url: str = ""

    registry_file: Path = Path("data/registry.json")
    resources_dir: Path = Path("data/resources")
    schemas_dir: Path = Path("data/schemas")

    thumbnails_dir: Path = Path("workspace/assets/thumbnails")
    gltf_dir: Path = Path("workspace/assets/gltf")
    logs_dir: Path = Path("workspace/logs")

    acore_sql_updates_dir: Path | None = None
    acore_sql_mounts_subdir: Path = Path("mounts")

    # 仓库内指向 AzerothCore updates 目录的软链接及其坐骑子目录。
    sql_updates_link_dir: Path = Path("data/sql/azerothcore-updates")
    sql_mounts_dir: Path = Path("data/sql/azerothcore-updates/mounts")

    # 测试服部署仓库（提供 acore-update-db.sh 与数据库连接串）。
    acore_deploy_dir: Path = Path("~/Workspace/acore-deploy")
    acore_mysql_container: str = "acore-mysql"
    acore_world_database: str = "acore_world"

    # 容器部署时宿主侧的项目根（如 /Users/xxx/acore-resouces）。
    # 设置后对外展示的磁盘路径由 /app 前缀映射回宿主真实路径，便于复制/前往。
    host_project_root: str = ""

    # 鉴权：本系统自建账号（SQLite user 表 + bcrypt），资源系统是账号中心，
    # 分发站（acore-patch-distro）通过 /api/auth/verify 委托验证。
    # auth_jwt_secret 必须通过 .env 提供，缺失时登录接口返回配置错误提示，
    # 绝不回退到硬编码默认值；auth_bootstrap_admin_password 仅在用户表为空的
    # 首次启动时用于创建初始 admin 账号；auth_delegation_key 为空时 verify
    # 端点整体禁用。
    auth_jwt_secret: str = ""
    auth_jwt_expire_hours: int = 8
    auth_bootstrap_admin_password: str = ""
    auth_delegation_key: str = ""

    def model_post_init(self, __context: Any) -> None:
        root = self.project_root
        self.data_dir = root / "data"
        self.workspace_dir = root / "workspace"
        self.sources_dir = root / "sources"
        self.assets_dir = self.workspace_dir / "assets"
        self.patch_jobs_dir = root / "workspace" / "patch-jobs"

        self.db_url = f"sqlite:///{self.workspace_dir / 'data' / 'acore_resource.db'}"

        self.registry_file = self.data_dir / "registry.json"
        self.resources_dir = self.data_dir / "resources"
        self.schemas_dir = self.data_dir / "schemas"

        self.thumbnails_dir = self.assets_dir / "thumbnails"
        self.gltf_dir = self.assets_dir / "gltf"
        self.logs_dir = self.workspace_dir / "logs"

        if self.acore_sql_updates_dir is not None:
            self.acore_sql_updates_dir = root / self.acore_sql_updates_dir

        self.sql_updates_link_dir = self.data_dir / "sql" / "azerothcore-updates"
        self.sql_mounts_dir = self.sql_updates_link_dir / self.acore_sql_mounts_subdir
        self.acore_deploy_dir = self.acore_deploy_dir.expanduser()


settings = Settings()
