#!/usr/bin/env bash
#
# Fails if a Supabase service key is ever committed.
#
# The repo is public. The publishable key is designed to ship in client bundles
# and is fine. A service_role key bypasses row-level security entirely, so
# committing one exposes every family's child data — and deleting the commit
# does not undo it, because the history is already public. The key has to be
# rotated at that point.
#
# The patterns match key VALUES, not the words. An earlier version grepped for
# "service_role" and fired on documentation explaining why not to commit one.
# A check that cries wolf teaches people to ignore it, which is worse than not
# having it.
#
# Runs in CI and from npm test, so nobody has to remember it.

set -uo pipefail
cd "$(dirname "$0")/.."

# 1. Modern secret keys: sb_secret_ followed by real key characters.
# 2. An env assignment whose name mentions a service role AND has a long value.
# 3. The base64url of "service_role" at each of the three byte alignments a JWT
#    payload can put it at — this is what a leaked legacy service JWT contains.
patterns='sb_secret_[A-Za-z0-9_-]{8,}'
patterns+='|(SERVICE_ROLE|SERVICEROLE)[A-Z_]*[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9._-]{20,}'
patterns+='|c2VydmljZV9yb2xl|NlcnZpY2Vfcm9sZ|zZXJ2aWNlX3JvbGU'

hits=$(git ls-files -z --cached --others --exclude-standard \
  | xargs -0 grep -nIE "$patterns" 2>/dev/null \
  | grep -v '^scripts/check-no-secrets\.sh:')

if [ -n "$hits" ]; then
  echo "SECRET CHECK FAILED — what looks like a service key is in a tracked file:"
  echo
  echo "$hits"
  echo
  echo "Remove it AND rotate the key. The history is public, so deleting the"
  echo "commit is not enough."
  exit 1
fi

echo "secret check: clean"
