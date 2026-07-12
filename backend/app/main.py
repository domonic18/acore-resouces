from fastapi import FastAPI

app = FastAPI(title="acore-resouces API", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
