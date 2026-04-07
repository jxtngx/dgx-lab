#!/bin/bash
set -e

if [ -z "$VIRTUAL_ENV" ]; then
  echo "ERROR: No virtual environment active. Activate the backend venv first:"
  echo "  source ~/Desktop/dgx-lab/backend/.venv/bin/activate"
  exit 1
fi

PYTHON="$VIRTUAL_ENV/bin/python3"

# FAISS links BLAS + LAPACK. On aarch64 Linux, MKL is unavailable — use OpenBLAS.
# Same deps as backend/Dockerfile (faiss-builder stage).
_openblas_ok() {
  command -v pkg-config >/dev/null 2>&1 && pkg-config --exists openblas 2>/dev/null && return 0
  case "$(uname -m)" in
    aarch64) compgen -G "/usr/lib/aarch64-linux-gnu/libopenblas.so*" >/dev/null && return 0 ;;
    x86_64)  compgen -G "/usr/lib/x86_64-linux-gnu/libopenblas.so*" >/dev/null && return 0 ;;
  esac
  return 1
}
if ! _openblas_ok; then
  echo "ERROR: OpenBLAS not found (need dev package for headers + CMake FindBLAS)."
  echo "Install on Ubuntu/Debian:"
  echo "  sudo apt-get update && sudo apt-get install -y libopenblas-dev liblapack-dev"
  exit 1
fi

FAISS_ROOT="$HOME/Desktop/faiss"
cd "$FAISS_ROOT"

# ── Step 1: build libfaiss with GPU + cuVS ──
echo "=== Building libfaiss (GPU + cuVS, aarch64 Blackwell) ==="

cmake -B _build \
  -DBUILD_SHARED_LIBS=ON \
  -DFAISS_ENABLE_C_API=ON \
  -DBUILD_TESTING=OFF \
  -DFAISS_ENABLE_GPU=ON \
  -DFAISS_ENABLE_CUVS=ON \
  -DFAISS_ENABLE_MKL=OFF \
  -DBLA_VENDOR=OpenBLAS \
  -DCMAKE_CUDA_ARCHITECTURES="native" \
  -DFAISS_ENABLE_PYTHON=OFF \
  -DCMAKE_INSTALL_LIBDIR=lib \
  -DCMAKE_BUILD_TYPE=Release \
  -DCUDAToolkit_ROOT="${CUDAToolkit_ROOT:-/usr/local/cuda}" .

make -C _build -j"$(nproc)" faiss faiss_c

cmake --install _build --prefix _libfaiss_stage/

echo "=== libfaiss built and staged ==="

# ── Step 2: build Python bindings ──
echo "=== Building Python bindings ==="



cmake -B _build_python \
  -Dfaiss_ROOT=_libfaiss_stage/ \
  -DFAISS_ENABLE_GPU=ON \
  -DFAISS_ENABLE_CUVS=ON \
  -DFAISS_ENABLE_MKL=OFF \
  -DBLA_VENDOR=OpenBLAS \
  -DCMAKE_BUILD_TYPE=Release \
  -DPython_EXECUTABLE="$PYTHON" \
  -DCUDAToolkit_ROOT="${CUDAToolkit_ROOT:-/usr/local/cuda}" \
  faiss/python

make -C _build_python -j"$(nproc)" swigfaiss

cd _build_python
"$PYTHON" -m pip install .

echo "=== faiss-gpu-cuvs installed ==="
"$PYTHON" -c "import faiss; print('FAISS version:', faiss.__version__); print('GPU support:', hasattr(faiss, 'StandardGpuResources'))"