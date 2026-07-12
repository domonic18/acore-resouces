from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    project_root: Path = Path(__file__).resolve().parents[3]
    workspace_dir: Path = project_root / "workspace"
    data_dir: Path = project_root / "data"
    sources_dir: Path = project_root / "sources"
    imports_dir: Path = project_root / "imports"
    assets_dir: Path = project_root / "assets"
    patches_dir: Path = project_root / "patches"

    db_url: str = f"sqlite:///{workspace_dir / 'data' / 'acore_resource.db'}"

    registry_file: Path = data_dir / "registry.json"
    resources_dir: Path = data_dir / "resources"
    schemas_dir: Path = data_dir / "schemas"
    mapping_dir: Path = data_dir / "mapping"

    thumbnails_dir: Path = assets_dir / "thumbnails"
    gltf_dir: Path = assets_dir / "gltf"
    logs_dir: Path = workspace_dir / "logs"


settings = Settings()
