{
  description = "Project dev environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";

  nixConfig = {
    extra-experimental-features = [ "nix-command" "flakes" ];
  };

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in {
      formatter = forAllSystems (system: (import nixpkgs { inherit system; }).nixpkgs-fmt);

      devShells = forAllSystems (system:
        let
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
          default = pkgs.mkShell {
            packages = with pkgs; [
              # runtime/tooling
              nodejs_20
              docker-client
              docker-compose
              direnv nix-direnv
              cursorAgent
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
              iproute2 iputils mtr traceroute nmap socat openbsd-netcat dnsutils whois

              # disks / fs
              util-linux parted gptfdisk ncdu duf dust

              # nix helpers
              nix-output-monitor nix-tree nixpkgs-fmt nil
              prisma-engines  # for Prisma on NixOS
            ];

            shellHook = ''
              # local user bin (cursor/gt install targets)
              export PATH="$HOME/.local/bin:$PATH"

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
        }
      );
    };
}