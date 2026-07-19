from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.api import preview, resources

app = FastAPI(title="acore-resouces API", version="0.1.0")

# 本地开发调试：允许任意 localhost 端口的跨域请求
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^http://localhost:\d+$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(resources.router)
app.include_router(preview.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# 生产/容器部署：挂载前端构建产物，并支持 SPA 路由回退
_STATIC_DIR = Path(__file__).resolve().parent / "static"

if _STATIC_DIR.is_dir():

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str) -> FileResponse:
        """优先返回静态文件，否则回退到 index.html。"""
        target = _STATIC_DIR / full_path
        if target.is_file():
            return FileResponse(target)
        return FileResponse(_STATIC_DIR / "index.html")
