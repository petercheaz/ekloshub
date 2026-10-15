#!/usr/bin/env bash
# Delete the demo Lightsail instance and static IP (stops the $12/mo charge).
set -euo pipefail

REGION="${AWS_REGION:-us-west-2}"
INSTANCE_NAME="${INSTANCE_NAME:-vbs-demo}"
STATIC_IP_NAME="${STATIC_IP_NAME:-vbs-demo-ip}"
export AWS_DEFAULT_REGION="$REGION"

if aws lightsail get-instance --instance-name "$INSTANCE_NAME" >/dev/null 2>&1; then
  aws lightsail delete-instance --instance-name "$INSTANCE_NAME" --force-delete-add-ons
  echo "Deleted instance $INSTANCE_NAME"
fi
if aws lightsail get-static-ip --static-ip-name "$STATIC_IP_NAME" >/dev/null 2>&1; then
  aws lightsail release-static-ip --static-ip-name "$STATIC_IP_NAME"
  echo "Released $STATIC_IP_NAME"
fi
