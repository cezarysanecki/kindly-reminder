#!/bin/sh
set -eu

PROJECT_DIR="$(CDPATH= cd -- "$(dirname "$0")/../../../.." && pwd)"
open -a Terminal "$PROJECT_DIR/scripts/run-in-terminal.command"
