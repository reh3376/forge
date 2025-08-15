{
  description = "whk-wms dev env";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";

  outputs = { self, nixpkgs }:
  let
    system = "aarch64-linux";
    pkgs = import nixpkgs { inherit system; };

    # Graphite CLI bootstrapper named `gt`
    gt = pkgs.writeShellApplication {
      name = "gt";
      runtimeInputs = [ pkgs.curl pkgs.jq pkgs.coreutils ];
      text = ''
        set -euo pipefail
        if [ -x "$HOME/.local/bin/gt" ]; then
          exec "$HOME/.local/bin/gt" "$@"
        fi

        case "$(uname -m)" in
          aarch64|arm64) ASSET=gt-linux-arm64 ;;
          x86_64|amd64)  ASSET=gt-linux ;;
          *) echo "Unsupported arch: $(uname -m)"; exit 1 ;;
        esac

        version="$(curl -fsSL https://registry.npmjs.org/@withgraphite/graphite-cli/stable | jq -r .version)"
        url="https://github.com/withgraphite/homebrew-tap/releases/download/v$version/$ASSET"
        echo "[gt] Installing Graphite CLI $version for $(uname -m)…"
        mkdir -p "$HOME/.local/bin"
        curl -fL "$url" -o "$HOME/.local/bin/gt"
        chmod +x "$HOME/.local/bin/gt"

        exec "$HOME/.local/bin/gt" "$@"
      '';
    };

    # Add Codex CLI
    # Codex CLI bootstrapper (no recursion)
    codexCLI = pkgs.writeShellApplication {
      name = "codex";
      runtimeInputs = [ pkgs.nodejs_20 pkgs.curl pkgs.coreutils ];
      text = ''
        set -euo pipefail

        # prefer user-local bin and make npm globals land there
        export NPM_CONFIG_PREFIX="$HOME/.local"
        export PATH="$HOME/.local/bin:$PATH"

        SELF="$(command -v codex || true)"

        # if a real codex already exists and isn't this wrapper, use it
        if [ -x "$HOME/.local/bin/codex" ] && [ "$HOME/.local/bin/codex" != "$SELF" ]; then
          exec "$HOME/.local/bin/codex" "$@"
        fi

        # install via npm (pin if you want: @0.21.0)
        echo "[codex] Installing Codex CLI into $HOME/.local …"
        mkdir -p "$HOME/.local/bin"
        npm i -g @openai/codex

        # exec the real binary explicitly to avoid PATH recursion
        if [ -x "$HOME/.local/bin/codex" ]; then
          exec "$HOME/.local/bin/codex" "$@"
        fi

        # final fallback: npm bin -g
        NBIN="$(npm bin -g 2>/dev/null || true)"
        if [ -n "$NBIN" ] && [ -x "$NBIN/codex" ]; then
          exec "$NBIN/codex" "$@"
        fi

        echo "[codex] install complete, but binary not found on PATH."
        exit 1
      '';
    };

    # Claude Code CLI bootstrapper (no recursion)
    claudeCLI = pkgs.writeShellApplication {
      name = "claude";
      runtimeInputs = [ pkgs.curl pkgs.coreutils pkgs.ripgrep ];
      text = ''
        set -euo pipefail
        CLAUDE_REAL=""
        if [ -x "$HOME/.claude/local/claude" ]; then
          CLAUDE_REAL="$HOME/.claude/local/claude"
        elif [ -x "$HOME/.local/bin/claude" ]; then
          CLAUDE_REAL="$HOME/.local/bin/claude"
        fi

        if [ -z "$CLAUDE_REAL" ]; then
          echo "[claude] Installing Claude Code CLI ..."
          curl -fsSL https://claude.ai/install.sh | bash
          if [ -x "$HOME/.claude/local/claude" ]; then
            CLAUDE_REAL="$HOME/.claude/local/claude"
          elif [ -x "$HOME/.local/bin/claude" ]; then
            CLAUDE_REAL="$HOME/.local/bin/claude"
          fi
        fi

        if [ -z "$CLAUDE_REAL" ]; then
          echo "[claude] Install failed: not found in ~/.claude/local or ~/.local/bin"
          exit 1
        fi

        exec "$CLAUDE_REAL" "$@"
      '';
    };

    # Cursor CLI bootstrapper
    cursorAgent = pkgs.writeShellApplication {
      name = "cursor-agent";
      runtimeInputs = [ pkgs.curl ];
      text = ''
        set -euo pipefail
        if ! [ -x "$HOME/.local/bin/cursor-agent" ]; then
          echo "[cursor] Installing Cursor CLI into $HOME/.local/bin …"
          mkdir -p "$HOME/.local/bin"
          curl -fsSL https://cursor.com/install | bash
        fi
        exec "$HOME/.local/bin/cursor-agent" "$@"
      '';
    };
  in {
    devShells.${system}.default = pkgs.mkShell {
      packages = with pkgs; [
        # runtime/tooling
        nodejs_20
        docker-client
	docker-compose
        direnv nix-direnv
        cursorAgent
        claudeCLI
        codexCLI
        gt

        # essentials
        curl wget git gh rsync less file which

        # archives
        zip unzip p7zip xz zstd

        # shell UX
        ripgrep fd fzf zoxide eza bat delta tree tealdeer just

        # editors
        neovim

        # monitoring
        btop htop iotop iftop lsof

        # networking
        iproute2 iputils mtr traceroute nmap socat netcat-openbsd dnsutils whois

        # disks / fs
        util-linux parted gptfdisk ncdu duf dust

        # nix helpers
        nix-output-monitor nix-tree nixpkgs-fmt nil
        prisma-engines  # for Prisma on NixOS
      ];

      shellHook = ''
        # local user bin (cursor/gt install targets)
        export PATH="$HOME/.claude/local:$HOME/.local/bin:$PATH"
	      export NODE_OPTIONS="--max-old-space-size=4096 $NODE_OPTIONS"

        # Force Node-API engine and point Prisma to Nix’s engines
        export PRISMA_CLIENT_ENGINE_TYPE=library
        export PRISMA_CLI_QUERY_ENGINE_TYPE=library

        export PRISMA_SCHEMA_ENGINE_BINARY=${pkgs.prisma-engines}/bin/schema-engine
        export PRISMA_QUERY_ENGINE_LIBRARY=${pkgs.prisma-engines}/lib/libquery_engine.node
        export PRISMA_QUERY_ENGINE_BINARY=${pkgs.prisma-engines}/bin/query-engine
        export PRISMA_INTROSPECTION_ENGINE_BINARY=${pkgs.prisma-engines}/bin/introspection-engine
        export PRISMA_FMT_BINARY=${pkgs.prisma-engines}/bin/prisma-fmt

        # Nix builds don’t ship Prisma’s sha files—skip that check
        export PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1

        # Corepack: repo-local shims
        mkdir -p "$PWD/.corepack" 2>/dev/null || true
        if command -v corepack >/dev/null; then
          COREPACK_HOME="$PWD/.corepack" corepack enable --install-directory "$PWD/.corepack" >/dev/null 2>&1 || true
          export PATH="$PWD/.corepack:$PATH"
        fi

        echo "[devShell] Node $(node -v 2>/dev/null || echo n/a) / npm $(npm -v 2>/dev/null || echo n/a)"
      '';
    };
  };
}

