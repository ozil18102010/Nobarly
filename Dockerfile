# Nobarly — image untuk Koyeb (gratis, tanpa kartu kredit).
# Server Express + frontend statis (src/) dalam 1 service.
FROM node:20-alpine

WORKDIR /app

# Deps backend dulu (cache-friendly)
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

# Kode backend + frontend statis (disajikan Express dari ../src)
COPY server ./server
COPY src ./src

# Koyeb memberi PORT via env (server.js pakai process.env.PORT duluan).
EXPOSE 8000
CMD ["node", "server/server.js"]
