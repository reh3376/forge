"""forge.api — Unified Hub API service.

Combines REST (FastAPI) and gRPC (spoke transport) into a single
deployable service.  The ``create_app()`` factory builds the FastAPI
application with sub-routers for health, adapter management, and
record ingestion, plus an optional curation sub-mount.
"""
