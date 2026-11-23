package models

import "time"

// AdapterTier indicates which system tier an adapter connects to.
type AdapterTier string

const (
	AdapterTierOT          AdapterTier = "OT"
	AdapterTierMESMOM      AdapterTier = "MES_MOM"
	AdapterTierERPBusiness AdapterTier = "ERP_BUSINESS"
	AdapterTierHistorian   AdapterTier = "HISTORIAN"
	AdapterTierDocument    AdapterTier = "DOCUMENT"
)

// AdapterState represents the adapter lifecycle state machine.
type AdapterState string

const (
	AdapterStateRegistered AdapterState = "REGISTERED"
	AdapterStateConnecting AdapterState = "CONNECTING"
	AdapterStateHealthy    AdapterState = "HEALTHY"
	AdapterStateDegraded   AdapterState = "DEGRADED"
	AdapterStateFailed     AdapterState = "FAILED"
	AdapterStateStopped    AdapterState = "STOPPED"
)

// AdapterCapabilities declares what an adapter can do.
type AdapterCapabilities struct {
	Read      bool `json:"read"`
	Write     bool `json:"write"`
	Subscribe bool `json:"subscribe"`
	Backfill  bool `json:"backfill"`
	Discover  bool `json:"discover"`
}

// DefaultAdapterCapabilities returns capabilities with read=true, all others false.
func DefaultAdapterCapabilities() AdapterCapabilities {
	return AdapterCapabilities{Read: true}
}

// ConnectionParam describes a parameter required to connect to the source system.
type ConnectionParam struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Required    bool   `json:"required"`
	Secret      bool   `json:"secret"`
	Default     string `json:"default,omitempty"`
}

// DataContract declares what an adapter produces.
type DataContract struct {
	SchemaRef     string   `json:"schema_ref"`
	OutputFormat  string   `json:"output_format"`
	ContextFields []string `json:"context_fields,omitempty"`
}

// AdapterManifest is the adapter's self-description document.
// It is validated against the FACTS schema at registration time.
type AdapterManifest struct {
	AdapterID             string              `json:"adapter_id"`
	Name                  string              `json:"name"`
	Version               string              `json:"version"`
	Type                  string              `json:"type"`
	Protocol              string              `json:"protocol"`
	Tier                  AdapterTier         `json:"tier"`
	Capabilities          AdapterCapabilities `json:"capabilities"`
	DataContract          DataContract        `json:"data_contract"`
	HealthCheckIntervalMs int                 `json:"health_check_interval_ms"`
	ConnectionParams      []ConnectionParam   `json:"connection_params,omitempty"`
	AuthMethods           []string            `json:"auth_methods,omitempty"`
	Metadata              map[string]any      `json:"metadata,omitempty"`
	// TimeGovernance is the FACTS time_governance section (one clock, FB-090); nil only for
	// a manifest built before FB-090. Proto field 13.
	TimeGovernance *TimeGovernance `json:"time_governance,omitempty"`
}

// TimeGovernance is the FACTS time_governance section (one-clock record P-7): how a spoke
// is time-governed. FailClosed must be true.
type TimeGovernance struct {
	TimeSource                string                     `json:"time_source"`
	SyncProtocol              string                     `json:"sync_protocol"`
	ClockReadMethod           string                     `json:"clock_read_method,omitempty"`
	ClockProbeIntervalSeconds float64                    `json:"clock_probe_interval_seconds"`
	SourceTimestampOrigin     string                     `json:"source_timestamp_origin"`
	ToleranceClass            string                     `json:"tolerance_class"`
	FailClosed                bool                       `json:"fail_closed"`
	Connections               []ConnectionTimeGovernance `json:"connections,omitempty"`
}

// ConnectionTimeGovernance is a per-connection declaration inside TimeGovernance.
type ConnectionTimeGovernance struct {
	Name                      string   `json:"name"`
	ClockReadMethod           string   `json:"clock_read_method,omitempty"`
	ClockProbeIntervalSeconds *float64 `json:"clock_probe_interval_seconds,omitempty"`
	SourceTimestampOrigin     string   `json:"source_timestamp_origin,omitempty"`
	ToleranceClass            string   `json:"tolerance_class,omitempty"`
}

// AdapterHealth holds the current health status of an adapter instance.
type AdapterHealth struct {
	AdapterID        string       `json:"adapter_id"`
	State            AdapterState `json:"state"`
	LastCheck        *time.Time   `json:"last_check,omitempty"`
	LastHealthy      *time.Time   `json:"last_healthy,omitempty"`
	ErrorMessage     string       `json:"error_message,omitempty"`
	RecordsCollected int64        `json:"records_collected"`
	RecordsFailed    int64        `json:"records_failed"`
	UptimeSeconds    float64      `json:"uptime_seconds"`
	// HubTime is the hub's half of the time exchange, set on the response to Health
	// (one clock, FB-092). Proto field 9.
	HubTime *HubTime `json:"hub_time,omitempty"`
}

// SpokeTime is what a spoke sends with a request in the hub <-> spoke time exchange
// (docs/decisions/one-clock-ot-source-time.md P-9, FB-092): T1, and the offset and round
// trip it measured in its last completed exchange, so the hub keeps the two-way series
// of the spoke's clock. OffsetSeconds is hub clock minus spoke clock.
type SpokeTime struct {
	TransmitTime     time.Time  `json:"transmit_time"`
	OffsetSeconds    *float64   `json:"offset_seconds,omitempty"`
	RoundTripSeconds *float64   `json:"round_trip_seconds,omitempty"`
	MeasuredAt       *time.Time `json:"measured_at,omitempty"`
}

// HubTime is what the hub answers with: T2, its clock when the request arrived, and
// T3, its clock when it replied.
type HubTime struct {
	ReceiveTime  time.Time `json:"receive_time"`
	TransmitTime time.Time `json:"transmit_time"`
}

// TimeExchange is one completed exchange, NTP's four timestamps: T1 and T4 by the
// spoke's clock, T2 and T3 by the hub's.
type TimeExchange struct {
	T1, T2, T3, T4 time.Time
}

// OffsetSeconds is hub clock minus spoke clock by RFC 5905: ((T2-T1) + (T3-T4)) / 2.
func (e TimeExchange) OffsetSeconds() float64 {
	return (e.T2.Sub(e.T1) + e.T3.Sub(e.T4)).Seconds() / 2
}

// RoundTripSeconds is (T4-T1) - (T3-T2): the time the hub spent on the request drops
// out, and half of it bounds the offset's error on an asymmetric path.
func (e TimeExchange) RoundTripSeconds() float64 {
	return (e.T4.Sub(e.T1) - e.T3.Sub(e.T2)).Seconds()
}
