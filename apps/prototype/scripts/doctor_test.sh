#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")"
DOCTOR_SOURCE_ONLY=1 source ./doctor.sh

fails=0
expect() {
  local verdict=$1 want=$2 out=$3
  local got=no
  version_matches "$want" "$out" && got=yes
  if [ "$got" != "$verdict" ]; then
    echo "FAIL want=$want out=$out expected match=$verdict got=$got"
    fails=1
  fi
}

expect yes 2.1.16 "2.1.16"
expect yes 1.27.1 "go version go1.27.1 darwin/arm64"
expect yes 3.54.0 "Task version: v3.54.0 (h1:abc)"
expect yes 1.13.0 "gotestsum version v1.13.0+dirty"
expect yes 25.0.4.1 'openjdk version "25.0.4.1" 2026-08-18 LTS'
expect yes 2.14.0 "golangci-lint has version 2.14.0 built with go1.27"
expect yes 0.7.2 "convco 0.7.2."
expect no 2.1.16 "12.1.160"
expect no 2.1.16 "2.1.160"
expect no 2.1.16 "2.1.16.1"
expect no 25.0.4.1 'openjdk version "25.0.4.2"'
expect no 25.0.4.1 'openjdk version "25.0.40"'
expect no 1.8.0 "Scanner: govulncheck@v1.8.1"
expect no 2.1.16 "x.2.1.16"
expect no 25.0.4.1 "25.0.4.10"
expect yes 2.1.16 $'lefthook 12.1.160\n2.1.16'

[ "$fails" = 0 ] && echo "doctor_test: all cases pass"
exit "$fails"
