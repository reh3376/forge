PRODUCT REQUIREMENTS DOCUMENT  
"Real-Time MQTT Telemetry & UNS Broker Configuration"  
────────────────────────────────────────

1 — Problem / Opportunity  
Whiskey-House MES currently handles transactional data (recipes, lots, orders) but cannot ingest or stream real-time industrial telemetry (temperatures, flow-rates, alarms). Engineers rely on external dashboards; operators refresh pages for status. We need to ingest MQTT data from the plant UNS broker, correlate it with relational data, and push live updates to MES UI.

2 — Goals & Success Metrics  
•  Provide a DB-backed configuration UI for one or more MQTT brokers.  
•  Ingest & validate MQTT payloads (<200 ms end-to-end).  
•  Expose unified Web-Socket channel (`/mqtt`) for live data to all UIs.  
•  Correlate 90 % of MQTT tags with existing domain entities (Equipment, Batch, RecipeParameter, etc.).  
•  Zero downtime config changes (broker reconnect <3 s).  
•  System must handle 2 000 msg/s burst, 300 msg/s sustained.  
•  First pilot screen: Live Fermenter Temperature chart updating at ≤1 s latency.  

3 — Non-Goals / Out of Scope  
• Historians / long-term storage beyond 30 days.  
• Edge gateway deployment (assumes broker exists).  
• OPC-UA ingestion (future).

4 — Users / Personas  
• Plant Engineer – sets up brokers, topics, QoS.  
• Operator – views real-time dashboards.  
• Developer – subscribes to internal event stream for new features.

5 — Functional Requirements  
FR-1  Create/Read/Update/Delete UnsBrokerConfiguration via Admin UI & API.  
FR-2  NestJS service connects to active broker(s) using config in DB.  
FR-3  Service (MqttService) subscribes to configured topic wildcards and publishes structured events on RxJS Subject.  
FR-4  Gateway (MqttGateway) forwards events on Web-Socket namespace `/mqtt`.  
FR-5  Backend endpoint `/mqtt/publish` (secured) allows other services to publish messages back to the broker.  
FR-6  "Reconnect" mutation/REST route reloads config and restarts client without process restart.  
FR-7  Persist messages flagged `requiresPersistence` (config option) to `MqttMessage` table (TTL 30 days).  
FR-8  Map incoming tag → domain entity using rule table (`MqttTagMapping`) to enrich payload with `entityType`, `entityId`.  
FR-9  RabbitMQ bridge (optional flag) republishes selected MQTT messages to existing Rabbit topics to keep downstream consumers unchanged.

6 — Non-Functional Requirements  
NFR-1  Average end-to-end latency <200 ms, p95 <500 ms.  
NFR-2  Each service restart must auto-re-establish subscriptions.  
NFR-3  Secure TLS & user/password auth where broker supports it.  
NFR-4  All secrets managed via Vault/K8s secrets.  
NFR-5  Observability: expose metrics (#msgs, errors) via Prometheus.  

7 — Technical Approach  
• Extend Prisma model (`UnsBrokerConfiguration`, `MqttMessage`, `MqttTagMapping`).  
• Add `mqtt` npm lib, create `MqttService` (singleton, hot-reload).  
• Use RxJS Subject as internal event bus.  
• Use Nest `@WebSocketGateway` (or socket.io) under `/mqtt` path.  
• For bridging: push to existing `RabbitMQProducerService.emitMessage(..)` so downstream processes stay identical.  
• Next.js App Router uses `socket.io-client` (or native WS) hook to consume.  

8 — Dependencies / Risks  
• Broker network reliability.  
• TLS certificate rotation.  
• Message storms (DoS) from mis-configured devices.  
• Mapping table completeness; missing mappings reduce correlation metric.  

9 — Acceptance Criteria / Test Plan  
✓ Can save broker config in UI and verify connection in logs.  
✓ Changing QoS or topic list triggers immediate reconnect.  
✓ Web-Socket client receives sample message when device publishes.  
✓ Latency tests meet NFR-1.  
✓ Load test at 2 000 msg/s sustained for 1 h without memory leak.  
✓ Grafana dashboard shows metrics.  

10 — Release / Roll-out  
• Phase 1   Dev + Staging with synthetic MQTT simulator.  
• Phase 2   Pilot on one production line (Fermenters).  
• Phase 3   Full plant rollout, turn on Rabbit bridge for downstream apps. 