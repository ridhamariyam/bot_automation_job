#!/bin/sh
# Production container start: API + ARQ worker in same process space.
# Container exits if uvicorn crashes (Render restarts it).
set -e

echo "Starting JobRocket API + Bot Worker..."

uvicorn main:app --host 0.0.0.0 --port "${PORT:-10000}" --workers 1 &
UVICORN_PID=$!

python -m arq workers.bot_worker.WorkerSettings &
ARQ_PID=$!

echo "uvicorn PID=$UVICORN_PID | arq PID=$ARQ_PID"

# Exit when uvicorn exits (Render will restart container)
wait $UVICORN_PID
echo "uvicorn exited — stopping container"
kill $ARQ_PID 2>/dev/null || true
