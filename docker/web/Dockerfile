# ============================================
# acore-resouces Web 容器 Dockerfile
# 合并前端静态文件 + FastAPI 后端服务
# 用于本地/测试环境一键启动完整应用
# ============================================

# --------------------------------------------------
# Stage 1: 前端构建
# --------------------------------------------------
FROM node:20-alpine AS frontend-builder

ARG VITE_APP_VERSION
ENV VITE_APP_VERSION=${VITE_APP_VERSION}

WORKDIR /app

COPY apps/web/package.json ./
RUN npm install && npm cache clean --force

COPY apps/web ./

# 容器内通过同一域名访问后端，使用相对路径
ENV VITE_API_BASE_URL=""
RUN npm run build

# --------------------------------------------------
# Stage 2: 后端依赖编译
# --------------------------------------------------
FROM python:3.11-slim-bookworm AS backend-builder

# 安装 uv（通过 PyPI 安装，避免 ghcr.io 网络不稳定导致构建失败）
RUN pip install --no-cache-dir uv

WORKDIR /app

# 复制后端项目文件与本地路径依赖
COPY backend/pyproject.toml backend/uv.lock ./
COPY tools/wow-dbc-tool /tools/wow-dbc-tool

# 创建虚拟环境并安装依赖
RUN uv venv --python 3.11 .venv
RUN uv sync --frozen

# --------------------------------------------------
# Stage 3: 生产镜像
# --------------------------------------------------
FROM python:3.11-slim-bookworm AS production

WORKDIR /app

# 复制虚拟环境
COPY --from=backend-builder /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"

# 复制后端代码
COPY backend/app ./app

# 复制前端构建产物到后端 static 目录，由 main.py 挂载
COPY --from=frontend-builder /app/dist ./app/static

# 创建运行时目录
RUN mkdir -p /app/workspace/data /app/workspace/logs /app/workspace/assets /app/workspace/patch-jobs

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
