#!/usr/bin/env bash
set -euo pipefail
echo "Waiting for /work/deployed.env ..."
until [ -f /work/deployed.env ]; do sleep 1; done
echo "deployed.env present."
