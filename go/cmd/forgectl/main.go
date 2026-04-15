// forgectl is the Forge CLI for interacting with the hub daemon.
package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var version = "dev"

func main() {
	root := &cobra.Command{
		Use:   "forgectl",
		Short: "Forge hub CLI",
		Long:  "forgectl interacts with the forged hub daemon — health checks, adapter management, governance, and more.",
	}

	root.AddCommand(versionCmd())

	if err := root.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func versionCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Print forgectl version",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Printf("forgectl %s\n", version)
		},
	}
}
