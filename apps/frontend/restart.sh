#!/bin/bash
# Frontend 서버 재시작 스크립트 (Next.js Standalone)

set -e

DEPLOY_PATH="/home/ubuntu/ktb-chat-frontend"
PID_FILE="$DEPLOY_PATH/server.pid"
LOG_FILE="$DEPLOY_PATH/app.log"

cd "$DEPLOY_PATH" || {
    echo "❌ Failed to change directory to $DEPLOY_PATH"
    exit 1
}

echo "🔍 Checking build structure..."
if [ ! -f "server.js" ]; then
    echo "❌ server.js not found!"
    exit 1
fi

if [ ! -d ".next" ]; then
    echo "❌ .next directory not found!"
    exit 1
fi

if [ ! -f ".next/BUILD_ID" ]; then
    echo "❌ BUILD_ID not found!"
    ls -la .next/ || true
    exit 1
fi

echo "✅ Build structure verified"

# 기존 서버 종료
if [ -f "$PID_FILE" ]; then
    echo "🛑 Stopping existing server..."
    PID=$(cat "$PID_FILE")

    if ps -p "$PID" > /dev/null 2>&1; then
        kill "$PID" || true
        # 프로세스가 완전히 종료될 때까지 대기
        for i in {1..10}; do
            if ! ps -p "$PID" > /dev/null 2>&1; then
                break
            fi
            sleep 0.5
        done

        # 강제 종료가 필요한 경우
        if ps -p "$PID" > /dev/null 2>&1; then
            echo "⚠️  Force killing process..."
            kill -9 "$PID" || true
            sleep 1
        fi
        echo "✅ Server stopped (PID: $PID)"
    else
        echo "⚠️  Process $PID not found (stale PID file)"
    fi
    rm -f "$PID_FILE"
else
    echo "⚠️  No PID file found, checking for running processes..."
    pkill -f 'node server.js' || true
    sleep 1
fi

echo "🚀 Starting Next.js server..."
NODE_ENV=production nohup node server.js >> "$LOG_FILE" 2>&1 &
NEW_PID=$!

# PID 파일 저장
echo "$NEW_PID" > "$PID_FILE"

# 서버 시작 확인
sleep 2
if ps -p "$NEW_PID" > /dev/null 2>&1; then
    echo "✅ Server started successfully!"
    echo "📋 PID: $NEW_PID (saved to $PID_FILE)"
    echo "📋 Logs: tail -f $LOG_FILE"
    echo ""
    echo "Recent logs:"
    tail -n 20 "$LOG_FILE"
else
    echo "❌ Failed to start server"
    echo "📋 Check $LOG_FILE for details"
    echo ""
    echo "Recent logs:"
    tail -n 50 "$LOG_FILE"
    rm -f "$PID_FILE"
    exit 1
fi