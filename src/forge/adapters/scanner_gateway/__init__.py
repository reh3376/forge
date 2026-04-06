"""Scanner Gateway Adapter — edge device ingestion for QR/barcode scanners.

This adapter implements a two-tier architecture:
  - Android devices speak a lightweight scanner.v1 ScannerService gRPC contract
  - The gateway translates to forge.v1 AdapterService for the Forge hub
  - Scan events are routed to the correct spoke (WMS, IMS, QMS) based on
    scan type classification

The gateway is the first Forge adapter that serves multiple spokes
from a single edge device input stream.
"""

from forge.adapters.scanner_gateway.adapter import ScannerGatewayAdapter

__all__ = ["ScannerGatewayAdapter"]
