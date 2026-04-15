// forged is the Forge hub daemon. It serves gRPC (Connect-Go),
// REST (Chi), and an embedded MQTT broker from a single process.
package main

import (
	"fmt"
	"log/slog"
	"os"
)

var version = "dev"

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	slog.Info("starting forged", "version", version)
	fmt.Fprintf(os.Stderr, "forged %s — hub daemon not yet wired\n", version)
	os.Exit(0)
}
