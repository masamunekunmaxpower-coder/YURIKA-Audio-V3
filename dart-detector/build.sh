#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
dart compile js --csp -O2 detector_entry.dart -o detector.compiled.js
cat detector.compiled.js adapter.footer.js > dart-detector-runtime.js
printf '%s\n' 'Built dart-detector-runtime.js with dart2js --csp.'
