#!/bin/bash
# usage: e2e.sh STEP USER_ID EMAIL
cd "$(dirname "$0")/../.."
export JWT_SECRET="super-secret-jwt-token-with-at-least-32-characters-long"
export VITE_SUPABASE_URL="http://localhost:54331"
export VITE_SUPABASE_ANON_KEY=$(node -e '
const c=require("crypto");const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
const h=b({alg:"HS256",typ:"JWT"}),p=b({role:"authenticated",sub:process.argv[1],email:process.argv[2],aud:"authenticated",exp:Math.floor(Date.now()/1000)+3600});
console.log(h+"."+p+"."+c.createHmac("sha256",process.env.JWT_SECRET).update(h+"."+p).digest("base64url"))' "$2" "$3")
STEP=$1 TEST_USER_ID=$2 TEST_EMAIL=$3 npx vite-node scripts/sync-e2e.ts 2>&1 | grep -v -i "experimentalwarning\|trace-warnings"
