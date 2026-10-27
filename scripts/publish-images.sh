#!/bin/sh
# You run this on the Mac after creating the three Docker Hub repositories.
# This script publishes images. It is never invoked by application startup or tests.
set -eu
cd "$(dirname "$0")/.."
account=${DOCKERHUB_USERNAME:-shinebo}
app_tag=${APP_IMAGE_TAG:-v1}
platforms=${PLATFORMS:-linux/arm64}
builder=${BUILDER:-ecommerce-builder}
docker buildx inspect "$builder" >/dev/null || {
  printf '%s\n' 'Create the builder first: docker buildx create --name ecommerce-builder --driver docker-container --bootstrap' >&2
  exit 1
}
printf 'Publishing %s images (%s). Application tag: %s\n' "$account" "$platforms" "$app_tag"
docker buildx build --builder "$builder" --platform "$platforms" --push \
  -t "$account/ecommerce-frontend:$app_tag" ./frontend
docker buildx build --builder "$builder" --platform "$platforms" --push \
  -t "$account/ecommerce-backend:$app_tag" ./backend
for algorithm in P1 P2; do
  docker buildx build --builder "$builder" --platform "$platforms" --push \
    --build-arg "STUDY_KIT_ALGORITHM=$algorithm" \
    -f plugins/study-kit/Dockerfile -t "$account/ecommerce-study-kit:$algorithm" .
done
printf '%s\n' 'Published frontend/backend and both plug-in algorithms. No VM was changed.'
