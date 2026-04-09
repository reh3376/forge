"""Tag path normalization for OPC-UA address space nodes.

Converts between raw OPC-UA browse paths (PLC-specific notation) and
Forge-normalized slash-separated paths used throughout the tag engine
and i3X API.

Ignition path format:
    [WHK01]Distillery01/Utility01/LIT_6050B/Out_PV

OPC-UA raw browse path:
    ns=2;s=Distillery01.Utility01.LIT_6050B.Out_PV

Forge normalized path:
    WH/WHK01/Distillery01/Utility01/LIT_6050B/Out_PV

The normalizer:
    1. Strips Ignition bracket notation: [WHK01] -> WHK01
    2. Maps OPC-UA namespace indices to PLC connection names
    3. Replaces dots (CIP separator) with slashes
    4. Prepends site prefix (WH) and PLC connection name
    5. Removes redundant separators and trailing slashes
    6. Provides reverse mapping for write operations (Forge path -> NodeId)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field


# Pattern for Ignition-style bracket prefix: [ConnectionName]rest/of/path
_IGNITION_BRACKET_RE = re.compile(r"^\[([^\]]+)\](.*)$")

# Pattern for OPC-UA string identifier: ns=N;s=identifier
_OPCUA_STRING_ID_RE = re.compile(r"^ns=(\d+);s=(.+)$")


@dataclass(frozen=True)
class NormalizedPath:
    """A normalized Forge tag path with metadata about its origin.

    Attributes:
        path: The normalized slash-separated path (e.g., "WH/WHK01/Distillery01/...")
        connection_name: The PLC connection name (e.g., "plc200")
        site_prefix: The site prefix (e.g., "WH")
        original: The original raw path before normalization
        namespace_index: The OPC-UA namespace index (if known)
    """

    path: str
    connection_name: str
    site_prefix: str
    original: str
    namespace_index: int | None = None


@dataclass
class PathNormalizer:
    """Bidirectional tag path normalizer for OPC-UA address spaces.

    Converts between raw OPC-UA browse names and Forge-normalized paths.
    Configured per deployment with site prefix and namespace-to-connection
    mappings.

    Usage::

        normalizer = PathNormalizer(
            site_prefix="WH",
            namespace_map={2: "WHK01"},
            connection_map={"plc200": 2},
        )

        # OPC-UA -> Forge
        result = normalizer.normalize("ns=2;s=Distillery01.Utility01.LIT_6050B.Out_PV")
        # result.path == "WH/WHK01/Distillery01/Utility01/LIT_6050B/Out_PV"

        # Ignition -> Forge
        result = normalizer.from_ignition("[WHK01]Distillery01/Utility01/LIT_6050B/Out_PV")
        # result.path == "WH/WHK01/Distillery01/Utility01/LIT_6050B/Out_PV"

        # Forge -> OPC-UA NodeId string
        node_id_str = normalizer.to_opcua_node_id(
            "WH/WHK01/Distillery01/Utility01/LIT_6050B/Out_PV"
        )
        # node_id_str == "ns=2;s=Distillery01.Utility01.LIT_6050B.Out_PV"
    """

    site_prefix: str = "WH"

    # OPC-UA namespace index -> PLC/connection name
    # e.g., {2: "WHK01", 3: "WHK02"}
    namespace_map: dict[int, str] = field(default_factory=dict)

    # Connection name -> OPC-UA namespace index (reverse)
    # e.g., {"WHK01": 2}
    connection_map: dict[str, int] = field(default_factory=dict)

    # Separator used within OPC-UA string identifiers
    # CIP uses dots, some servers use slashes
    opcua_separator: str = "."

    def __post_init__(self) -> None:
        """Build reverse maps if not provided."""
        if not self.connection_map and self.namespace_map:
            self.connection_map = {v: k for k, v in self.namespace_map.items()}

    # ------------------------------------------------------------------
    # OPC-UA -> Forge
    # ------------------------------------------------------------------

    def normalize(
        self,
        raw_path: str,
        *,
        namespace_index: int | None = None,
        connection_name: str | None = None,
    ) -> NormalizedPath:
        """Normalize a raw OPC-UA path to a Forge tag path.

        Handles multiple input formats:
            - OPC-UA node ID: "ns=2;s=Distillery01.Utility01.LIT_6050B.Out_PV"
            - Bare string ID: "Distillery01.Utility01.LIT_6050B.Out_PV"
            - Ignition bracket: "[WHK01]Distillery01/Utility01/LIT_6050B/Out_PV"
            - Already normalized: "WH/WHK01/Distillery01/Utility01/LIT_6050B/Out_PV"

        Args:
            raw_path: The raw path to normalize.
            namespace_index: OPC-UA namespace index (overrides parsed ns).
            connection_name: Explicit connection name (overrides ns lookup).

        Returns:
            NormalizedPath with the Forge-standard slash-separated path.
        """
        original = raw_path

        # Already normalized? (starts with site prefix and contains slashes)
        if raw_path.startswith(f"{self.site_prefix}/") and "/" in raw_path[len(self.site_prefix) + 1 :]:
            parts = raw_path.split("/")
            conn = parts[1] if len(parts) > 1 else ""
            return NormalizedPath(
                path=raw_path,
                connection_name=conn,
                site_prefix=self.site_prefix,
                original=original,
                namespace_index=self.connection_map.get(conn),
            )

        # Try Ignition bracket notation
        bracket_match = _IGNITION_BRACKET_RE.match(raw_path)
        if bracket_match:
            return self.from_ignition(raw_path)

        # Try OPC-UA node ID format
        opcua_match = _OPCUA_STRING_ID_RE.match(raw_path)
        if opcua_match:
            ns_idx = int(opcua_match.group(1))
            identifier = opcua_match.group(2)
            namespace_index = namespace_index or ns_idx
        else:
            # Bare string identifier
            identifier = raw_path

        # Resolve connection name from namespace index
        if connection_name is None and namespace_index is not None:
            connection_name = self.namespace_map.get(namespace_index, f"ns{namespace_index}")
        elif connection_name is None:
            connection_name = "unknown"

        # Replace OPC-UA separator (dots) with slashes
        path_segments = identifier.replace(self.opcua_separator, "/")

        # Clean up redundant slashes
        path_segments = re.sub(r"/+", "/", path_segments).strip("/")

        # Build normalized path: site/connection/path
        normalized = f"{self.site_prefix}/{connection_name}/{path_segments}"

        return NormalizedPath(
            path=normalized,
            connection_name=connection_name,
            site_prefix=self.site_prefix,
            original=original,
            namespace_index=namespace_index,
        )

    # ------------------------------------------------------------------
    # Ignition -> Forge
    # ------------------------------------------------------------------

    def from_ignition(self, ignition_path: str) -> NormalizedPath:
        """Convert Ignition bracket-notation path to Forge normalized path.

        Input:  [WHK01]Distillery01/Utility01/LIT_6050B/Out_PV
        Output: WH/WHK01/Distillery01/Utility01/LIT_6050B/Out_PV

        Args:
            ignition_path: Ignition-style tag path with bracket prefix.

        Returns:
            NormalizedPath with connection extracted from brackets.

        Raises:
            ValueError: If the path doesn't match Ignition bracket format.
        """
        match = _IGNITION_BRACKET_RE.match(ignition_path)
        if not match:
            msg = f"Not a valid Ignition path (missing [connection]): {ignition_path!r}"
            raise ValueError(msg)

        conn_name = match.group(1)
        rest = match.group(2).strip("/")

        # Replace dots with slashes if present (CIP mixed notation)
        rest = rest.replace(self.opcua_separator, "/")
        rest = re.sub(r"/+", "/", rest).strip("/")

        normalized = f"{self.site_prefix}/{conn_name}/{rest}"

        return NormalizedPath(
            path=normalized,
            connection_name=conn_name,
            site_prefix=self.site_prefix,
            original=ignition_path,
            namespace_index=self.connection_map.get(conn_name),
        )

    # ------------------------------------------------------------------
    # Forge -> OPC-UA
    # ------------------------------------------------------------------

    def to_opcua_node_id(
        self,
        forge_path: str,
        *,
        namespace_index: int | None = None,
    ) -> str:
        """Convert a Forge normalized path back to an OPC-UA NodeId string.

        Input:  WH/WHK01/Distillery01/Utility01/LIT_6050B/Out_PV
        Output: ns=2;s=Distillery01.Utility01.LIT_6050B.Out_PV

        Args:
            forge_path: Forge-normalized slash-separated path.
            namespace_index: Explicit namespace index (overrides connection lookup).

        Returns:
            OPC-UA NodeId string (ns=N;s=identifier).

        Raises:
            ValueError: If the path can't be resolved to a namespace.
        """
        parts = forge_path.strip("/").split("/")

        # Strip site prefix if present
        if parts and parts[0] == self.site_prefix:
            parts = parts[1:]

        if not parts:
            msg = f"Empty path after stripping site prefix: {forge_path!r}"
            raise ValueError(msg)

        # First segment is the connection name
        conn_name = parts[0]
        identifier_parts = parts[1:]

        # Resolve namespace index
        if namespace_index is None:
            namespace_index = self.connection_map.get(conn_name)
        if namespace_index is None:
            msg = (
                f"Cannot resolve namespace index for connection {conn_name!r}. "
                f"Known connections: {list(self.connection_map.keys())}"
            )
            raise ValueError(msg)

        # Join remaining segments with OPC-UA separator
        identifier = self.opcua_separator.join(identifier_parts)

        return f"ns={namespace_index};s={identifier}"

    def to_ignition(self, forge_path: str) -> str:
        """Convert a Forge normalized path to Ignition bracket notation.

        Input:  WH/WHK01/Distillery01/Utility01/LIT_6050B/Out_PV
        Output: [WHK01]Distillery01/Utility01/LIT_6050B/Out_PV

        Args:
            forge_path: Forge-normalized slash-separated path.

        Returns:
            Ignition-style tag path with bracket-enclosed connection.
        """
        parts = forge_path.strip("/").split("/")

        # Strip site prefix
        if parts and parts[0] == self.site_prefix:
            parts = parts[1:]

        if not parts:
            return forge_path

        conn_name = parts[0]
        rest = "/".join(parts[1:])
        return f"[{conn_name}]{rest}"
