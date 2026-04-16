package manufacturing_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	mfg "github.com/reh3376/forge/internal/models/manufacturing"
)

func TestNewBase(t *testing.T) {
	base := mfg.NewBase("whk-wms", "BARREL-001")
	if base.ForgeID == uuid.Nil {
		t.Error("expected non-nil UUID")
	}
	if base.SourceSystem != "whk-wms" {
		t.Errorf("source_system: %q", base.SourceSystem)
	}
	if base.SourceID != "BARREL-001" {
		t.Errorf("source_id: %q", base.SourceID)
	}
	if base.CapturedAt.IsZero() {
		t.Error("expected non-zero captured_at")
	}
}

func TestManufacturingUnitConstruction(t *testing.T) {
	status := mfg.UnitStatusActive
	state := mfg.LifecycleAging
	qty := 53.0
	u := mfg.ManufacturingUnit{
		ManufacturingModelBase: mfg.NewBase("whk-wms", "B-001"),
		UnitType:               "barrel",
		SerialNumber:           "SN-12345",
		LotID:                  "LOT-001",
		Status:                 status,
		LifecycleState:         &state,
		Quantity:               &qty,
		UnitOfMeasure:          "gallons",
		ProductType:            "bourbon",
	}
	if u.UnitType != "barrel" {
		t.Errorf("unit_type: %q", u.UnitType)
	}
	if *u.LifecycleState != mfg.LifecycleAging {
		t.Errorf("lifecycle_state: %v", *u.LifecycleState)
	}
}

func TestManufacturingUnitJSONRoundTrip(t *testing.T) {
	u := mfg.ManufacturingUnit{
		ManufacturingModelBase: mfg.NewBase("whk-wms", "B-001"),
		UnitType:               "barrel",
		Status:                 mfg.UnitStatusActive,
	}

	data, err := json.Marshal(u)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var u2 mfg.ManufacturingUnit
	if err := json.Unmarshal(data, &u2); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if u2.UnitType != "barrel" {
		t.Errorf("unit_type: %q", u2.UnitType)
	}
	if u2.Status != mfg.UnitStatusActive {
		t.Errorf("status: %q", u2.Status)
	}
}

func TestLotConstruction(t *testing.T) {
	lot := mfg.Lot{
		ManufacturingModelBase: mfg.NewBase("whk-wms", "L-001"),
		LotNumber:              "2026-001",
		Status:                 "CREATED",
		ProductType:            "bourbon",
	}
	if lot.LotNumber != "2026-001" {
		t.Errorf("lot_number: %q", lot.LotNumber)
	}
}

func TestPhysicalAssetConstruction(t *testing.T) {
	asset := mfg.PhysicalAsset{
		ManufacturingModelBase: mfg.NewBase("whk-wms", "WH-A"),
		AssetType:              mfg.AssetTypeSite,
		Name:                   "Warehouse A",
		LocationPath:           "Enterprise/Site-1",
	}
	if asset.AssetType != mfg.AssetTypeSite {
		t.Errorf("asset_type: %q", asset.AssetType)
	}
}

func TestOperationalEventConstruction(t *testing.T) {
	evt := mfg.OperationalEvent{
		ManufacturingModelBase: mfg.NewBase("whk-wms", "EVT-001"),
		EventType:              "Entry",
		Severity:               mfg.EventSeverityInfo,
		EntityType:             "manufacturing_unit",
		EntityID:               "B-001",
		EventTime:              time.Now().UTC(),
	}
	if evt.EventType != "Entry" {
		t.Errorf("event_type: %q", evt.EventType)
	}
}

func TestBusinessEntityConstruction(t *testing.T) {
	e := mfg.BusinessEntity{
		ManufacturingModelBase: mfg.NewBase("whk-wms", "C-001"),
		EntityType:             mfg.EntityTypeCustomer,
		Name:                   "Acme Corp",
		ExternalIDs:            map[string]string{"erp": "C-12345"},
		IsActive:               true,
	}
	if e.EntityType != mfg.EntityTypeCustomer {
		t.Errorf("entity_type: %q", e.EntityType)
	}
	if e.ExternalIDs["erp"] != "C-12345" {
		t.Errorf("external_ids: %v", e.ExternalIDs)
	}
}

func TestProcessDefinitionConstruction(t *testing.T) {
	pd := mfg.ProcessDefinition{
		ManufacturingModelBase: mfg.NewBase("whk-mes", "R-001"),
		Name:                   "Bourbon Mash Recipe",
		Version:                "2.0",
		IsPublished:            true,
		Steps: []mfg.ProcessStep{
			{
				ManufacturingModelBase: mfg.NewBase("whk-mes", "S-001"),
				StepNumber:             1,
				Name:                   "Milling",
			},
			{
				ManufacturingModelBase: mfg.NewBase("whk-mes", "S-002"),
				StepNumber:             2,
				Name:                   "Mashing",
			},
		},
	}
	if len(pd.Steps) != 2 {
		t.Errorf("steps: %d", len(pd.Steps))
	}
	if pd.Steps[0].Name != "Milling" {
		t.Errorf("step[0].name: %q", pd.Steps[0].Name)
	}
}

func TestWorkOrderConstruction(t *testing.T) {
	wo := mfg.WorkOrder{
		ManufacturingModelBase: mfg.NewBase("whk-wms", "WO-001"),
		Title:                  "Transfer barrels to Warehouse B",
		OrderType:              "TRANSFER",
		Status:                 mfg.WorkOrderStatusPending,
		Priority:               mfg.WorkOrderPriorityNormal,
	}
	if wo.Status != mfg.WorkOrderStatusPending {
		t.Errorf("status: %q", wo.Status)
	}
}

func TestMaterialItemConstruction(t *testing.T) {
	item := mfg.MaterialItem{
		ManufacturingModelBase: mfg.NewBase("whk-wms", "I-001"),
		ItemNumber:             "BBL-53-WHT-OAK",
		Name:                   "53-gallon White Oak Barrel",
		Category:               "barrel",
		IsActive:               true,
	}
	if item.ItemNumber != "BBL-53-WHT-OAK" {
		t.Errorf("item_number: %q", item.ItemNumber)
	}
}

func TestQualitySampleConstruction(t *testing.T) {
	val := 90.0
	lower := 80.0
	upper := 100.0
	qs := mfg.QualitySample{
		ManufacturingModelBase: mfg.NewBase("whk-wms", "QS-001"),
		SampleType:             "proof_check",
		EntityType:             "manufacturing_unit",
		EntityID:               "B-001",
		OverallOutcome:         mfg.SampleOutcomePass,
		Results: []mfg.SampleResult{
			{
				ManufacturingModelBase: mfg.NewBase("whk-wms", "SR-001"),
				ParameterName:          "proof",
				MeasuredValue:          &val,
				LowerLimit:             &lower,
				UpperLimit:             &upper,
				Outcome:                mfg.SampleOutcomePass,
			},
		},
	}
	if qs.OverallOutcome != mfg.SampleOutcomePass {
		t.Errorf("outcome: %q", qs.OverallOutcome)
	}
	if len(qs.Results) != 1 {
		t.Fatalf("results: %d", len(qs.Results))
	}
	if *qs.Results[0].MeasuredValue != 90.0 {
		t.Errorf("measured_value: %f", *qs.Results[0].MeasuredValue)
	}
}

func TestProductionOrderConstruction(t *testing.T) {
	po := mfg.ProductionOrder{
		ManufacturingModelBase: mfg.NewBase("whk-mes", "PO-001"),
		OrderNumber:            "PO-2026-001",
		Status:                 mfg.OrderStatusInProgress,
		LotIDs:                 []string{"L-001", "L-002"},
	}
	if po.Status != mfg.OrderStatusInProgress {
		t.Errorf("status: %q", po.Status)
	}
	if len(po.LotIDs) != 2 {
		t.Errorf("lot_ids: %d", len(po.LotIDs))
	}
}

func TestWorkOrderDependencyConstruction(t *testing.T) {
	dep := mfg.WorkOrderDependency{
		ManufacturingModelBase: mfg.NewBase("whk-wms", "DEP-001"),
		DependentOrderID:       "WO-002",
		PrerequisiteOrderID:    "WO-001",
		DependencyType:         "BLOCKS",
	}
	if dep.DependencyType != "BLOCKS" {
		t.Errorf("dependency_type: %q", dep.DependencyType)
	}
}

// Verify all enum values are non-empty strings
func TestEnumValues(t *testing.T) {
	enums := []string{
		string(mfg.UnitStatusPending), string(mfg.UnitStatusActive), string(mfg.UnitStatusComplete),
		string(mfg.UnitStatusHeld), string(mfg.UnitStatusScrapped), string(mfg.UnitStatusTransferred),
		string(mfg.LifecycleCreated), string(mfg.LifecycleFilling), string(mfg.LifecycleInProcess),
		string(mfg.LifecycleAging), string(mfg.LifecycleInStorage), string(mfg.LifecycleInTransit),
		string(mfg.LifecycleSampling), string(mfg.LifecycleWithdrawn), string(mfg.LifecycleDumped),
		string(mfg.LifecycleComplete),
		string(mfg.AssetTypeEnterprise), string(mfg.AssetTypeSite), string(mfg.AssetTypeArea),
		string(mfg.AssetTypeWorkCenter), string(mfg.AssetTypeWorkUnit),
		string(mfg.AssetTypeStorageZone), string(mfg.AssetTypeStoragePosition),
		string(mfg.AssetTypeEquipment), string(mfg.AssetTypeStagingArea),
		string(mfg.AssetStateIdle), string(mfg.AssetStateRunning),
		string(mfg.AssetStateMaintenance), string(mfg.AssetStateChangeover),
		string(mfg.AssetStateOffline), string(mfg.AssetStateFaulted),
		string(mfg.EventSeverityInfo), string(mfg.EventSeverityWarning),
		string(mfg.EventSeverityError), string(mfg.EventSeverityCritical),
		string(mfg.EventCategoryProduction), string(mfg.EventCategoryQuality),
		string(mfg.EventCategoryLogistics), string(mfg.EventCategoryMaintenance),
		string(mfg.EventCategorySafety), string(mfg.EventCategoryCompliance),
		string(mfg.EntityTypeCustomer), string(mfg.EntityTypeVendor),
		string(mfg.EntityTypePartner), string(mfg.EntityTypeInternal),
		string(mfg.WorkOrderStatusDraft), string(mfg.WorkOrderStatusPending),
		string(mfg.WorkOrderStatusScheduled), string(mfg.WorkOrderStatusInProgress),
		string(mfg.WorkOrderStatusPaused), string(mfg.WorkOrderStatusComplete),
		string(mfg.WorkOrderStatusCancelled),
		string(mfg.WorkOrderPriorityLow), string(mfg.WorkOrderPriorityNormal),
		string(mfg.WorkOrderPriorityHigh), string(mfg.WorkOrderPriorityUrgent),
		string(mfg.OrderStatusDraft), string(mfg.OrderStatusPlanned),
		string(mfg.OrderStatusReleased), string(mfg.OrderStatusInProgress),
		string(mfg.OrderStatusPaused), string(mfg.OrderStatusComplete),
		string(mfg.OrderStatusClosed), string(mfg.OrderStatusCancelled),
		string(mfg.SampleOutcomePass), string(mfg.SampleOutcomeFail),
		string(mfg.SampleOutcomeInconclusive), string(mfg.SampleOutcomePending),
	}
	for i, e := range enums {
		if e == "" {
			t.Errorf("enum[%d] is empty", i)
		}
	}
}
