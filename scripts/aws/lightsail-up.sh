#!/usr/bin/env bash
# Create the $12 Lightsail demo (us-west-2) and deploy Docker.
# Requires: AWS CLI logged in as the account owner, account ACTIVE, Paid plan
# (Lightsail is not on the Free plan; $200 credits still cover this instance).
set -euo pipefail

REGION="${AWS_REGION:-us-west-2}"
INSTANCE_NAME="${INSTANCE_NAME:-vbs-demo}"
KEY_NAME="${KEY_NAME:-vbs-demo-key}"
STATIC_IP_NAME="${STATIC_IP_NAME:-vbs-demo-ip}"
BUNDLE_ID="${BUNDLE_ID:-small_3_0}"
BLUEPRINT_ID="${BLUEPRINT_ID:-ubuntu_24_04}"
AZ="${AZ:-us-west-2a}"
KEY_FILE="${KEY_FILE:-$HOME/.ssh/${KEY_NAME}.pem}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE_DIR="$ROOT/deploy/lightsail"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

export AWS_DEFAULT_REGION="$REGION"

state="$(aws account get-account-information --query AccountState --output text 2>/dev/null || echo UNKNOWN)"
if [[ "$state" != "ACTIVE" ]]; then
  echo "AWS account $ACCOUNT_ID is $state, not ACTIVE." >&2
  echo "1. Finish phone + payment: https://console.aws.amazon.com/" >&2
  echo "2. Upgrade to Paid (needed for Lightsail; credits still apply): https://settings.aws.com" >&2
  echo "3. Set a spend limit of \$15/month, then re-run this script." >&2
  exit 1
fi

if ! aws lightsail get-bundles --query "bundles[?bundleId=='$BUNDLE_ID'].price" --output text | grep -q .; then
  echo "Lightsail is not available on this account yet (Free plan or still activating)." >&2
  echo "Upgrade to Paid at https://settings.aws.com — keep credits; set spend limit \$15." >&2
  exit 1
fi

price="$(aws lightsail get-bundles --query "bundles[?bundleId=='$BUNDLE_ID'].price" --output text)"
if [[ "$price" != "12.0" && "$price" != "12" ]]; then
  echo "Bundle $BUNDLE_ID price is $price, expected 12. Refusing to create it." >&2
  exit 1
fi

if ! aws lightsail get-key-pair --key-pair-name "$KEY_NAME" >/dev/null 2>&1; then
  mkdir -p "$(dirname "$KEY_FILE")"
  raw="$(aws lightsail create-key-pair --key-pair-name "$KEY_NAME" --query privateKeyBase64 --output text)"
  if [[ "$raw" == -----BEGIN* ]]; then
    printf '%s\n' "$raw" > "$KEY_FILE"
  else
    printf '%s\n' "$raw" | base64 --decode > "$KEY_FILE"
  fi
  chmod 600 "$KEY_FILE"
  echo "Wrote SSH key $KEY_FILE"
elif [[ ! -f "$KEY_FILE" ]]; then
  echo "Lightsail key $KEY_NAME exists, but $KEY_FILE is missing. Delete the key pair in Lightsail and re-run." >&2
  exit 1
fi

if ! aws lightsail get-instance --instance-name "$INSTANCE_NAME" >/dev/null 2>&1; then
  aws lightsail create-instances \
    --instance-names "$INSTANCE_NAME" \
    --availability-zone "$AZ" \
    --blueprint-id "$BLUEPRINT_ID" \
    --bundle-id "$BUNDLE_ID" \
    --key-pair-name "$KEY_NAME" \
    --ip-address-type dualstack \
    --user-data "$(cat "$COMPOSE_DIR/user-data.sh")"
  echo "Creating instance $INSTANCE_NAME ($BUNDLE_ID, \$${price}/mo)..."
fi

for _ in $(seq 1 60); do
  istate="$(aws lightsail get-instance-state --instance-name "$INSTANCE_NAME" --query state.name --output text)"
  if [[ "$istate" == "running" ]]; then
    break
  fi
  sleep 5
done

if [[ "${istate:-}" != "running" ]]; then
  echo "Instance did not reach running (state=${istate:-unknown})." >&2
  exit 1
fi

aws lightsail put-instance-public-ports --instance-name "$INSTANCE_NAME" --port-infos \
  'fromPort=22,toPort=22,protocol=tcp,cidrs=["0.0.0.0/0"],ipv6Cidrs=["::/0"]' \
  'fromPort=80,toPort=80,protocol=tcp,cidrs=["0.0.0.0/0"],ipv6Cidrs=["::/0"]' \
  'fromPort=443,toPort=443,protocol=tcp,cidrs=["0.0.0.0/0"],ipv6Cidrs=["::/0"]' \
  >/dev/null

if ! aws lightsail get-static-ip --static-ip-name "$STATIC_IP_NAME" >/dev/null 2>&1; then
  aws lightsail allocate-static-ip --static-ip-name "$STATIC_IP_NAME" >/dev/null
fi
attached="$(aws lightsail get-static-ip --static-ip-name "$STATIC_IP_NAME" --query staticIp.attachedTo --output text)"
if [[ "$attached" == "None" || -z "$attached" ]]; then
  aws lightsail attach-static-ip --static-ip-name "$STATIC_IP_NAME" --instance-name "$INSTANCE_NAME" >/dev/null
fi

PUBLIC_IP="$(aws lightsail get-static-ip --static-ip-name "$STATIC_IP_NAME" --query staticIp.ipAddress --output text)"
echo "Public IP: $PUBLIC_IP"

ssh_cmd=(ssh -i "$KEY_FILE" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "ubuntu@$PUBLIC_IP")

for _ in $(seq 1 36); do
  if "${ssh_cmd[@]}" "command -v docker >/dev/null && docker compose version >/dev/null"; then
    break
  fi
  sleep 10
done

if ! "${ssh_cmd[@]}" "command -v docker >/dev/null"; then
  echo "Docker is not installed yet. Cloud-init may still be running; retry in a minute." >&2
  exit 1
fi

"${ssh_cmd[@]}" "sudo mkdir -p /opt/vbs && sudo chown ubuntu:ubuntu /opt/vbs"
rsync -az --delete \
  --exclude node_modules --exclude dist --exclude client/dist --exclude .git \
  --exclude e2e-report --exclude test-results --exclude playwright-report \
  --exclude backups --exclude deploy/lightsail/.env \
  --exclude deploy/lightsail/.credentials.local \
  -e "ssh -i $KEY_FILE -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes" \
  "$ROOT/" "ubuntu@$PUBLIC_IP:/opt/vbs/"

REMOTE_ENV=/opt/vbs/deploy/lightsail/.env
if ! "${ssh_cmd[@]}" "test -f $REMOTE_ENV"; then
  AUTH_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)"
  SESSION_SECRET="$(openssl rand -hex 32)"
  POSTGRES_PASSWORD="$(openssl rand -hex 16)"
  S3_SECRET_KEY="$(openssl rand -hex 16)"
  PCHEAZ_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)"
  SITE_HOST="${PUBLIC_IP}.sslip.io"
  "${ssh_cmd[@]}" "cat > $REMOTE_ENV" <<EOF
SITE_ADDRESS=${SITE_HOST}
APP_PUBLIC_URL=https://${SITE_HOST}
AUTH_PASSWORD=${AUTH_PASSWORD}
SESSION_SECRET=${SESSION_SECRET}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
S3_SECRET_KEY=${S3_SECRET_KEY}
PCHEAZ_PASSWORD=${PCHEAZ_PASSWORD}
EOF
  umask 077
  cat > "$COMPOSE_DIR/.credentials.local" <<EOF
# Local copy of demo logins. Do not commit. Generated $(date -u +%Y-%m-%dT%H:%MZ)
URL=https://${SITE_HOST}
admin / ${AUTH_PASSWORD}
pcheaz@gmail.com / ${PCHEAZ_PASSWORD}
EOF
  chmod 600 "$COMPOSE_DIR/.credentials.local"
  echo "Wrote logins to $COMPOSE_DIR/.credentials.local"
else
  echo "Keeping existing $REMOTE_ENV on the instance."
fi

"${ssh_cmd[@]}" "chmod +x /opt/vbs/scripts/aws/lightsail-remote-update.sh && bash /opt/vbs/scripts/aws/lightsail-remote-update.sh"

echo
echo "Demo should be at https://${PUBLIC_IP}.sslip.io"
echo "Logins: $COMPOSE_DIR/.credentials.local"
echo "Tear down with: scripts/aws/lightsail-down.sh"
