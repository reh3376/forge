package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/structpb"
	"google.golang.org/protobuf/types/known/timestamppb"

	forgev1 "github.com/reh3376/forge/gen/forge/v1"
)

// ---------------------------------------------------------------------------
// ContextualRecord converters
// ---------------------------------------------------------------------------

// ContextualRecordToProto converts a domain ContextualRecord to its proto form.
func ContextualRecordToProto(r *ContextualRecord) *forgev1.ContextualRecord {
	pb := &forgev1.ContextualRecord{
		RecordId: r.RecordID.String(),
		Source: &forgev1.RecordSource{
			AdapterId:    r.Source.AdapterID,
			System:       r.Source.System,
			TagPath:      r.Source.TagPath,
			ConnectionId: r.Source.ConnectionID,
		},
		Timestamp: recordTimestampToProto(&r.Timestamp),
		Value:     recordValueToProto(&r.Value),
		Context:   recordContextToProto(&r.Context),
		Lineage: &forgev1.RecordLineage{
			SchemaRef:           r.Lineage.SchemaRef,
			AdapterId:           r.Lineage.AdapterID,
			AdapterVersion:      r.Lineage.AdapterVersion,
			TransformationChain: r.Lineage.TransformationChain,
		},
	}
	return pb
}

// ContextualRecordFromProto converts a proto ContextualRecord to a domain struct.
func ContextualRecordFromProto(pb *forgev1.ContextualRecord) *ContextualRecord {
	r := &ContextualRecord{
		Source: RecordSource{
			AdapterID:    pb.Source.GetAdapterId(),
			System:       pb.Source.GetSystem(),
			TagPath:      pb.Source.GetTagPath(),
			ConnectionID: pb.Source.GetConnectionId(),
		},
		Timestamp: recordTimestampFromProto(pb.Timestamp),
		Value:     recordValueFromProto(pb.Value),
		Context:   recordContextFromProto(pb.Context),
		Lineage: RecordLineage{
			SchemaRef:           pb.Lineage.GetSchemaRef(),
			AdapterID:           pb.Lineage.GetAdapterId(),
			AdapterVersion:      pb.Lineage.GetAdapterVersion(),
			TransformationChain: pb.Lineage.GetTransformationChain(),
		},
	}

	if id, err := uuid.Parse(pb.RecordId); err == nil {
		r.RecordID = id
	}

	return r
}

func recordTimestampToProto(ts *RecordTimestamp) *forgev1.RecordTimestamp {
	pb := &forgev1.RecordTimestamp{
		SourceTime: timestamppb.New(ts.SourceTime),
	}
	if ts.ServerTime != nil {
		pb.ServerTime = timestamppb.New(*ts.ServerTime)
	}
	if !ts.IngestionTime.IsZero() {
		pb.IngestionTime = timestamppb.New(ts.IngestionTime)
	}
	return pb
}

func recordTimestampFromProto(pb *forgev1.RecordTimestamp) RecordTimestamp {
	ts := RecordTimestamp{}
	if pb == nil {
		return ts
	}
	if pb.SourceTime != nil {
		ts.SourceTime = pb.SourceTime.AsTime()
	}
	if pb.ServerTime != nil {
		t := pb.ServerTime.AsTime()
		ts.ServerTime = &t
	}
	if pb.IngestionTime != nil {
		ts.IngestionTime = pb.IngestionTime.AsTime()
	}
	return ts
}

func recordValueToProto(v *RecordValue) *forgev1.RecordValue {
	pb := &forgev1.RecordValue{
		EngineeringUnits: v.EngineeringUnits,
		Quality:          qualityCodeToProto(v.Quality),
		DataType:         v.DataType,
	}

	// Map the raw value to the appropriate oneof variant.
	switch val := v.Raw.(type) {
	case float64:
		pb.TypedValue = &forgev1.RecordValue_NumberValue{NumberValue: val}
	case float32:
		pb.TypedValue = &forgev1.RecordValue_NumberValue{NumberValue: float64(val)}
	case int:
		pb.TypedValue = &forgev1.RecordValue_IntegerValue{IntegerValue: int64(val)}
	case int64:
		pb.TypedValue = &forgev1.RecordValue_IntegerValue{IntegerValue: val}
	case string:
		pb.TypedValue = &forgev1.RecordValue_StringValue{StringValue: val}
	case bool:
		pb.TypedValue = &forgev1.RecordValue_BoolValue{BoolValue: val}
	case []byte:
		pb.TypedValue = &forgev1.RecordValue_BytesValue{BytesValue: val}
	default:
		// Complex types: JSON-encode for the json_value variant.
		if val != nil {
			data, err := json.Marshal(val)
			if err == nil {
				pb.TypedValue = &forgev1.RecordValue_JsonValue{JsonValue: string(data)}
			}
		}
	}

	return pb
}

func recordValueFromProto(pb *forgev1.RecordValue) RecordValue {
	v := RecordValue{
		EngineeringUnits: pb.GetEngineeringUnits(),
		Quality:          qualityCodeFromProto(pb.GetQuality()),
		DataType:         pb.GetDataType(),
	}

	switch tv := pb.GetTypedValue().(type) {
	case *forgev1.RecordValue_NumberValue:
		v.Raw = tv.NumberValue
	case *forgev1.RecordValue_IntegerValue:
		v.Raw = tv.IntegerValue
	case *forgev1.RecordValue_StringValue:
		v.Raw = tv.StringValue
	case *forgev1.RecordValue_BoolValue:
		v.Raw = tv.BoolValue
	case *forgev1.RecordValue_BytesValue:
		v.Raw = tv.BytesValue
	case *forgev1.RecordValue_JsonValue:
		// Attempt to unmarshal; fall back to raw string.
		var decoded any
		if err := json.Unmarshal([]byte(tv.JsonValue), &decoded); err == nil {
			v.Raw = decoded
		} else {
			v.Raw = tv.JsonValue
		}
	}

	return v
}

func recordContextToProto(c *RecordContext) *forgev1.RecordContext {
	pb := &forgev1.RecordContext{
		EquipmentId:   c.EquipmentID,
		Area:          c.Area,
		Site:          c.Site,
		BatchId:       c.BatchID,
		LotId:         c.LotID,
		RecipeId:      c.RecipeID,
		OperatingMode: c.OperatingMode,
		Shift:         c.Shift,
		OperatorId:    c.OperatorID,
	}
	if len(c.Extra) > 0 {
		pb.Extra = make(map[string]string, len(c.Extra))
		for k, v := range c.Extra {
			switch val := v.(type) {
			case string:
				pb.Extra[k] = val
			default:
				data, err := json.Marshal(val)
				if err == nil {
					pb.Extra[k] = string(data)
				}
			}
		}
	}
	return pb
}

func recordContextFromProto(pb *forgev1.RecordContext) RecordContext {
	c := RecordContext{}
	if pb == nil {
		return c
	}
	c.EquipmentID = pb.EquipmentId
	c.Area = pb.Area
	c.Site = pb.Site
	c.BatchID = pb.BatchId
	c.LotID = pb.LotId
	c.RecipeID = pb.RecipeId
	c.OperatingMode = pb.OperatingMode
	c.Shift = pb.Shift
	c.OperatorID = pb.OperatorId

	if len(pb.Extra) > 0 {
		c.Extra = make(map[string]any, len(pb.Extra))
		for k, v := range pb.Extra {
			c.Extra[k] = v
		}
	}
	return c
}

func qualityCodeToProto(q QualityCode) forgev1.QualityCode {
	switch q {
	case QualityGood:
		return forgev1.QualityCode_QUALITY_CODE_GOOD
	case QualityUncertain:
		return forgev1.QualityCode_QUALITY_CODE_UNCERTAIN
	case QualityBad:
		return forgev1.QualityCode_QUALITY_CODE_BAD
	case QualityNotAvailable:
		return forgev1.QualityCode_QUALITY_CODE_NOT_AVAILABLE
	default:
		return forgev1.QualityCode_QUALITY_CODE_UNSPECIFIED
	}
}

func qualityCodeFromProto(q forgev1.QualityCode) QualityCode {
	switch q {
	case forgev1.QualityCode_QUALITY_CODE_GOOD:
		return QualityGood
	case forgev1.QualityCode_QUALITY_CODE_UNCERTAIN:
		return QualityUncertain
	case forgev1.QualityCode_QUALITY_CODE_BAD:
		return QualityBad
	case forgev1.QualityCode_QUALITY_CODE_NOT_AVAILABLE:
		return QualityNotAvailable
	default:
		return QualityGood
	}
}

// ---------------------------------------------------------------------------
// AdapterManifest converters
// ---------------------------------------------------------------------------

// AdapterManifestToProto converts a domain AdapterManifest to its proto form.
func AdapterManifestToProto(m *AdapterManifest) *forgev1.AdapterManifest {
	pb := &forgev1.AdapterManifest{
		AdapterId:            m.AdapterID,
		Name:                 m.Name,
		Version:              m.Version,
		Type:                 m.Type,
		Protocol:             m.Protocol,
		Tier:                 adapterTierToProto(m.Tier),
		HealthCheckIntervalMs: int32(m.HealthCheckIntervalMs),
		AuthMethods:          m.AuthMethods,
	}

	pb.Capabilities = &forgev1.AdapterCapabilities{
		Read:      m.Capabilities.Read,
		Write:     m.Capabilities.Write,
		Subscribe: m.Capabilities.Subscribe,
		Backfill:  m.Capabilities.Backfill,
		Discover:  m.Capabilities.Discover,
	}

	pb.DataContract = &forgev1.DataContract{
		SchemaRef:     m.DataContract.SchemaRef,
		OutputFormat:  m.DataContract.OutputFormat,
		ContextFields: m.DataContract.ContextFields,
	}

	for _, cp := range m.ConnectionParams {
		pb.ConnectionParams = append(pb.ConnectionParams, &forgev1.ConnectionParam{
			Name:         cp.Name,
			Description:  cp.Description,
			Required:     cp.Required,
			Secret:       cp.Secret,
			DefaultValue: cp.Default,
		})
	}

	if len(m.Metadata) > 0 {
		pb.Metadata, _ = structpb.NewStruct(m.Metadata)
	}

	return pb
}

// AdapterManifestFromProto converts a proto AdapterManifest to a domain struct.
func AdapterManifestFromProto(pb *forgev1.AdapterManifest) *AdapterManifest {
	m := &AdapterManifest{
		AdapterID:            pb.GetAdapterId(),
		Name:                 pb.GetName(),
		Version:              pb.GetVersion(),
		Type:                 pb.GetType(),
		Protocol:             pb.GetProtocol(),
		Tier:                 adapterTierFromProto(pb.GetTier()),
		HealthCheckIntervalMs: int(pb.GetHealthCheckIntervalMs()),
		AuthMethods:          pb.GetAuthMethods(),
	}

	if caps := pb.GetCapabilities(); caps != nil {
		m.Capabilities = AdapterCapabilities{
			Read:      caps.Read,
			Write:     caps.Write,
			Subscribe: caps.Subscribe,
			Backfill:  caps.Backfill,
			Discover:  caps.Discover,
		}
	}

	if dc := pb.GetDataContract(); dc != nil {
		m.DataContract = DataContract{
			SchemaRef:     dc.SchemaRef,
			OutputFormat:  dc.OutputFormat,
			ContextFields: dc.ContextFields,
		}
	}

	for _, cp := range pb.GetConnectionParams() {
		m.ConnectionParams = append(m.ConnectionParams, ConnectionParam{
			Name:        cp.GetName(),
			Description: cp.GetDescription(),
			Required:    cp.GetRequired(),
			Secret:      cp.GetSecret(),
			Default:     cp.GetDefaultValue(),
		})
	}

	if pb.Metadata != nil {
		m.Metadata = pb.Metadata.AsMap()
	}

	return m
}

func adapterTierToProto(t AdapterTier) forgev1.AdapterTier {
	switch t {
	case AdapterTierOT:
		return forgev1.AdapterTier_ADAPTER_TIER_OT
	case AdapterTierMESMOM:
		return forgev1.AdapterTier_ADAPTER_TIER_MES_MOM
	case AdapterTierERPBusiness:
		return forgev1.AdapterTier_ADAPTER_TIER_ERP_BUSINESS
	case AdapterTierHistorian:
		return forgev1.AdapterTier_ADAPTER_TIER_HISTORIAN
	case AdapterTierDocument:
		return forgev1.AdapterTier_ADAPTER_TIER_DOCUMENT
	default:
		return forgev1.AdapterTier_ADAPTER_TIER_UNSPECIFIED
	}
}

func adapterTierFromProto(t forgev1.AdapterTier) AdapterTier {
	switch t {
	case forgev1.AdapterTier_ADAPTER_TIER_OT:
		return AdapterTierOT
	case forgev1.AdapterTier_ADAPTER_TIER_MES_MOM:
		return AdapterTierMESMOM
	case forgev1.AdapterTier_ADAPTER_TIER_ERP_BUSINESS:
		return AdapterTierERPBusiness
	case forgev1.AdapterTier_ADAPTER_TIER_HISTORIAN:
		return AdapterTierHistorian
	case forgev1.AdapterTier_ADAPTER_TIER_DOCUMENT:
		return AdapterTierDocument
	default:
		return AdapterTierOT
	}
}

// ---------------------------------------------------------------------------
// AdapterHealth converters
// ---------------------------------------------------------------------------

// AdapterHealthToProto converts a domain AdapterHealth to its proto form.
func AdapterHealthToProto(h *AdapterHealth) *forgev1.AdapterHealth {
	pb := &forgev1.AdapterHealth{
		AdapterId:        h.AdapterID,
		State:            adapterStateToProto(h.State),
		ErrorMessage:     h.ErrorMessage,
		RecordsCollected: h.RecordsCollected,
		RecordsFailed:    h.RecordsFailed,
		UptimeSeconds:    h.UptimeSeconds,
	}
	if h.LastCheck != nil {
		pb.LastCheck = timestamppb.New(*h.LastCheck)
	}
	if h.LastHealthy != nil {
		pb.LastHealthy = timestamppb.New(*h.LastHealthy)
	}
	return pb
}

// AdapterHealthFromProto converts a proto AdapterHealth to a domain struct.
func AdapterHealthFromProto(pb *forgev1.AdapterHealth) *AdapterHealth {
	h := &AdapterHealth{
		AdapterID:        pb.GetAdapterId(),
		State:            adapterStateFromProto(pb.GetState()),
		ErrorMessage:     pb.GetErrorMessage(),
		RecordsCollected: pb.GetRecordsCollected(),
		RecordsFailed:    pb.GetRecordsFailed(),
		UptimeSeconds:    pb.GetUptimeSeconds(),
	}
	if pb.LastCheck != nil {
		t := pb.LastCheck.AsTime()
		h.LastCheck = &t
	}
	if pb.LastHealthy != nil {
		t := pb.LastHealthy.AsTime()
		h.LastHealthy = &t
	}
	return h
}

func adapterStateToProto(s AdapterState) forgev1.AdapterState {
	switch s {
	case AdapterStateRegistered:
		return forgev1.AdapterState_ADAPTER_STATE_REGISTERED
	case AdapterStateConnecting:
		return forgev1.AdapterState_ADAPTER_STATE_CONNECTING
	case AdapterStateHealthy:
		return forgev1.AdapterState_ADAPTER_STATE_HEALTHY
	case AdapterStateDegraded:
		return forgev1.AdapterState_ADAPTER_STATE_DEGRADED
	case AdapterStateFailed:
		return forgev1.AdapterState_ADAPTER_STATE_FAILED
	case AdapterStateStopped:
		return forgev1.AdapterState_ADAPTER_STATE_STOPPED
	default:
		return forgev1.AdapterState_ADAPTER_STATE_UNSPECIFIED
	}
}

func adapterStateFromProto(s forgev1.AdapterState) AdapterState {
	switch s {
	case forgev1.AdapterState_ADAPTER_STATE_REGISTERED:
		return AdapterStateRegistered
	case forgev1.AdapterState_ADAPTER_STATE_CONNECTING:
		return AdapterStateConnecting
	case forgev1.AdapterState_ADAPTER_STATE_HEALTHY:
		return AdapterStateHealthy
	case forgev1.AdapterState_ADAPTER_STATE_DEGRADED:
		return AdapterStateDegraded
	case forgev1.AdapterState_ADAPTER_STATE_FAILED:
		return AdapterStateFailed
	case forgev1.AdapterState_ADAPTER_STATE_STOPPED:
		return AdapterStateStopped
	default:
		return AdapterStateRegistered
	}
}

// timePtr converts a time.Time to *time.Time (used internally).
func timePtr(t time.Time) *time.Time { return &t }
