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
    imports_dir: Path = Path("imports")
    assets_dir: Path = Path("assets")
    patches_dir: Path = Path("patches")

    db_url: str = ""

    registry_file: Path = Path("data/registry.json")
    resources_dir: Path = Path("data/resources")
    schemas_dir: Path = Path("data/schemas")
    mapping_dir: Path = Path("data/mapping")

    thumbnails_dir: Path = Path("assets/thumbnails")
    gltf_dir: Path = Path("assets/gltf")
    logs_dir: Path = Path("workspace/logs")

    def model_post_init(self, __context: Any) -> None:
        root = self.project_root
        self.data_dir = root / "data"
        self.workspace_dir = root / "workspace"
        self.sources_dir = root / "sources"
        self.imports_dir = root / "imports"
        self.assets_dir = root / "assets"
        self.patches_dir = root / "patches"

        self.db_url = f"sqlite:///{self.workspace_dir / 'data' / 'acore_resource.db'}"

        self.registry_file = self.data_dir / "registry.json"
        self.resources_dir = self.data_dir / "resources"
        self.schemas_dir = self.data_dir / "schemas"
        self.mapping_dir = self.data_dir / "mapping"

        self.thumbnails_dir = self.assets_dir / "thumbnails"
        self.gltf_dir = self.assets_dir / "gltf"
        self.logs_dir = self.workspace_dir / "logs"


settings = Settings()
