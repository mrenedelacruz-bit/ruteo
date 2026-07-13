# Imagen unica de despliegue: compila el frontend y lo sirve desde el
# mismo servicio FastAPI que expone la API (un solo servicio web, sin
# problemas de CORS ni de URLs cruzadas entre frontend y backend).

FROM node:20-slim AS frontend-build
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim AS backend
WORKDIR /app

COPY backend/pyproject.toml ./pyproject.toml
COPY backend/app ./app
COPY backend/alembic ./alembic
COPY backend/alembic.ini ./alembic.ini
RUN pip install --no-cache-dir .

COPY --from=frontend-build /frontend/dist ./static

ENV PORT=8000
EXPOSE 8000

# alembic aplica migraciones (incluye "CREATE EXTENSION postgis" si hace
# falta) y los seeds son idempotentes: no duplican datos en reinicios.
CMD alembic upgrade head \
    && python -m app.seed.seed_fleet \
    && python -m app.seed.seed_users \
    && uvicorn app.main:app --host 0.0.0.0 --port "${PORT}"
