# ============================================
# acore-resouces 后端容器 Dockerfile
# 纯 FastAPI 后端，不包含前端静态文件
# 用于仅运行 API / CLI / 测试的场景
# ============================================

# --------------------------------------------------
# Stage 1: 后端依赖编译
# --------------------------------------------------
FROM python:3.11-slim-bookworm AS backend-builder

# 安装 uv（通过 PyPI 安装，避免 ghcr.io 网络不稳定导致构建失败）
RUN pip install --no-cache-dir uv

WORKDIR /app

# 复制后端项目文件与本地路径依赖
COPY backend/pyproject.toml backend/uv.lock ./
COPY tools/wow-dbc-tool /tools/wow-dbc-tool

# 创建虚拟环境并安装依赖（含 dev 依赖，便于在容器内跑测试）
RUN uv venv --python 3.11 .venv
RUN uv sync --frozen

# --------------------------------------------------
# Stage 2: 生产镜像
# --------------------------------------------------
FROM python:3.11-slim-bookworm AS production

WORKDIR /app

# 复制虚拟环境
COPY --from=backend-builder /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"

# 复制后端代码
COPY backend/app ./app

# 创建运行时目录
RUN mkdir -p /app/workspace/data /app/workspace/logs /app/workspace/assets /app/workspace/patch-jobs

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
