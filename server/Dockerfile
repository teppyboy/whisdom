FROM rust:1.82-bookworm AS builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends cmake build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

COPY Cargo.toml Cargo.lock* rust-toolchain.toml* ./
COPY src/ src/

RUN cargo build --release --frozen \
    && strip target/release/whisdom-server

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip \
    && pip3 install --break-system-packages yt-dlp \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /data/models /data/tmp

WORKDIR /app

COPY --from=builder /build/target/release/whisdom-server /usr/local/bin/whisdom-server
COPY scripts/download-model.sh /usr/local/bin/download-model.sh

ENV WHISDOM_MODEL_DIR=/data/models
ENV WHISDOM_TEMP_DIR=/data/tmp
ENV WHISDOM_SERVER_PORT=8788

EXPOSE 8788

CMD ["whisdom-server"]
