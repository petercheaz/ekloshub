# VBS

Local app for VBS reviews, leftover sharing, setup photos, and messages. Runtime data lives in Docker Postgres and S3 (s3mock).

## Prerequisites

- Node.js 22+
- Docker

## Startup

```bash
cp .env.example .env
npm install
npm run docker:up
npm run dev
```

- App: http://localhost:5173
- API: http://localhost:3000
- Postgres: `127.0.0.1:5432` (`vbs` / `vbs`)
- S3: `http://127.0.0.1:9000`

Sign in with a seeded username such as `admin` or `pcheaz@gmail.com` and the password in `.env` (`AUTH_PASSWORD`, default `vbs-dev`). `pcheaz@gmail.com` is org admin of Cornerstone Seattle.

First boot applies the schema and seeds users, reviews, shares, setups, and messages if the `users` table is empty.

## Other commands

```bash
npm run docker:down   # stop Postgres and S3
npm run build         # typecheck + client build
npm start             # API only (serves `dist/client` if you already built)
```
