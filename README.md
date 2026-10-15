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

## Email and SMS

Task, registration, and reimbursement alerts can send **in-app**, **email**, and **SMS**. Users opt in/out per organization on **Profile** (email and SMS are independent).

- Set **email** and **mobile phone** on Profile → *Contact for delivery*.
- Configure `SMTP_*` in `.env` for real email (otherwise the API logs messages to the console).
- Configure `TWILIO_*` for SMS (otherwise logged to the console).
- `APP_PUBLIC_URL` must match your browser origin so links in email/SMS open the right org pages.

## Deploy to AWS

See **[docs/aws-deploy.md](docs/aws-deploy.md)** for RDS, S3, Docker/ECR, and migrating local Postgres + files. The repo includes a production `Dockerfile`; creating resources in your AWS account still requires your credentials and choices (region, domain, App Runner vs ECS).

## Other commands

```bash
npm run docker:down   # stop Postgres and S3
npm run build         # typecheck + client build
npm start             # API only (serves `dist/client` if you already built)
npm run test:e2e:setup # Chromium + sync E2E users from .env
npm run validate       # Full suite + HTML report in e2e-report/ (gitignored) + opens browser
npm run test:e2e       # Same tests without auto-opening the report
```

E2E personas and passwords live in `.env` (`E2E_*`). See `.env.example`. **`E2E_PLAYWRIGHT_HEADLESS=false`** runs headed with one worker so you can watch; headless runs use parallel workers. Run **`/validate`** in chat (skill `.cursor/skills/validate/`) for the self-healing E2E workflow.
```
