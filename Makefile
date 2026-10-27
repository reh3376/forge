# Forge: repository-level targets. The Go module has its own Makefile under go/.
#
# Tutorial package (FB-103), built by tutorial-forge (scripts/tutorial-forge/,
# agent reference scripts/tutorial-forge/FSD.md). Config: tutorial.config.json
# (deck docs/tutorial.md, output build/tutorial-static/, gitignored).
#
# One-time setup on a fresh checkout: cd scripts/tutorial-forge && npm ci
# (downloads Chromium for the Mermaid render, ~150 MB).

.PHONY: sync-tutorial-embed verify-tutorial-embed check-tutorial-build serve-tutorial tutorial-zip

# Render the deck: every Mermaid block to SVG, acronyms expanded on first use, the
# TOC sidebar, one self-contained static site under build/tutorial-static/.
sync-tutorial-embed:
	@test -d scripts/tutorial-forge/node_modules \
		|| (echo "tutorial-forge deps not installed; run: cd scripts/tutorial-forge && npm ci" && exit 1)
	@node scripts/tutorial-forge/cli.mjs build --config tutorial.config.json

# Drift gate (FSD §11.1): the build's SOURCE_SHA256.txt matches the current sources.
verify-tutorial-embed:
	@python3 scripts/verify_tutorial_embed.py \
		|| (echo ""; echo "DRIFT: run 'make sync-tutorial-embed'."; exit 1)
	@echo "  OK: no drift"

# The FSD's verification contracts (§8, §15.6) plus the fragment-link check.
check-tutorial-build:
	@python3 scripts/check_tutorial_build.py

# Browser check: open http://localhost:8000/ at a viewport of 980px or wider.
serve-tutorial:
	@cd build/tutorial-static && python3 -m http.server 8000

# A self-contained archive that works by unzipping and opening index.html.
tutorial-zip: sync-tutorial-embed
	@rm -f forge-tutorial.zip
	@(cd build && zip -qr ../forge-tutorial.zip tutorial-static)
	@du -h forge-tutorial.zip
