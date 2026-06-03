#!/usr/bin/env bash
set -euo pipefail

RPC_URL="${RPC_URL:-http://anvil:8545}"

echo "Waiting for anvil at $RPC_URL ..."
until curl -fsS -X POST -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' "$RPC_URL" >/dev/null; do
  sleep 1
done
echo "Anvil up."

cd /work
forge script --root contracts script/Deploy.s.sol:Deploy \
  --rpc-url "$RPC_URL" --broadcast --silent
cat deployed.env
echo "Deploy complete."
