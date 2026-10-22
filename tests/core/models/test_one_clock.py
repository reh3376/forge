"""One clock (FB-014): Forge's own stamps are UTC-aware and its models reject naive datetimes.

Owner's principle (2026-10-18): data from different sources only reconciles on one
master time, so a naive datetime, which names no instant, never enters a Forge model
and is never read as UTC by guess.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from forge.core.clock import OneClockModel, require_utc, utc_now
from forge.core.models.contextual_record import RecordTimestamp
from forge.core.models.data_product import DataProduct, DataProductSchema
from forge.core.models.decision import Assumption, DecisionFrame, EvidenceLink, EvidenceType

EASTERN = timezone(timedelta(hours=-5))
NAIVE = datetime(2026, 1, 1, 12, 0, 0)  # noqa: DTZ001 — naive on purpose: the thing under test


class TestClockHelpers:
    def test_utc_now_is_utc_aware(self) -> None:
        now = utc_now()
        assert now.tzinfo == UTC
        assert abs((datetime.now(UTC) - now).total_seconds()) < 5

    def test_require_utc_rejects_naive_and_names_the_field(self) -> None:
        with pytest.raises(ValueError, match="source_time must be timezone-aware"):
            require_utc(NAIVE, field="source_time")

    def test_require_utc_normalises_other_offsets(self) -> None:
        got = require_utc(datetime(2026, 1, 1, 7, 0, tzinfo=EASTERN))
        assert got == datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
        assert got.tzinfo == UTC

    def test_require_utc_keeps_utc(self) -> None:
        dt = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
        assert require_utc(dt) == dt


class _Stamped(OneClockModel):
    when: datetime
    maybe: datetime | None = None
    label: str = "x"


class TestOneClockModel:
    def test_naive_rejected_on_any_datetime_field(self) -> None:
        with pytest.raises(ValidationError, match="when must be timezone-aware"):
            _Stamped(when=NAIVE)
        with pytest.raises(ValidationError, match="maybe must be timezone-aware"):
            _Stamped(when=utc_now(), maybe=NAIVE)

    def test_none_and_non_datetime_fields_untouched(self) -> None:
        m = _Stamped(when=utc_now(), maybe=None, label="y")
        assert m.maybe is None
        assert m.label == "y"

    def test_iso_string_without_offset_rejected(self) -> None:
        with pytest.raises(ValidationError, match="when must be timezone-aware"):
            _Stamped.model_validate({"when": "2026-01-01T12:00:00"})

    def test_iso_string_with_z_accepted_as_utc(self) -> None:
        m = _Stamped.model_validate({"when": "2026-01-01T12:00:00Z"})
        assert m.when == datetime(2026, 1, 1, 12, 0, tzinfo=UTC)

    def test_other_offset_stored_as_utc(self) -> None:
        m = _Stamped(when=datetime(2026, 1, 1, 7, 0, tzinfo=EASTERN))
        assert m.when.tzinfo == UTC
        assert m.when.hour == 12


class TestRecordTimestamp:
    def test_default_ingestion_time_is_utc_aware(self) -> None:
        ts = RecordTimestamp(source_time=utc_now())
        assert ts.ingestion_time.tzinfo == UTC

    @pytest.mark.parametrize("field", ["source_time", "server_time", "ingestion_time", "sent_time"])
    def test_naive_field_rejected(self, field: str) -> None:
        kwargs = {"source_time": utc_now(), field: NAIVE}
        with pytest.raises(ValidationError, match=f"{field} must be timezone-aware"):
            RecordTimestamp(**kwargs)

    def test_time_bases_are_the_wire_fields_only(self) -> None:
        """A view trends against a wire timestamp; the kept spoke stamp is not a basis."""
        assert set(RecordTimestamp.TIME_BASES) == {"source_time", "server_time", "ingestion_time"}
        assert set(RecordTimestamp.TIME_BASES) < set(RecordTimestamp.model_fields)
        assert "sent_time" not in RecordTimestamp.TIME_BASES

    def test_server_time_none_allowed(self) -> None:
        assert RecordTimestamp(source_time=utc_now()).server_time is None

    def test_json_without_offset_rejected(self) -> None:
        with pytest.raises(ValidationError, match="source_time must be timezone-aware"):
            RecordTimestamp.model_validate({"source_time": "2026-01-01T12:00:00"})

    def test_json_with_offset_stored_as_utc(self) -> None:
        ts = RecordTimestamp.model_validate({"source_time": "2026-01-01T07:00:00-05:00"})
        assert ts.source_time == datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
        assert ts.model_dump(mode="json")["source_time"] == "2026-01-01T12:00:00Z"


class TestForgeOwnStamps:
    """Every stamp Forge makes on its own records is UTC-aware, and naive input is refused."""

    @staticmethod
    def _product(**overrides: object) -> DataProduct:
        kwargs: dict[str, object] = {
            "product_id": "p",
            "name": "n",
            "description": "d",
            "owner": "o",
            "schema": DataProductSchema(schema_ref="forge://schemas/test/v1", version="1"),
        }
        kwargs.update(overrides)
        return DataProduct(**kwargs)  # type: ignore[arg-type]

    def test_data_product_stamps(self) -> None:
        p = self._product()
        assert p.created_at.tzinfo == UTC
        assert p.updated_at.tzinfo == UTC
        with pytest.raises(ValidationError, match="created_at must be timezone-aware"):
            self._product(created_at=NAIVE)

    def test_decision_stamps(self) -> None:
        ev = EvidenceLink(
            evidence_type=EvidenceType.SUPPORTING,
            description="d",
            source_ref="forge://x",
            added_by="me",
        )
        assert ev.added_at.tzinfo == UTC
        a = Assumption(description="d", owner="me")
        assert a.created_at.tzinfo == UTC
        frame = DecisionFrame(scope="s", hypothesis="h", owner="me")
        assert frame.created_at.tzinfo == UTC
        assert frame.updated_at.tzinfo == UTC
        with pytest.raises(ValidationError, match="reassessment_date must be timezone-aware"):
            Assumption(description="d", owner="me", reassessment_date=NAIVE)
        with pytest.raises(ValidationError, match="closed_at must be timezone-aware"):
            DecisionFrame(scope="s", hypothesis="h", owner="me", closed_at=NAIVE)
