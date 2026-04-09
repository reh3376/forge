"""Tests for the forge.dataset SDK module."""

import pytest

from forge.sdk.scripting.modules.dataset import Dataset, DatasetModule


# ---------------------------------------------------------------------------
# Dataset model
# ---------------------------------------------------------------------------


class TestDataset:
    """Tests for the Dataset dataclass."""

    def test_create_empty(self):
        ds = Dataset(columns=["a", "b"])
        assert ds.row_count == 0
        assert ds.column_count == 2

    def test_create_with_data(self):
        ds = Dataset(columns=["name", "value"], rows=[["tag1", 72.5], ["tag2", 42.0]])
        assert ds.row_count == 2
        assert ds.column_count == 2

    def test_get_value_by_index(self):
        ds = Dataset(columns=["name", "value"], rows=[["tag1", 72.5]])
        assert ds.get_value(0, 0) == "tag1"
        assert ds.get_value(0, 1) == 72.5

    def test_get_value_by_name(self):
        ds = Dataset(columns=["name", "value"], rows=[["tag1", 72.5]])
        assert ds.get_value(0, "name") == "tag1"
        assert ds.get_value(0, "value") == 72.5

    def test_set_value_by_index(self):
        ds = Dataset(columns=["name", "value"], rows=[["tag1", 72.5]])
        ds.set_value(0, 1, 99.9)
        assert ds.get_value(0, 1) == 99.9

    def test_set_value_by_name(self):
        ds = Dataset(columns=["name", "value"], rows=[["tag1", 72.5]])
        ds.set_value(0, "value", 99.9)
        assert ds.get_value(0, "value") == 99.9

    def test_add_row(self):
        ds = Dataset(columns=["a", "b"])
        ds.add_row([1, 2])
        assert ds.row_count == 1
        assert ds.get_value(0, 0) == 1

    def test_add_row_wrong_length(self):
        ds = Dataset(columns=["a", "b"])
        with pytest.raises(ValueError, match="2 columns"):
            ds.add_row([1, 2, 3])

    def test_delete_rows(self):
        ds = Dataset(columns=["a"], rows=[[1], [2], [3], [4]])
        ds.delete_rows([1, 3])
        assert ds.row_count == 2
        assert ds.get_value(0, 0) == 1
        assert ds.get_value(1, 0) == 3

    def test_get_column_headers(self):
        ds = Dataset(columns=["x", "y", "z"])
        assert ds.get_column_headers() == ["x", "y", "z"]

    def test_to_dicts(self):
        ds = Dataset(columns=["name", "value"], rows=[["tag1", 72.5], ["tag2", 42.0]])
        dicts = ds.to_dicts()
        assert len(dicts) == 2
        assert dicts[0] == {"name": "tag1", "value": 72.5}
        assert dicts[1] == {"name": "tag2", "value": 42.0}

    def test_to_json_roundtrip(self):
        ds = Dataset(columns=["a", "b"], rows=[[1, "x"], [2, "y"]])
        json_str = ds.to_json()
        ds2 = Dataset.from_json(json_str)
        assert ds2.columns == ds.columns
        assert ds2.rows == ds.rows

    def test_from_dicts(self):
        dicts = [{"name": "a", "val": 1}, {"name": "b", "val": 2}]
        ds = Dataset.from_dicts(dicts)
        assert ds.column_count == 2
        assert ds.row_count == 2
        assert ds.get_value(0, "name") == "a"

    def test_from_dicts_empty(self):
        ds = Dataset.from_dicts([])
        assert ds.column_count == 0
        assert ds.row_count == 0


# ---------------------------------------------------------------------------
# DatasetModule
# ---------------------------------------------------------------------------


class TestDatasetModule:
    """Tests for the DatasetModule."""

    def setup_method(self):
        self.dm = DatasetModule()

    def test_create(self):
        ds = self.dm.create(["a", "b"], [[1, 2], [3, 4]])
        assert ds.row_count == 2

    def test_create_empty(self):
        ds = self.dm.create(["a", "b"])
        assert ds.row_count == 0

    def test_to_csv(self):
        ds = self.dm.create(["name", "value"], [["tag1", "72.5"]])
        csv_text = self.dm.to_csv(ds)
        assert "name,value" in csv_text
        assert "tag1,72.5" in csv_text

    def test_from_csv(self):
        csv_text = "name,value\ntag1,72.5\ntag2,42.0\n"
        ds = self.dm.from_csv(csv_text)
        assert ds.column_count == 2
        assert ds.row_count == 2
        assert ds.get_value(0, "name") == "tag1"

    def test_add_row(self):
        ds = self.dm.create(["a"], [[1]])
        result = self.dm.add_row(ds, [2])
        assert result is ds
        assert ds.row_count == 2

    def test_delete_rows(self):
        ds = self.dm.create(["a"], [[1], [2], [3]])
        self.dm.delete_rows(ds, [1])
        assert ds.row_count == 2

    def test_set_value(self):
        ds = self.dm.create(["a"], [[1]])
        self.dm.set_value(ds, 0, "a", 99)
        assert ds.get_value(0, "a") == 99

    def test_get_column_headers(self):
        ds = self.dm.create(["x", "y"])
        assert self.dm.get_column_headers(ds) == ["x", "y"]

    def test_to_py_dataset(self):
        ds = self.dm.create(["a", "b"], [[1, 2]])
        dicts = self.dm.to_py_dataset(ds)
        assert len(dicts) == 1
        assert dicts[0] == {"a": 1, "b": 2}
