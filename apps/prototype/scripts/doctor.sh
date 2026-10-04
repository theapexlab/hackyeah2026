#!/usr/bin/env bash
# Checks each pinned tool in mise.toml answers with its pinned version, and the Docker daemon.
# DOCTOR_REQUIRE_DOCKER=1 makes an unreachable daemon a failure.
set -uo pipefail

# A bare substring match accepts 12.1.160 for 2.1.16, so the version must not touch other digits.
# The trailing `\.($|[^0-9])` lets a sentence-final period through (`convco 0.7.2.`) and still
# rejects 2.1.16.1.
version_pattern() {
  printf '(^|[^0-9.])%s($|[^0-9.]|\\.($|[^0-9]))' "${1//./\\.}"
}

version_matches() {
  grep -Eq -e "$(version_pattern "$1")" <<<"$2"
}

check() {
  local name=$1 want=$2
  shift 2
  local out
  if ! out=$("$@" 2>&1); then
    printf 'FAIL %-14s want %-10s command failed: %s\n' "$name" "$want" "$(head -1 <<<"$out")"
    failed=1
    return
  fi
  if version_matches "$want" "$out"; then
    printf 'ok   %-14s %s\n' "$name" "$(grep -E -m1 -e "$(version_pattern "$want")" <<<"$out")"
  else
    printf 'FAIL %-14s want %-10s got: %s\n' "$name" "$want" "$(head -1 <<<"$out")"
    failed=1
  fi
}

if [ "${DOCTOR_SOURCE_ONLY:-0}" = 1 ]; then
  return 0 2>/dev/null || exit 0
fi

failed=0

check go 1.27.1 go version
check java 25.0.4.1 java -version
check gradle 9.8.0 gradle --version
check task 3.54.0 task --version
check golangci-lint 2.14.0 golangci-lint --version
check gotestsum 1.13.0 gotestsum --version
check govulncheck 1.8.0 govulncheck -version

if docker info >/dev/null 2>&1; then
  echo "ok   docker         daemon reachable"
elif [ "${DOCTOR_REQUIRE_DOCKER:-0}" = 1 ]; then
  echo "FAIL docker         daemon not reachable"
  failed=1
else
  echo "warn docker         daemon not reachable"
fi

exit "$failed"
