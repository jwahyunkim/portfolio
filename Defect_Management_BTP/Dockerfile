# 1) Build stage
FROM node:20-alpine AS build
WORKDIR /app

# Install deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# App source
COPY . .

# ---- Build-time parameters ----
# 최종 배포 베이스 경로
ARG APP_BASE=/defectmanagement
# --------------------------------

# 유효성 검사
RUN node -e "const b=process.env.APP_BASE||'/'; if(!b.startsWith('/')){process.exit(1)}"

# 타입 체크
RUN npm run typecheck

# Vite 빌드 (끝 슬래시 보정)
RUN npx vite build --base=/

# 2) Runtime stage: node + serve (nginx 제거)
FROM node:20-alpine AS runtime
WORKDIR /app

# 정적 아티팩트 복사
COPY --from=build /app/dist /app/dist

# 가벼운 정적 서버 설치 (serve 사용)
RUN npm install -g serve

EXPOSE 80

# 컨테이너 시작 명령: /app/dist를 80 포트에서 서빙
CMD ["serve", "-s", "/app/dist", "-l", "80"]
