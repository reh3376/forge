"""D3.12 Production Verification — end-to-end integration tests.

These tests prove the contracts between all D3 components are correct
by wiring them together in-process (no Docker required):

1. test_pipeline_e2e: adapter → context → record → governance → storage → curation
2. test_hub_api: registration → health → ingestion → query
3. test_facts_governance: spec load → validation → hash verification → report
4. test_sdk_roundtrip: scaffold → import → configure → collect → verify
"""
