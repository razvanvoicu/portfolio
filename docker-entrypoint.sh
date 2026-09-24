#!/bin/sh
set -e

node /backend/src/server.js &

exec nginx -g "daemon off;"
