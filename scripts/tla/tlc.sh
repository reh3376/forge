#!/usr/bin/env bash
# Run the TLA+ model checker (TLC) on a model, with a pinned version of the tools.
#
#   scripts/tla/tlc.sh <Model.tla> [TLC options...]
#
# The jar is not in the repository. On first use it is downloaded from the project's
# release page into .tools/tla/ (ignored by git) and its SHA-256 is compared with the one
# pinned here; a jar that does not match is refused. Java 11 or newer is needed.
#
# To move to a newer release: change VERSION and SHA256 together, in one commit, after
# checking the new jar by hand.
set -euo pipefail

VERSION="1.7.4"
SHA256="936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88"
URL="https://github.com/tlaplus/tlaplus/releases/download/v${VERSION}/tla2tools.jar"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
jar="${root}/.tools/tla/tla2tools-${VERSION}.jar"

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

if ! command -v java >/dev/null 2>&1; then
  echo "tlc.sh: java is not installed; TLC needs Java 11 or newer" >&2
  exit 2
fi

if [ ! -f "${jar}" ]; then
  mkdir -p "$(dirname "${jar}")"
  echo "tlc.sh: fetching TLA+ tools ${VERSION}" >&2
  curl -sSfL -o "${jar}.part" "${URL}"
  mv "${jar}.part" "${jar}"
fi

found="$(sha256_of "${jar}")"
if [ "${found}" != "${SHA256}" ]; then
  echo "tlc.sh: ${jar} has SHA-256 ${found}, not the pinned ${SHA256}; refusing to run it" >&2
  exit 2
fi

if [ "$#" -lt 1 ]; then
  echo "usage: scripts/tla/tlc.sh <Model.tla> [TLC options...]" >&2
  exit 2
fi

model="$1"
shift
cd "$(dirname "${model}")"
exec java -XX:+UseParallelGC -cp "${jar}" tlc2.TLC -metadir "${root}/.tools/tla/states" "$(basename "${model}")" "$@"
