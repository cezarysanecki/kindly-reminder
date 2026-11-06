#!/bin/bash

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

make dev
status=$?

echo
read -r -p "Kindly Reminder has stopped. Press Enter to close this Terminal window... "
exit "$status"
