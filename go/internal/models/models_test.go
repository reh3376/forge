package models_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	forgev1 "github.com/reh3376/forge/gen/forge/v1"
	"github.com/reh3376/forge/internal/models"
	"google.golang.org/protobuf/proto"
)

// ---------------------------------------------------------------------------
// ContextualRecord
// ---------------------------------------------------------------------------

func TestNewContextualRecord(t *testing.T) {
	src := models.RecordSource{AdapterID: "whk-wms", System: "whk-wms-prod"}
	ts := models.RecordTimestamp{SourceTime: time.Now().UTC()}
	val := models.RecordValue{Raw: 78.4, Quality: models.QualityGood, DataType: "float64"}
	lin := models.RecordLineage{SchemaRef: "forge://schemas/test/v1", AdapterID: "whk-wms", AdapterVersion: "0.1.0"}

	rec := models.NewContextualRecord(src, ts, val, lin)

	if rec.RecordID == uuid.Nil {
		t.Error("expected non-nil UUID")
	}
	if rec.Source.AdapterID != "whk-wms" {
		t.Errorf("adapter_id: got %q", rec.Source.AdapterID)
	}
	if rec.Timestamp.IngestionTime.IsZero() {
		t.Error("expected non-zero ingestion_time")
	}
}

func TestContextualRecordJSONRoundTrip(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Millisecond)
	rec := models.ContextualRecord{
		RecordID: uuid.New(),
		Source:   models.RecordSource{AdapterID: "test", System: "sys"},
		Timestamp: models.RecordTimestamp{
			SourceTime:    now,
			IngestionTime: now,
		},
		Value:   models.RecordValue{Raw: "hello", Quality: models.QualityGood, DataType: "string"},
		Context: models.RecordContext{Site: "WHK-Main", EquipmentID: "E1"},
		Lineage: models.RecordLineage{SchemaRef: "s", AdapterID: "a", AdapterVersion: "v"},
	}

	data, err := json.Marshal(rec)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var rec2 models.ContextualRecord
	if err := json.Unmarshal(data, &rec2); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if rec2.RecordID != rec.RecordID {
		t.Errorf("record_id mismatch: %v != %v", rec2.RecordID, rec.RecordID)
	}
	if rec2.Context.Site != "WHK-Main" {
		t.Errorf("site: got %q", rec2.Context.Site)
	}
}

func TestQualityCodeValues(t *testing.T) {
	codes := []models.QualityCode{
		models.QualityGood,
		models.QualityUncertain,
		models.QualityBad,
		models.QualityNotAvailable,
	}
	for _, c := range codes {
		if c == "" {
			t.Error("empty quality code")
		}
	}
}

func TestRecordContextExtra(t *testing.T) {
	ctx := models.RecordContext{
		Extra: map[string]any{
			"custom_field": "value",
			"numeric":      42.0,
		},
	}
	if ctx.Extra["custom_field"] != "value" {
		t.Errorf("extra: got %v", ctx.Extra["custom_field"])
	}
}

// ---------------------------------------------------------------------------
// ContextualRecord proto round-trip
// ---------------------------------------------------------------------------

func TestContextualRecordProtoRoundTrip(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Microsecond) // proto timestamp precision
	serverTime := now.Add(-time.Second)
	rec := &models.ContextualRecord{
		RecordID: uuid.New(),
		Source: models.RecordSource{
			AdapterID:    "whk-wms",
			System:       "whk-wms-prod",
			TagPath:      "Area1/Fermenter3/Temperature",
			ConnectionID: "conn-001",
		},
		Timestamp: models.RecordTimestamp{
			SourceTime:    now,
			ServerTime:    &serverTime,
			IngestionTime: now,
		},
		Value: models.RecordValue{
			Raw:              72.5,
			EngineeringUnits: "°F",
			Quality:          models.QualityGood,
			DataType:         "float64",
		},
		Context: models.RecordContext{
			EquipmentID:   "FERM-001",
			Area:          "Fermentation",
			Site:          "WHK-Main",
			BatchID:       "B001",
			LotID:         "L001",
			RecipeID:      "R001",
			OperatingMode: "PRODUCTION",
			Shift:         "Day",
			OperatorID:    "op-001",
			Extra:         map[string]any{"custom": "val"},
		},
		Lineage: models.RecordLineage{
			SchemaRef:           "forge://schemas/whk-wms/v1",
			AdapterID:           "whk-wms",
			AdapterVersion:      "0.1.0",
			TransformationChain: []string{"normalize", "enrich"},
		},
	}

	// Domain -> Proto
	pb := models.ContextualRecordToProto(rec)

	// Proto -> wire -> Proto (verify proto marshal/unmarshal)
	wire, err := proto.Marshal(pb)
	if err != nil {
		t.Fatalf("proto marshal: %v", err)
	}
	pb2 := new(forgev1.ContextualRecord)
	if err := proto.Unmarshal(wire, pb2); err != nil {
		t.Fatalf("proto unmarshal: %v", err)
	}

	// Proto -> Domain
	rec2 := models.ContextualRecordFromProto(pb2)

	// Verify identity
	if rec2.RecordID != rec.RecordID {
		t.Errorf("record_id: %v != %v", rec2.RecordID, rec.RecordID)
	}
	if rec2.Source.AdapterID != rec.Source.AdapterID {
		t.Errorf("adapter_id: %q != %q", rec2.Source.AdapterID, rec.Source.AdapterID)
	}
	if rec2.Source.TagPath != rec.Source.TagPath {
		t.Errorf("tag_path: %q != %q", rec2.Source.TagPath, rec.Source.TagPath)
	}
	if rec2.Value.Raw != rec.Value.Raw {
		t.Errorf("raw: %v != %v", rec2.Value.Raw, rec.Value.Raw)
	}
	if rec2.Value.EngineeringUnits != rec.Value.EngineeringUnits {
		t.Errorf("units: %q != %q", rec2.Value.EngineeringUnits, rec.Value.EngineeringUnits)
	}
	if rec2.Value.Quality != rec.Value.Quality {
		t.Errorf("quality: %v != %v", rec2.Value.Quality, rec.Value.Quality)
	}
	if rec2.Context.EquipmentID != rec.Context.EquipmentID {
		t.Errorf("equipment_id: %q != %q", rec2.Context.EquipmentID, rec.Context.EquipmentID)
	}
	if rec2.Context.Site != rec.Context.Site {
		t.Errorf("site: %q != %q", rec2.Context.Site, rec.Context.Site)
	}
	if rec2.Context.Shift != rec.Context.Shift {
		t.Errorf("shift: %q != %q", rec2.Context.Shift, rec.Context.Shift)
	}
	if rec2.Lineage.SchemaRef != rec.Lineage.SchemaRef {
		t.Errorf("schema_ref: %q != %q", rec2.Lineage.SchemaRef, rec.Lineage.SchemaRef)
	}
	if len(rec2.Lineage.TransformationChain) != 2 {
		t.Errorf("transformation_chain len: %d", len(rec2.Lineage.TransformationChain))
	}
}

func TestRecordValueVariants(t *testing.T) {
	tests := []struct {
		name string
		raw  any
	}{
		{"float64", 72.5},
		{"int64", int64(42)},
		{"string", "hello"},
		{"bool", true},
		{"bytes", []byte("binary")},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := &models.ContextualRecord{
				RecordID: uuid.New(),
				Source:   models.RecordSource{AdapterID: "test", System: "sys"},
				Timestamp: models.RecordTimestamp{
					SourceTime:    time.Now().UTC(),
					IngestionTime: time.Now().UTC(),
				},
				Value:   models.RecordValue{Raw: tc.raw, Quality: models.QualityGood, DataType: tc.name},
				Context: models.RecordContext{},
				Lineage: models.RecordLineage{SchemaRef: "s", AdapterID: "a", AdapterVersion: "v"},
			}

			pb := models.ContextualRecordToProto(rec)
			rec2 := models.ContextualRecordFromProto(pb)

			// bytes are not comparable with ==, handle separately
			if b, ok := tc.raw.([]byte); ok {
				b2, ok2 := rec2.Value.Raw.([]byte)
				if !ok2 {
					t.Errorf("raw: expected []byte, got %T", rec2.Value.Raw)
				} else if string(b) != string(b2) {
					t.Errorf("bytes mismatch")
				}
			} else if rec2.Value.Raw != tc.raw {
				t.Errorf("raw: got %v (%T), want %v (%T)", rec2.Value.Raw, rec2.Value.Raw, tc.raw, tc.raw)
			}
		})
	}
}

func TestQualityCodeProtoRoundTrip(t *testing.T) {
	codes := []models.QualityCode{
		models.QualityGood,
		models.QualityUncertain,
		models.QualityBad,
		models.QualityNotAvailable,
	}
	for _, code := range codes {
		rec := &models.ContextualRecord{
			RecordID: uuid.New(),
			Source:   models.RecordSource{AdapterID: "t", System: "s"},
			Timestamp: models.RecordTimestamp{
				SourceTime:    time.Now().UTC(),
				IngestionTime: time.Now().UTC(),
			},
			Value:   models.RecordValue{Raw: 1.0, Quality: code, DataType: "float64"},
			Lineage: models.RecordLineage{SchemaRef: "s", AdapterID: "a", AdapterVersion: "v"},
		}
		pb := models.ContextualRecordToProto(rec)
		rec2 := models.ContextualRecordFromProto(pb)
		if rec2.Value.Quality != code {
			t.Errorf("quality %q: got %q", code, rec2.Value.Quality)
		}
	}
}

// ---------------------------------------------------------------------------
// Adapter models
// ---------------------------------------------------------------------------

func TestAdapterManifestConstruction(t *testing.T) {
	m := models.AdapterManifest{
		AdapterID:            "whk-wms",
		Name:                 "WHK WMS Adapter",
		Version:              "0.1.0",
		Type:                 "INGESTION",
		Protocol:             "graphql+amqp",
		Tier:                 models.AdapterTierERPBusiness,
		Capabilities:         models.DefaultAdapterCapabilities(),
		DataContract:         models.DataContract{SchemaRef: "forge://schemas/whk-wms/v1", OutputFormat: "contextual_record"},
		HealthCheckIntervalMs: 5000,
		AuthMethods:          []string{"azure_entra_id"},
	}

	if m.AdapterID != "whk-wms" {
		t.Errorf("adapter_id: %q", m.AdapterID)
	}
	if !m.Capabilities.Read {
		t.Error("expected read=true from defaults")
	}
	if m.Capabilities.Write {
		t.Error("expected write=false from defaults")
	}
}

func TestAdapterManifestJSONRoundTrip(t *testing.T) {
	m := models.AdapterManifest{
		AdapterID: "test",
		Name:      "Test",
		Version:   "1.0",
		Protocol:  "grpc",
		Tier:      models.AdapterTierOT,
		DataContract: models.DataContract{
			SchemaRef:    "ref",
			OutputFormat: "contextual_record",
		},
	}

	data, err := json.Marshal(m)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var m2 models.AdapterManifest
	if err := json.Unmarshal(data, &m2); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if m2.AdapterID != m.AdapterID {
		t.Errorf("adapter_id: %q != %q", m2.AdapterID, m.AdapterID)
	}
	if m2.Tier != models.AdapterTierOT {
		t.Errorf("tier: %q", m2.Tier)
	}
}

func TestAdapterManifestProtoRoundTrip(t *testing.T) {
	m := &models.AdapterManifest{
		AdapterID:            "whk-wms",
		Name:                 "WHK WMS",
		Version:              "0.1.0",
		Type:                 "INGESTION",
		Protocol:             "graphql+amqp",
		Tier:                 models.AdapterTierERPBusiness,
		Capabilities:         models.AdapterCapabilities{Read: true, Subscribe: true, Discover: true},
		DataContract:         models.DataContract{SchemaRef: "ref", OutputFormat: "contextual_record", ContextFields: []string{"equipment_id", "batch_id"}},
		HealthCheckIntervalMs: 5000,
		ConnectionParams: []models.ConnectionParam{
			{Name: "host", Description: "API host", Required: true},
			{Name: "api_key", Required: true, Secret: true},
		},
		AuthMethods: []string{"azure_entra_id", "bearer_token"},
		Metadata:    map[string]any{"env": "prod"},
	}

	pb := models.AdapterManifestToProto(m)
	m2 := models.AdapterManifestFromProto(pb)

	if m2.AdapterID != m.AdapterID {
		t.Errorf("adapter_id: %q != %q", m2.AdapterID, m.AdapterID)
	}
	if m2.Tier != m.Tier {
		t.Errorf("tier: %q != %q", m2.Tier, m.Tier)
	}
	if m2.Capabilities.Subscribe != true {
		t.Error("expected subscribe=true")
	}
	if len(m2.ConnectionParams) != 2 {
		t.Fatalf("connection_params: got %d", len(m2.ConnectionParams))
	}
	if m2.ConnectionParams[1].Secret != true {
		t.Error("expected api_key secret=true")
	}
	if m2.DataContract.SchemaRef != "ref" {
		t.Errorf("schema_ref: %q", m2.DataContract.SchemaRef)
	}
	if len(m2.DataContract.ContextFields) != 2 {
		t.Errorf("context_fields: %d", len(m2.DataContract.ContextFields))
	}
}

func TestAdapterHealthProtoRoundTrip(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Microsecond)
	h := &models.AdapterHealth{
		AdapterID:        "whk-wms",
		State:            models.AdapterStateHealthy,
		LastCheck:        &now,
		LastHealthy:      &now,
		ErrorMessage:     "",
		RecordsCollected: 1000,
		RecordsFailed:    5,
		UptimeSeconds:    3600.5,
	}

	pb := models.AdapterHealthToProto(h)
	h2 := models.AdapterHealthFromProto(pb)

	if h2.AdapterID != h.AdapterID {
		t.Errorf("adapter_id: %q", h2.AdapterID)
	}
	if h2.State != models.AdapterStateHealthy {
		t.Errorf("state: %q", h2.State)
	}
	if h2.RecordsCollected != 1000 {
		t.Errorf("records_collected: %d", h2.RecordsCollected)
	}
	if h2.UptimeSeconds != 3600.5 {
		t.Errorf("uptime: %f", h2.UptimeSeconds)
	}
}

func TestAdapterTierRoundTrip(t *testing.T) {
	tiers := []models.AdapterTier{
		models.AdapterTierOT,
		models.AdapterTierMESMOM,
		models.AdapterTierERPBusiness,
		models.AdapterTierHistorian,
		models.AdapterTierDocument,
	}
	for _, tier := range tiers {
		m := &models.AdapterManifest{
			AdapterID: "test",
			Tier:      tier,
			DataContract: models.DataContract{SchemaRef: "ref"},
		}
		pb := models.AdapterManifestToProto(m)
		m2 := models.AdapterManifestFromProto(pb)
		if m2.Tier != tier {
			t.Errorf("tier %q: got %q", tier, m2.Tier)
		}
	}
}

func TestAdapterStateRoundTrip(t *testing.T) {
	states := []models.AdapterState{
		models.AdapterStateRegistered,
		models.AdapterStateConnecting,
		models.AdapterStateHealthy,
		models.AdapterStateDegraded,
		models.AdapterStateFailed,
		models.AdapterStateStopped,
	}
	for _, state := range states {
		h := &models.AdapterHealth{AdapterID: "test", State: state}
		pb := models.AdapterHealthToProto(h)
		h2 := models.AdapterHealthFromProto(pb)
		if h2.State != state {
			t.Errorf("state %q: got %q", state, h2.State)
		}
	}
}
