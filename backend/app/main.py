from fastapi import FastAPI

from app.api import preview, resources

app = FastAPI(title="acore-resouces API", version="0.1.0")

app.include_router(resources.router)
app.include_router(preview.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
