#!/usr/bin/env bash
# Start both frontend and backend in dev mode

echo "Starting JobRocket.ai dev servers..."

# Backend
(cd backend && source venv/bin/activate && uvicorn main:app --reload --port 8000) &
BACKEND_PID=$!

# Frontend
(cd frontend && npm run dev) &
FRONTEND_PID=$!

echo ""
echo "  Frontend → http://localhost:3000"
echo "  Backend  → http://localhost:8000"
echo "  API docs → http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both servers."

trap "kill $BACKEND_PID $FRONTEND_PID" INT TERM
wait
