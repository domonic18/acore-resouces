# ============================================
# acore-resouces 后端容器 Dockerfile
# 纯 FastAPI 后端，不包含前端静态文件
# 用于仅运行 API / CLI / 测试的场景
# ============================================

# --------------------------------------------------
# Stage 1: 后端依赖编译
# --------------------------------------------------
FROM python:3.11-slim-bookworm AS backend-builder

WORKDIR /app

COPY backend/pyproject.toml ./
RUN pip install --no-cache-dir -e ".[dev]"

# --------------------------------------------------
# Stage 2: 生产镜像
# --------------------------------------------------
FROM python:3.11-slim-bookworm AS production

WORKDIR /app

COPY --from=backend-builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=backend-builder /usr/local/bin /usr/local/bin

COPY backend/app ./app

RUN mkdir -p /app/workspace/data /app/workspace/logs /app/workspace/assets /app/workspace/patch-jobs

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
