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
	AdapterID            string              `json:"adapter_id"`
	Name                 string              `json:"name"`
	Version              string              `json:"version"`
	Type                 string              `json:"type"`
	Protocol             string              `json:"protocol"`
	Tier                 AdapterTier         `json:"tier"`
	Capabilities         AdapterCapabilities `json:"capabilities"`
	DataContract         DataContract        `json:"data_contract"`
	HealthCheckIntervalMs int                `json:"health_check_interval_ms"`
	ConnectionParams     []ConnectionParam   `json:"connection_params,omitempty"`
	AuthMethods          []string            `json:"auth_methods,omitempty"`
	Metadata             map[string]any      `json:"metadata,omitempty"`
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
}
