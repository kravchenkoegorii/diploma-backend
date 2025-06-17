#!/bin/sh
set -e

yarn run migration:run:prod

if [ "$#" -eq 0 ]; then
  echo "Error: No startup command provided."
  exit 1
fi

exec "$@"