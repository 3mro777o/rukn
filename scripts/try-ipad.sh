#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -d node_modules ]]; then npm install; fi
npm run build
node --input-type=module <<'JS'
import {networkInterfaces} from 'node:os';
console.log('\nOpen on the iPad (same network, or Tailscale connected):');
for(const values of Object.values(networkInterfaces()))for(const address of values||[])if(address.family==='IPv4'&&!address.internal)console.log(`  http://${address.address}:${process.env.PORT||3000}`);
console.log('\nKeep this terminal open. Press Ctrl+C to stop.\n');
JS
exec npm start
