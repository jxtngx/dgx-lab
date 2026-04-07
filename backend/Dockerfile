FROM nvidia/cuda:13.0.0-devel-ubuntu24.04 AS faiss-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake git build-essential swig python3-dev python3-pip python3-numpy \
    libopenblas-dev && \
    rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch main https://github.com/facebookresearch/faiss.git /faiss
WORKDIR /faiss

RUN cmake -B build \
    -DFAISS_ENABLE_GPU=ON \
    -DFAISS_ENABLE_CUVS=ON \
    -DFAISS_ENABLE_PYTHON=ON \
    -DBUILD_TESTING=OFF \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_CUDA_ARCHITECTURES="100" \
    -DCUDAToolkit_ROOT=/usr/local/cuda && \
    cmake --build build --target faiss -j$(nproc) && \
    cmake --build build --target swigfaiss -j$(nproc) && \
    (cd build/faiss/python && pip3 install --prefix=/faiss-install .)

# ── runtime stage ──
FROM ghcr.io/astral-sh/uv:python3.12-trixie-slim AS base

COPY --from=faiss-builder /usr/local/cuda/lib64/libcublas*.so* /usr/local/lib/
COPY --from=faiss-builder /usr/local/cuda/lib64/libcudart*.so* /usr/local/lib/
COPY --from=faiss-builder /usr/local/cuda/lib64/libcufft*.so* /usr/local/lib/
COPY --from=faiss-builder /faiss-install /usr/local/
RUN ldconfig

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

COPY . .

EXPOSE 8000
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
