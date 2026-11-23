r"""Generated protobuf stubs (``forge.v1``).

Generated from ``forge-core/contract/proto/*.proto`` laid out as ``forge/v1/*.proto`` with
the grpc_tools protoc that matches the checked-in header (``Protobuf Python
Version`` / ``GRPC_GENERATED_VERSION``), then the imports rewritten to this
package::

    T=$(mktemp -d) && mkdir -p $T/forge/v1 && cp forge-core/contract/proto/*.proto $T/forge/v1/
    OUT=forge-core/src/python/forge_core/proto_gen
    .venv/bin/python -m grpc_tools.protoc -I $T --python_out=$OUT \
        --grpc_python_out=$OUT forge/v1/*.proto
    sed -i '' 's/^from forge\.v1 import /from forge_core.proto_gen.forge.v1 import /' \
        forge-core/src/python/forge_core/proto_gen/forge/v1/*.py

The Go stubs under ``go/gen`` come from ``cd go && buf generate`` (the same
proto files under ``go/proto``, differing only in ``go_package``); ``go/buf.gen.yaml``
runs the generators at the versions the stubs carry (``go run ...@v1.36.12`` and
``@v1.21.1``), so a regeneration changes only what the .proto changed.
"""
