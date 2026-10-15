# Deploy VBS to AWS

This app runs as **one Node process**: API + static React (`dist/client`). It needs **PostgreSQL**, **S3**, and environment variables. Local dev uses Docker for Postgres and s3mock; production uses **RDS** and **S3**.

## What is in the repo

| Artifact | Purpose |
|----------|---------|
| `Dockerfile` | Production image (`node dist/server.js`) |
| `scripts/aws/export-local-db.sh` | Dump local Docker Postgres |
| `scripts/aws/sync-s3mock-to-aws.sh` | Copy s3mock files to an S3 bucket (optional) |
| `scripts/aws/env.production.example` | Env var template for ECS / App Runner |

## What you must create in AWS (console or CLI)

Peter (or whoever has admin on the account) needs to provision:

1. **RDS PostgreSQL 16** — database name `vbs`, user/password you choose, **not** publicly accessible unless you know why; allow inbound 5432 from the app security group only.
2. **S3 bucket** — private; block public access. App serves uploads via `/files` on your site URL.
3. **IAM role for the app** (ECS task role or App Runner instance role) with `s3:GetObject`, `PutObject`, `DeleteObject`, `ListBucket` on that bucket. Prefer the role over long-lived access keys.
4. **Container host** — pick one:
   - **AWS App Runner** (simplest): connect ECR image, set env vars, auto HTTPS.
   - **ECS Fargate + ALB**: more control, same Docker image.
5. **ECR repository** — store the Docker image (`aws ecr create-repository --repository-name vbs`).
6. **Secrets** — `SESSION_SECRET`, `DATABASE_URL` in Secrets Manager or SSM; reference from the task definition.
7. **DNS** — Route 53 (or registrar) CNAME to App Runner / ALB; **ACM** certificate for HTTPS.
8. **`APP_PUBLIC_URL`** — exact public URL, e.g. `https://vbs.example.org` (required for email/SMS links).

Optional: **Amazon SES** for SMTP (`SMTP_*`), **Twilio** unchanged.

## Build and push the image

```bash
aws ecr get-login-password --region REGION | docker login --username AWS --password-stdin ACCOUNT.dkr.ecr.REGION.amazonaws.com

docker build -t vbs .
docker tag vbs:latest ACCOUNT.dkr.ecr.REGION.amazonaws.com/vbs:latest
docker push ACCOUNT.dkr.ecr.REGION.amazonaws.com/vbs:latest
```

Deploy that image in App Runner or ECS with port **3000**.

## Environment variables (production)

Copy `scripts/aws/env.production.example`. Minimum:

- `NODE_ENV=production`
- `SESSION_SECRET` — long random string (required)
- `DATABASE_URL` — RDS connection string
- `S3_REGION`, `S3_BUCKET` — **omit `S3_ENDPOINT`** for real AWS S3
- `S3_PUBLIC_URL=https://YOUR_DOMAIN/files`
- `APP_PUBLIC_URL=https://YOUR_DOMAIN`

Do **not** commit real secrets. Use IAM role for S3 when possible (omit `S3_ACCESS_KEY` / `S3_SECRET_KEY`).

## Migrate local data

### Database

With local Docker Postgres running:

```bash
./scripts/aws/export-local-db.sh
# Produces backups/vbs-YYYYMMDD-HHMMSS.dump

pg_restore -h YOUR_RDS_HOST -U vbs -d vbs --no-owner --no-acl backups/vbs-....dump
```

(RDS must be reachable from your machine or run restore from a bastion/ECS one-off task.)

### Files (s3mock → S3)

If you have files in local s3mock:

```bash
export AWS_REGION=us-west-2
export S3_BUCKET=your-prod-bucket
./scripts/aws/sync-s3mock-to-aws.sh
```

Requires AWS CLI credentials and [MinIO Client (`mc`)](https://min.io/docs/minio/linux/reference/minio-mc.html) configured for `http://127.0.0.1:9000`, or use `aws s3 sync` after exporting objects manually.

## Smoke test after deploy

1. Open `APP_PUBLIC_URL`, sign in.
2. VBS Plan → upload a receipt or attachment (hits S3 via `/files`).
3. Registration tab loads.
4. Profile → notification settings (email/SMS if configured).

## What to give an agent / teammate to finish deploy

If someone else (or Cursor with AWS CLI) should run the AWS steps, provide **without posting in public chat**:

- AWS account ID and **preferred region**
- Whether you want **App Runner** or **ECS**
- **Domain name** for the app (or “ALB URL only for now”)
- Confirmation that **AWS CLI** is logged in (`aws sts get-caller-identity`) on the machine running commands
- For data migration: OK to run `export-local-db.sh` and restore to new RDS (or “fresh empty DB”)

Never paste production `DATABASE_URL`, `SESSION_SECRET`, or API keys into issues or chat — use Secrets Manager and local `.env` only.
