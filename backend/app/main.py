from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import preview, resources

app = FastAPI(title="acore-resouces API", version="0.1.0")

# 本地桌面应用与前端开发服务器需要跨域访问 API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(resources.router)
app.include_router(preview.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
