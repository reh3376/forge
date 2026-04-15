package scaffold_test

import (
	"testing"

	forgev1 "github.com/reh3376/forge/gen/forge/v1"
	"github.com/reh3376/forge/gen/forge/v1/forgev1connect"
	scannerv1 "github.com/reh3376/forge/gen/scanner/v1"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func TestContextualRecordRoundTrip(t *testing.T) {
	rec := &forgev1.ContextualRecord{
		RecordId: "test-001",
		Source: &forgev1.RecordSource{
			AdapterId: "whk-wms",
			System:    "whk-wms-prod",
			TagPath:   "Area1/Fermenter3/Temperature",
		},
		Timestamp: &forgev1.RecordTimestamp{
			SourceTime: timestamppb.Now(),
		},
		Value: &forgev1.RecordValue{
			TypedValue:       &forgev1.RecordValue_NumberValue{NumberValue: 72.5},
			EngineeringUnits: "°F",
			Quality:          forgev1.QualityCode_QUALITY_CODE_GOOD,
			DataType:         "float64",
		},
		Context: &forgev1.RecordContext{
			EquipmentId: "FERM-001",
			Site:        "WHK-Main",
			Area:        "Fermentation",
		},
	}

	// Marshal -> Unmarshal round-trip
	data, err := proto.Marshal(rec)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	rec2 := &forgev1.ContextualRecord{}
	if err := proto.Unmarshal(data, rec2); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if rec2.RecordId != "test-001" {
		t.Errorf("record_id: got %q, want %q", rec2.RecordId, "test-001")
	}
	if rec2.Source.AdapterId != "whk-wms" {
		t.Errorf("adapter_id: got %q, want %q", rec2.Source.AdapterId, "whk-wms")
	}
	if rec2.Value.GetNumberValue() != 72.5 {
		t.Errorf("number_value: got %f, want 72.5", rec2.Value.GetNumberValue())
	}
	if rec2.Context.Site != "WHK-Main" {
		t.Errorf("site: got %q, want %q", rec2.Context.Site, "WHK-Main")
	}
}

func TestAdapterManifestFields(t *testing.T) {
	m := &forgev1.AdapterManifest{
		AdapterId: "whk-wms",
		Name:      "WHK WMS Adapter",
		Version:   "0.1.0",
		Type:      "INGESTION",
		Protocol:  "graphql+amqp",
		Tier:      forgev1.AdapterTier_ADAPTER_TIER_ERP_BUSINESS,
		Capabilities: &forgev1.AdapterCapabilities{
			Read:      true,
			Subscribe: true,
			Discover:  true,
		},
	}

	if m.AdapterId != "whk-wms" {
		t.Errorf("adapter_id: got %q", m.AdapterId)
	}
	if m.Tier != forgev1.AdapterTier_ADAPTER_TIER_ERP_BUSINESS {
		t.Errorf("tier: got %v", m.Tier)
	}
	if !m.Capabilities.Read {
		t.Error("expected read capability")
	}
}

func TestConnectGoHandlerExists(t *testing.T) {
	// Verify the Connect-Go generated handler name exists as a const.
	// This confirms buf generated the Connect-Go service stubs.
	name := forgev1connect.AdapterServiceName
	if name != "forge.v1.AdapterService" {
		t.Errorf("service name: got %q, want %q", name, "forge.v1.AdapterService")
	}
}

func TestScannerProtoCompiles(t *testing.T) {
	evt := &scannerv1.ScanEvent{
		ScanId:       "scan-001",
		BarcodeValue: "ABC123",
		ScanType:     scannerv1.ScanType_SCAN_TYPE_ENTRY,
		OperatorId:   "op-001",
		DeviceId:     "dev-001",
	}

	if evt.ScanId != "scan-001" {
		t.Errorf("scan_id: got %q", evt.ScanId)
	}
	if evt.ScanType != scannerv1.ScanType_SCAN_TYPE_ENTRY {
		t.Errorf("scan_type: got %v", evt.ScanType)
	}
}
