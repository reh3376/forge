r"""Generated protobuf stubs (``forge.v1``).

Generated from ``src/forge/proto/*.proto`` laid out as ``forge/v1/*.proto`` with
the grpc_tools protoc that matches the checked-in header (``Protobuf Python
Version`` / ``GRPC_GENERATED_VERSION``), then the imports rewritten to this
package::

    T=$(mktemp -d) && mkdir -p $T/forge/v1 && cp src/forge/proto/*.proto $T/forge/v1/
    .venv/bin/python -m grpc_tools.protoc -I $T --python_out=src/forge/proto_gen \
        --grpc_python_out=src/forge/proto_gen forge/v1/*.proto
    sed -i '' 's/^from forge\.v1 import /from forge.proto_gen.forge.v1 import /' \
        src/forge/proto_gen/forge/v1/*.py

The Go stubs under ``go/gen`` come from ``cd go && buf generate`` (the same
proto files under ``go/proto``, differing only in ``go_package``).
"""
