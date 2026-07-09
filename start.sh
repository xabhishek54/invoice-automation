#!/bin/bash

echo "===================================="
echo " Starting Invoice Automation"
echo "===================================="

# Start Docker if needed
if ! systemctl is-active --quiet docker; then
    echo "Starting Docker..."
    sudo systemctl start docker
fi

# Start n8n container
echo "Starting n8n..."
docker start n8n >/dev/null 2>&1

echo "Waiting for n8n..."
sleep 5

echo "Starting application..."
npm run dev
