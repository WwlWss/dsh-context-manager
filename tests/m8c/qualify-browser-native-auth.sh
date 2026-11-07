#!/usr/bin/env bash
set -euo pipefail

# A single reviewed dependency/dispatch recipe used by Draft AUTH, protected
# Ready Full (inside m7d-packed-web) and post-merge main AUTH+Full.
# Only the four actually qualified public DSH versions may be selected.
if [[ "$#" -ne 1 ]]; then
  echo 'M8C AUTH expects exactly one qualified DSH version' >&2
  exit 2
fi
version="$1"
case "$version" in
  0.1.2-rc.1|0.1.5-rc.1|0.1.5-rc.2|0.1.6-alpha.2) ;;
  *) echo 'M8C AUTH refused unsupported DSH version' >&2; exit 2 ;;
esac

# The caller has already installed the frozen Chromium runner. In the M7D
# Full lane, execute this *after* the packed candidate's independent E2E so
# the version-specific auth dependencies cannot affect the packed test.
pnpm add --save-dev --save-exact \
  @deepseek-ai/cordis@4.0.2 \
  @deepseek-ai/cordis-plugin-loader@1.0.3 \
  "@deepseek-ai/dsh-agent-presets@$version" \
  "@deepseek-ai/dsh-session-projection@$version" \
  "@deepseek-ai/dsh-typert-protocol@$version" \
  "@deepseek-ai/dsh-typert-registry@$version" \
  "@deepseek-ai/dsh-api-gateway@$version" \
  "@deepseek-ai/dsh-client-connection@$version" \
  "@deepseek-ai/dsh-host-webserver@$version"
pnpm run build

# The script itself compares private bytes strictly in memory; no native
# body, token or Cookie is emitted to runner output/artifact.
node tests/m8c/authenticated-native-preset-browser.mjs
