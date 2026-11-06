# `make` on its own lists the targets.

.DEFAULT_GOAL := help
.PHONY: help check dev

help: ## List the targets
	@awk 'BEGIN { FS = ":.*## " } /^[a-z-]+:.*## / { printf "  \033[1m%-8s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

check: ## What CI requires: lint, type-check, test, and render the manifests
	pnpm exec biome ci
	pnpm exec tsc
	pnpm exec vitest run
	@# Argo CD renders each profile's overlay from main, so one that doesn't render must not get there.
	@for overlay in deploy/overlays/*/; do kustomize build $$overlay >/dev/null || exit 1; done

dev: ## Build the catalogue and run the shop on :8080, restarting on change
	pnpm dev
