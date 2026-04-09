"""forge.dataset — Tabular data manipulation SDK module.

Replaces Ignition's ``system.dataset.*`` functions and the Java
``Dataset`` / ``BasicDataset`` types with Python-native data structures.

Ignition's dataset is a column-oriented Java object (BasicDataset).
Forge replaces it with a simple Python dataclass backed by column names
and row lists.  For interop with pandas (optional), use ``.to_dataframe()``.

Usage in scripts::

    import forge

    ds = forge.dataset.create(["name", "value"], [["TIT_2010", 72.5], ["LIT_6050B", 42.0]])
    rows = ds.to_dicts()
    csv_text = forge.dataset.to_csv(ds)
"""

from __future__ import annotations

import csv
import io
import json
import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger("forge.dataset")


# ---------------------------------------------------------------------------
# Dataset model
# ---------------------------------------------------------------------------


@dataclass
class Dataset:
    """A tabular dataset — Forge equivalent of Ignition's BasicDataset.

    Column-oriented storage with named columns and typed rows.
    """

    columns: list[str]
    rows: list[list[Any]] = field(default_factory=list)
    column_types: list[str] = field(default_factory=list)

    @property
    def row_count(self) -> int:
        return len(self.rows)

    @property
    def column_count(self) -> int:
        return len(self.columns)

    def get_value(self, row: int, col: int | str) -> Any:
        """Get a value by row index and column index or name.

        Replaces: ``dataset.getValueAt(row, col)``
        """
        if isinstance(col, str):
            col = self.columns.index(col)
        return self.rows[row][col]

    def set_value(self, row: int, col: int | str, value: Any) -> None:
        """Set a value by row index and column index or name.

        Replaces: ``system.dataset.setValue(dataset, row, col, value)``
        """
        if isinstance(col, str):
            col = self.columns.index(col)
        self.rows[row][col] = value

    def add_row(self, values: list[Any]) -> None:
        """Append a row to the dataset.

        Replaces: ``system.dataset.addRow(dataset, values)``
        """
        if len(values) != self.column_count:
            raise ValueError(
                f"Row has {len(values)} values but dataset has {self.column_count} columns"
            )
        self.rows.append(list(values))

    def delete_rows(self, indices: list[int]) -> None:
        """Delete rows by index (in reverse order to maintain indices).

        Replaces: ``system.dataset.deleteRows(dataset, indices)``
        """
        for idx in sorted(indices, reverse=True):
            del self.rows[idx]

    def get_column_headers(self) -> list[str]:
        """Get column names.

        Replaces: ``system.dataset.getColumnHeaders(dataset)``
        """
        return list(self.columns)

    def to_dicts(self) -> list[dict[str, Any]]:
        """Convert to a list of dicts (one per row).

        Replaces: ``system.dataset.toPyDataSet(dataset)``
        """
        return [dict(zip(self.columns, row)) for row in self.rows]

    def to_json(self) -> str:
        """Serialize the dataset to JSON."""
        return json.dumps(
            {"columns": self.columns, "rows": self.rows},
            default=str,
        )

    @classmethod
    def from_json(cls, json_str: str) -> Dataset:
        """Deserialize a dataset from JSON."""
        data = json.loads(json_str)
        return cls(columns=data["columns"], rows=data.get("rows", []))

    @classmethod
    def from_dicts(cls, dicts: list[dict[str, Any]]) -> Dataset:
        """Create a dataset from a list of dicts."""
        if not dicts:
            return cls(columns=[])
        columns = list(dicts[0].keys())
        rows = [[d.get(c) for c in columns] for d in dicts]
        return cls(columns=columns, rows=rows)


# ---------------------------------------------------------------------------
# DatasetModule
# ---------------------------------------------------------------------------


class DatasetModule:
    """The forge.dataset SDK module — tabular data manipulation."""

    def create(self, columns: list[str], rows: list[list[Any]] | None = None) -> Dataset:
        """Create a new dataset.

        Replaces: ``system.dataset.toDataSet(headers, data)``
        """
        return Dataset(columns=columns, rows=rows or [])

    def from_dicts(self, dicts: list[dict[str, Any]]) -> Dataset:
        """Create a dataset from a list of dicts.

        Replaces: converting a PyDataSet back to a Dataset.
        """
        return Dataset.from_dicts(dicts)

    def to_csv(self, ds: Dataset) -> str:
        """Convert a dataset to CSV text.

        Replaces: ``system.dataset.toCSV(dataset)``
        """
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(ds.columns)
        writer.writerows(ds.rows)
        return buf.getvalue()

    def from_csv(self, csv_text: str) -> Dataset:
        """Parse CSV text into a dataset."""
        reader = csv.reader(io.StringIO(csv_text))
        rows_iter = iter(reader)
        try:
            headers = next(rows_iter)
        except StopIteration:
            return Dataset(columns=[])
        rows = [row for row in rows_iter]
        return Dataset(columns=headers, rows=rows)

    def to_json(self, ds: Dataset) -> str:
        """Serialize a dataset to JSON."""
        return ds.to_json()

    def from_json(self, json_str: str) -> Dataset:
        """Deserialize a dataset from JSON."""
        return Dataset.from_json(json_str)

    def add_row(self, ds: Dataset, values: list[Any]) -> Dataset:
        """Add a row to a dataset (returns the same dataset, mutated).

        Replaces: ``system.dataset.addRow(dataset, values)``
        """
        ds.add_row(values)
        return ds

    def delete_rows(self, ds: Dataset, indices: list[int]) -> Dataset:
        """Delete rows from a dataset.

        Replaces: ``system.dataset.deleteRows(dataset, indices)``
        """
        ds.delete_rows(indices)
        return ds

    def set_value(self, ds: Dataset, row: int, col: int | str, value: Any) -> Dataset:
        """Set a value in a dataset.

        Replaces: ``system.dataset.setValue(dataset, row, col, value)``
        """
        ds.set_value(row, col, value)
        return ds

    def get_column_headers(self, ds: Dataset) -> list[str]:
        """Get column headers.

        Replaces: ``system.dataset.getColumnHeaders(dataset)``
        """
        return ds.get_column_headers()

    def to_py_dataset(self, ds: Dataset) -> list[dict[str, Any]]:
        """Convert to a list of dicts.

        Replaces: ``system.dataset.toPyDataSet(dataset)``
        """
        return ds.to_dicts()


# Module-level singleton
_instance = DatasetModule()

create = _instance.create
from_dicts = _instance.from_dicts
to_csv = _instance.to_csv
from_csv = _instance.from_csv
to_json = _instance.to_json
from_json = _instance.from_json
add_row = _instance.add_row
delete_rows = _instance.delete_rows
set_value = _instance.set_value
get_column_headers = _instance.get_column_headers
to_py_dataset = _instance.to_py_dataset
