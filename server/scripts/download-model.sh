#!/usr/bin/env bash
set -euo pipefail

MODEL_DIR="${1:-./models}"
MODEL_NAME="${2:-ggml-base-q5_1.bin}"
BASE_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main"

mkdir -p "$MODEL_DIR"

echo "Downloading $MODEL_NAME to $MODEL_DIR..."
curl -L -o "$MODEL_DIR/$MODEL_NAME" "$BASE_URL/$MODEL_NAME"

echo "Done. Model saved to $MODEL_DIR/$MODEL_NAME"
