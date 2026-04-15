# Forge Go Hub — Makefile

.PHONY: proto-gen build test lint fmt clean vet

# Default target
all: proto-gen build test

# Generate Go + Connect-Go stubs from proto definitions
proto-gen:
	buf generate

# Build all binaries
build:
	go build ./...

# Build release binaries to bin/
bin: proto-gen
	@mkdir -p bin
	go build -o bin/forged   ./cmd/forged
	go build -o bin/forgectl ./cmd/forgectl

# Run all tests
test:
	go test ./... -v -count=1

# Run tests with race detector
test-race:
	go test ./... -v -race -count=1

# Lint with golangci-lint (install: https://golangci-lint.run/welcome/install)
lint:
	golangci-lint run ./...

# Format all Go files
fmt:
	gofmt -w .

# Run go vet
vet:
	go vet ./...

# Lint proto files
proto-lint:
	buf lint proto

# Clean generated files and binaries
clean:
	rm -rf gen/ bin/

# Tidy dependencies
tidy:
	go mod tidy
