#!/usr/bin/env bash
# Builds the Reel Escape Android APK.
#   bash scripts/build-apk.sh            -> debug APK (installable, signed with a debug key)
#   bash scripts/build-apk.sh release    -> release APK (needs android/keystore.properties, see README)
set -euo pipefail
cd "$(dirname "$0")/.."
MODE="${1:-debug}"
: "${ANDROID_HOME:=${ANDROID_SDK_ROOT:-$HOME/android-sdk}}"
export ANDROID_HOME
echo "sdk.dir=$ANDROID_HOME" > android/local.properties

npm run build
npx cap sync android

cd android
chmod +x gradlew
if [ "$MODE" = "release" ]; then
  ./gradlew --no-daemon assembleRelease
  OUT=app/build/outputs/apk/release/app-release.apk
else
  ./gradlew --no-daemon assembleDebug
  OUT=app/build/outputs/apk/debug/app-debug.apk
fi
mkdir -p ../dist-apk
cp "$OUT" "../dist-apk/ReelEscape-$MODE.apk"
echo "APK ready: movie-escape/dist-apk/ReelEscape-$MODE.apk"
