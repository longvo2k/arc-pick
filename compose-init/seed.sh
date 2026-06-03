#!/usr/bin/env bash
set -euo pipefail

RPC_URL="${RPC_URL:-http://anvil:8545}"
test -f deployed.env || { echo "deployed.env missing; run deploy first"; exit 1; }
set -a; source deployed.env; set +a

cd /work
forge script --root contracts script/SeedMatches.s.sol:SeedMatches \
  --rpc-url "$RPC_URL" --broadcast --silent
echo "Seed complete."
