const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, HeadingLevel, BorderStyle,
  WidthType, ShadingType, PageNumber, PageBreak, TableOfContents,
} = require("docx");

// ── Layout constants ────────────────────────────────────────────
const PAGE_W = 12240; // US Letter
const PAGE_H = 15840;
const MARGIN = 1440;  // 1 inch
const CW = PAGE_W - 2 * MARGIN; // 9360 content width

// ── Colors ──────────────────────────────────────────────────────
const C = {
  darkBlue:  "1B3A5C",
  medBlue:   "2E75B6",
  lightBlue: "D5E8F0",
  accent:    "4472C4",
  darkGray:  "333333",
  medGray:   "666666",
  lightGray: "F2F2F2",
  white:     "FFFFFF",
  border:    "B4C6E7",
};

// ── Reusable helpers ────────────────────────────────────────────
const border = { style: BorderStyle.SINGLE, size: 1, color: C.border };
const borders = { top: border, bottom: border, left: border, right: border };
const cellPad = { top: 80, bottom: 80, left: 120, right: 120 };

function headerCell(text, width) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: C.darkBlue, type: ShadingType.CLEAR },
    margins: cellPad,
    verticalAlign: "center",
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: C.white, font: "Arial", size: 20 })] })],
  });
}

function cell(children, width, opts = {}) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: opts.shading ? { fill: opts.shading, type: ShadingType.CLEAR } : undefined,
    margins: cellPad,
    children: Array.isArray(children) ? children : [children],
  });
}

function bodyText(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 180, line: 276 },
    children: [new TextRun({ text, font: "Arial", size: 22, color: C.darkGray, ...opts })],
  });
}

function bodyRuns(runs) {
  return new Paragraph({
    spacing: { after: 180, line: 276 },
    children: runs.map(r => typeof r === "string"
      ? new TextRun({ text: r, font: "Arial", size: 22, color: C.darkGray })
      : new TextRun({ font: "Arial", size: 22, color: C.darkGray, ...r })),
  });
}

function codeBlock(text) {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    indent: { left: 360 },
    children: [new TextRun({ text, font: "Consolas", size: 18, color: C.medGray })],
  });
}

function spacer(pts = 120) {
  return new Paragraph({ spacing: { after: pts }, children: [] });
}

// ── Numbering configs ───────────────────────────────────────────
const numbering = {
  config: [
    {
      reference: "bullets",
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: "\u2022",
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    },
    {
      reference: "bullets2",
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: "\u2022",
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    },
    {
      reference: "bullets3",
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: "\u2022",
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    },
    {
      reference: "bullets4",
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: "\u2022",
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    },
    {
      reference: "bullets5",
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: "\u2022",
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    },
    {
      reference: "bullets6",
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: "\u2022",
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    },
    {
      reference: "subbullets",
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: "\u2013",
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 1080, hanging: 360 } } },
      }],
    },
    {
      reference: "numbers",
      levels: [{
        level: 0, format: LevelFormat.DECIMAL, text: "%1.",
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    },
    {
      reference: "numbers2",
      levels: [{
        level: 0, format: LevelFormat.DECIMAL, text: "%1.",
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    },
    {
      reference: "numbers3",
      levels: [{
        level: 0, format: LevelFormat.DECIMAL, text: "%1.",
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    },
    {
      reference: "numbers4",
      levels: [{
        level: 0, format: LevelFormat.DECIMAL, text: "%1.",
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    },
  ],
};

function bullet(text, ref = "bullets") {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 80, line: 276 },
    children: [new TextRun({ text, font: "Arial", size: 22, color: C.darkGray })],
  });
}

function bulletRuns(runs, ref = "bullets") {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 80, line: 276 },
    children: runs.map(r => typeof r === "string"
      ? new TextRun({ text: r, font: "Arial", size: 22, color: C.darkGray })
      : new TextRun({ font: "Arial", size: 22, color: C.darkGray, ...r })),
  });
}

function numberedItem(text, ref = "numbers") {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 80, line: 276 },
    children: [new TextRun({ text, font: "Arial", size: 22, color: C.darkGray })],
  });
}

function numberedRuns(runs, ref = "numbers") {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 80, line: 276 },
    children: runs.map(r => typeof r === "string"
      ? new TextRun({ text: r, font: "Arial", size: 22, color: C.darkGray })
      : new TextRun({ font: "Arial", size: 22, color: C.darkGray, ...r })),
  });
}

// ── Document ────────────────────────────────────────────────────
const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: C.darkBlue },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 },
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 30, bold: true, font: "Arial", color: C.medBlue },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 },
      },
      {
        id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: C.accent },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 },
      },
    ],
  },
  numbering,
  sections: [
    // ── TITLE PAGE ──────────────────────────────────────────────
    {
      properties: {
        page: {
          size: { width: PAGE_W, height: PAGE_H },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      children: [
        spacer(2400),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: "FORGE OT MODULE", font: "Arial", size: 48, bold: true, color: C.darkBlue })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          children: [new TextRun({ text: "Architectural Strategy", font: "Arial", size: 36, color: C.medBlue })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 600 },
          children: [new TextRun({ text: "Thin Wrapper Pattern + FxTS-Compliant i3X", font: "Arial", size: 28, color: C.medGray, italics: true })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { top: { style: BorderStyle.SINGLE, size: 6, color: C.medBlue, space: 8 } },
          spacing: { before: 400, after: 100 },
          children: [new TextRun({ text: "P7 OT Module \u2014 Phase 1, Sprint 1, Epic 1.1", font: "Arial", size: 22, color: C.medGray })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({ text: "Forge Platform \u2014 WHK Digital Strategy", font: "Arial", size: 22, color: C.medGray })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({ text: "April 2026", font: "Arial", size: 22, color: C.medGray })],
        }),
        spacer(1200),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "INTERNAL \u2014 ENGINEERING & TECHNOLOGY", font: "Arial", size: 18, bold: true, color: C.medGray })],
        }),
      ],
    },
    // ── TOC ─────────────────────────────────────────────────────
    {
      properties: {
        page: {
          size: { width: PAGE_W, height: PAGE_H },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.medBlue, space: 4 } },
            children: [new TextRun({ text: "Forge OT Module \u2014 Architectural Strategy", font: "Arial", size: 18, color: C.medGray, italics: true })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            border: { top: { style: BorderStyle.SINGLE, size: 2, color: C.border, space: 4 } },
            children: [
              new TextRun({ text: "Page ", font: "Arial", size: 18, color: C.medGray }),
              new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: C.medGray }),
            ],
          })],
        }),
      },
      children: [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun("Table of Contents")],
        }),
        new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
        new Paragraph({ children: [new PageBreak()] }),
      ],
    },
    // ── MAIN CONTENT ────────────────────────────────────────────
    {
      properties: {
        page: {
          size: { width: PAGE_W, height: PAGE_H },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.medBlue, space: 4 } },
            children: [new TextRun({ text: "Forge OT Module \u2014 Architectural Strategy", font: "Arial", size: 18, color: C.medGray, italics: true })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            border: { top: { style: BorderStyle.SINGLE, size: 2, color: C.border, space: 4 } },
            children: [
              new TextRun({ text: "Page ", font: "Arial", size: 18, color: C.medGray }),
              new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: C.medGray }),
            ],
          })],
        }),
      },
      children: [

        // ═══════════════════════════════════════════════════════
        // 1. EXECUTIVE SUMMARY
        // ═══════════════════════════════════════════════════════
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("1. Executive Summary")] }),

        bodyText("The Forge OT Module is the operational technology layer of the Forge platform, purpose-built to replace Ignition SCADA as the primary interface between Allen-Bradley ControlLogix PLCs and the Whiskey House digital ecosystem. Its architecture rests on three interlocking design decisions:"),

        numberedRuns([
          { text: "Thin wrapper pattern: ", bold: true },
          "asyncua (opcua-asyncio) owns the OPC-UA binary wire protocol. Forge owns the type system, operational concerns (state machine, health monitoring, auto-reconnect), and the exception hierarchy. External code never touches asyncua types.",
        ], "numbers"),
        numberedRuns([
          { text: "FxTS governance: ", bold: true },
          "Every module capability is declared in a FACTS specification before code is written. Transport between hub and spokes uses compiled Protobuf binary over gRPC\u2014never JSON-over-gRPC.",
        ], "numbers"),
        numberedRuns([
          { text: "i3X-compliant browse API: ", bold: true },
          "The OPC-UA address space is exposed through 6 REST endpoints shaped to the CESMII i3X data model (Namespace \u2192 ObjectType \u2192 ObjectInstance \u2192 Values/History/Subscriptions), adapted to FxTS governance.",
        ], "numbers"),

        bodyText("These three decisions create a clean vertical stack: PLC wire protocol at the bottom (asyncua), typed Forge models in the middle (Pydantic), and standards-compliant REST at the top (i3X). The converter layer between asyncua and Forge is the single seam that makes the entire transport replaceable\u2014including a future Rust FFI transport\u2014without changing any calling code."),

        new Paragraph({ children: [new PageBreak()] }),

        // ═══════════════════════════════════════════════════════
        // 2. THE THIN WRAPPER PATTERN
        // ═══════════════════════════════════════════════════════
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("2. The Thin Wrapper Pattern")] }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("2.1 Design Principle")] }),

        bodyText("The Forge OPC-UA client delegates all wire-protocol mechanics to asyncua while maintaining absolute type boundary enforcement. The principle is simple: asyncua types enter the converter layer, Forge Pydantic models exit. No asyncua type ever appears in the public API surface."),

        bodyText("This is not merely an abstraction for cleanliness. It is a contractual boundary that enables three critical capabilities:"),

        bulletRuns([
          { text: "Transport replaceability: ", bold: true },
          "asyncua can be swapped for a Rust FFI transport, a compiled C++ OPC-UA SDK, or a hardware-accelerated stack without changing any code above the converter layer.",
        ], "bullets"),
        bulletRuns([
          { text: "Test isolation: ", bold: true },
          "Tests mock asyncua\u2019s Client class at the import site, but real asyncua ua.DataValue objects flow through the converter functions. This tests the full type conversion roundtrip without requiring a network connection.",
        ], "bullets"),
        bulletRuns([
          { text: "Exception containment: ", bold: true },
          "asyncua\u2019s exception types (UaStatusCodeError, socket errors, asyncio.TimeoutError) are caught at the service boundary and re-raised as Forge\u2019s structured exception hierarchy (18 exception classes rooted at OpcUaError).",
        ], "bullets"),

        spacer(80),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("2.2 Responsibility Split")] }),

        new Table({
          width: { size: CW, type: WidthType.DXA },
          columnWidths: [2800, 3280, 3280],
          rows: [
            new TableRow({ children: [
              headerCell("Concern", 2800),
              headerCell("asyncua Owns", 3280),
              headerCell("Forge Owns", 3280),
            ] }),
            new TableRow({ children: [
              cell(new Paragraph({ children: [new TextRun({ text: "Wire protocol", font: "Arial", size: 20, bold: true, color: C.darkGray })] }), 2800, { shading: C.lightGray }),
              cell(new Paragraph({ children: [new TextRun({ text: "OPC-UA binary encoding/decoding, TCP transport, secure channel, session management", font: "Arial", size: 20, color: C.darkGray })] }), 3280),
              cell(new Paragraph({ children: [new TextRun({ text: "\u2014", font: "Arial", size: 20, color: C.medGray })] }), 3280),
            ] }),
            new TableRow({ children: [
              cell(new Paragraph({ children: [new TextRun({ text: "Type system", font: "Arial", size: 20, bold: true, color: C.darkGray })] }), 2800, { shading: C.lightGray }),
              cell(new Paragraph({ children: [new TextRun({ text: "ua.DataValue, ua.NodeId, ua.NodeClass, ua.VariantType (internal only)", font: "Consolas", size: 18, color: C.darkGray })] }), 3280),
              cell(new Paragraph({ children: [new TextRun({ text: "DataValue, NodeId, NodeClass, DataType, QualityCode, BrowseResult (Pydantic models, public API)", font: "Consolas", size: 18, color: C.darkGray })] }), 3280),
            ] }),
            new TableRow({ children: [
              cell(new Paragraph({ children: [new TextRun({ text: "Security", font: "Arial", size: 20, bold: true, color: C.darkGray })] }), 2800, { shading: C.lightGray }),
              cell(new Paragraph({ children: [new TextRun({ text: "set_security_string() TLS handshake, X.509 certificate exchange", font: "Consolas", size: 18, color: C.darkGray })] }), 3280),
              cell(new Paragraph({ children: [new TextRun({ text: "SecurityConfig, SecurityPolicy enum, TrustStore, certificate loading and validation, cross-field validation", font: "Consolas", size: 18, color: C.darkGray })] }), 3280),
            ] }),
            new TableRow({ children: [
              cell(new Paragraph({ children: [new TextRun({ text: "Connection lifecycle", font: "Arial", size: 20, bold: true, color: C.darkGray })] }), 2800, { shading: C.lightGray }),
              cell(new Paragraph({ children: [new TextRun({ text: "Client.connect(), Client.disconnect()", font: "Consolas", size: 18, color: C.darkGray })] }), 3280),
              cell(new Paragraph({ children: [new TextRun({ text: "State machine (5 states, enforced transitions), auto-reconnect with exponential backoff, health monitoring, latency tracking", font: "Arial", size: 20, color: C.darkGray })] }), 3280),
            ] }),
            new TableRow({ children: [
              cell(new Paragraph({ children: [new TextRun({ text: "Services", font: "Arial", size: 20, bold: true, color: C.darkGray })] }), 2800, { shading: C.lightGray }),
              cell(new Paragraph({ children: [new TextRun({ text: "Node.get_children(), Node.read_data_value(), Node.write_value(), create_subscription(), read_raw_history()", font: "Consolas", size: 18, color: C.darkGray })] }), 3280),
              cell(new Paragraph({ children: [new TextRun({ text: "browse(), read(), write(), subscribe(), history_read() \u2014 typed inputs, Pydantic outputs, structured exceptions", font: "Consolas", size: 18, color: C.darkGray })] }), 3280),
            ] }),
            new TableRow({ children: [
              cell(new Paragraph({ children: [new TextRun({ text: "Subscriptions", font: "Arial", size: 20, bold: true, color: C.darkGray })] }), 2800, { shading: C.lightGray }),
              cell(new Paragraph({ children: [new TextRun({ text: "SubscriptionHandler.datachange_notification(node, val, data)", font: "Consolas", size: 18, color: C.darkGray })] }), 3280),
              cell(new Paragraph({ children: [new TextRun({ text: "_ForgeSubHandler bridge: converts asyncua notification into callback(node_id_str, DataValue)", font: "Consolas", size: 18, color: C.darkGray })] }), 3280),
            ] }),
            new TableRow({ children: [
              cell(new Paragraph({ children: [new TextRun({ text: "Errors", font: "Arial", size: 20, bold: true, color: C.darkGray })] }), 2800, { shading: C.lightGray }),
              cell(new Paragraph({ children: [new TextRun({ text: "UaStatusCodeError, socket errors, asyncio.TimeoutError", font: "Consolas", size: 18, color: C.darkGray })] }), 3280),
              cell(new Paragraph({ children: [new TextRun({ text: "17-class hierarchy: OpcUaError \u2192 ConnectionError, ServiceError, SecurityError, each with structured attributes", font: "Arial", size: 20, color: C.darkGray })] }), 3280),
            ] }),
          ],
        }),

        spacer(120),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("2.3 The Converter Layer")] }),

        bodyText("Six module-level functions in client.py form the type boundary between asyncua and Forge. These functions are the only code in the system that imports and understands both type systems simultaneously."),

        new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("2.3.1 asyncua \u2192 Forge (Inbound)")] }),

        bodyRuns([
          { text: "_convert_node_id(ua_node_id)", font: "Consolas", size: 20 },
          " \u2014 Converts asyncua NodeId to Forge NodeId. Handles three numeric NodeIdType variants (TwoByte, FourByte, Numeric) that asyncua uses as optimized encodings for small integers, plus String and GUID identifiers.",
        ]),
        bodyRuns([
          { text: "_convert_quality(status_code)", font: "Consolas", size: 20 },
          " \u2014 Maps asyncua StatusCode to Forge\u2019s 4-level QualityCode (GOOD, UNCERTAIN, BAD, NOT_AVAILABLE) by extracting severity from bits 30-31 of the OPC-UA uint32 StatusCode.",
        ]),
        bodyRuns([
          { text: "_convert_data_value(ua_dv)", font: "Consolas", size: 20 },
          " \u2014 The primary inbound converter. Extracts value from the asyncua Variant, maps VariantType to Forge DataType via a 17-entry lookup table, converts timestamps (forcing UTC on naive datetimes), and maps StatusCode to QualityCode. Returns a fully-populated Forge DataValue.",
        ]),

        new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("2.3.2 Forge \u2192 asyncua (Outbound)")] }),

        bodyRuns([
          { text: "_forge_node_id_to_ua(node_id)", font: "Consolas", size: 20 },
          " \u2014 Converts Forge NodeId back to asyncua\u2019s ua.NodeId for use as service arguments.",
        ]),
        bodyRuns([
          { text: "_build_security_string(security)", font: "Consolas", size: 20 },
          " \u2014 Constructs the asyncua-specific security string format (\"Policy,Mode,cert_path,key_path[,server_cert]\") from Forge\u2019s SecurityConfig model. Returns None for SecurityPolicy#None.",
        ]),

        new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("2.3.3 Subscription Bridge")] }),

        bodyRuns([
          { text: "_ForgeSubHandler", font: "Consolas", size: 20 },
          " \u2014 A class that implements asyncua\u2019s SubscriptionHandler interface (datachange_notification(node, val, data)) and bridges it to Forge\u2019s SubscriptionCallback signature (callback(node_id_str, DataValue)). Every value change flows through _convert_data_value() before reaching the callback, guaranteeing type boundary enforcement even on real-time subscription data.",
        ]),

        spacer(80),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("2.4 Mapping Tables")] }),

        bodyText("Two constant dictionaries define the bidirectional type mapping:"),

        bodyRuns([
          { text: "_UA_VARIANT_TYPE_MAP", font: "Consolas", size: 20, bold: true },
          " (17 entries) \u2014 Maps asyncua ua.VariantType to Forge DataType. Covers Boolean, all CIP integer types (SByte/Int16/Int32/Int64 and unsigned equivalents matching ControlLogix SINT/INT/DINT/LINT), floating point (Float/Double for REAL/LREAL), String, DateTime, ByteString, NodeId, ExtensionObject, and Variant.",
        ]),
        bodyRuns([
          { text: "_FORGE_TO_UA_VARIANT", font: "Consolas", size: 20, bold: true },
          " \u2014 The reverse map, generated by inverting _UA_VARIANT_TYPE_MAP. Used by the write() service to coerce values to the correct OPC-UA VariantType.",
        ]),
        bodyRuns([
          { text: "_UA_NODE_CLASS_MAP", font: "Consolas", size: 20, bold: true },
          " (8 entries) \u2014 Maps asyncua ua.NodeClass to Forge NodeClass. Covers Object, Variable, Method, ObjectType, VariableType, ReferenceType, DataType, and View.",
        ]),

        new Paragraph({ children: [new PageBreak()] }),

        // ═══════════════════════════════════════════════════════
        // 3. CONNECTION STATE MACHINE
        // ═══════════════════════════════════════════════════════
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("3. Connection State Machine & Health Monitoring")] }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("3.1 State Transitions")] }),

        bodyText("The OpcUaClient enforces a strict 5-state connection state machine. Invalid transitions are rejected silently (logged but not raised) to prevent cascading failures during error recovery."),

        codeBlock("DISCONNECTED \u2192 CONNECTING \u2192 CONNECTED \u2192 RECONNECTING \u2192 CONNECTED"),
        codeBlock("                                \u2192 FAILED (after max retries)"),
        codeBlock("Any state \u2192 DISCONNECTED (on explicit disconnect)"),

        bodyText("The _VALID_TRANSITIONS dictionary at module scope defines every legal transition. The _transition_state() method enforces these constraints before any state change occurs."),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("3.2 Auto-Reconnect")] }),

        bodyText("When a connected session drops, the client transitions to RECONNECTING and launches a background asyncio.Task running the _reconnect_loop(). This loop uses exponential backoff starting at the configured reconnect_interval_ms (default 1 second), doubling each attempt up to a 60-second cap. If max_reconnect_attempts is set (default 0 = unlimited), the loop transitions to FAILED after exhausting attempts."),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("3.3 Health Snapshot")] }),

        bodyText("The client.health property returns a ConnectionHealth Pydantic model capturing the real-time state: endpoint URL, connection name, current ConnectionState, connected_since timestamp, last_data_received timestamp, reconnect_count, consecutive_failures, active subscription count, total monitored items, and last measured round-trip latency in milliseconds. This model feeds directly into the Forge hub\u2019s health aggregation layer."),

        new Paragraph({ children: [new PageBreak()] }),

        // ═══════════════════════════════════════════════════════
        // 4. FIVE OPC-UA SERVICES
        // ═══════════════════════════════════════════════════════
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("4. Five OPC-UA Services")] }),

        bodyText("Each service method follows the same pattern: validate connection state, parse node IDs from string or NodeId model, delegate to asyncua, convert results through the converter layer, and wrap failures in the appropriate Forge exception."),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("4.1 Browse")] }),

        bodyRuns([
          { text: "Method: ", bold: true },
          { text: "browse(node_id, max_results, node_class_filter)", font: "Consolas", size: 20 },
        ]),
        bodyText("Delegates to asyncua\u2019s Node.get_children() then reads BrowseName, NodeClass, DataType, AccessLevel, and DisplayName for each child. For Variable nodes, it resolves the DataType NodeId to a human-readable name and maps it to the Forge DataType enum. For Object nodes, it probes for children to populate the has_children flag. Default starting node is i=85 (the OPC-UA Objects folder)."),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("4.2 Read")] }),

        bodyRuns([
          { text: "Method: ", bold: true },
          { text: "read(node_ids, max_age_ms)", font: "Consolas", size: 20 },
        ]),
        bodyText("Reads current values from one or more nodes via asyncua\u2019s Node.read_data_value(). Each asyncua DataValue passes through _convert_data_value() to produce a Forge DataValue with properly mapped DataType, QualityCode, and UTC timestamps. Updates the client\u2019s latency_ms and last_data_received tracking."),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("4.3 Write")] }),

        bodyRuns([
          { text: "Method: ", bold: true },
          { text: "write(node_id, value, data_type)", font: "Consolas", size: 20 },
        ]),
        bodyText("Writes a value to a single node via asyncua\u2019s Node.write_value(). When an explicit DataType is provided, it maps to the corresponding asyncua VariantType via _FORGE_TO_UA_VARIANT for type coercion. Writes are intentionally single-node: batch writes route through the control module\u2019s write interface, which enforces safety interlocks."),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("4.4 Subscribe")] }),

        bodyRuns([
          { text: "Method: ", bold: true },
          { text: "subscribe(node_ids, callback, interval_ms, queue_size)", font: "Consolas", size: 20 },
        ]),
        bodyText("Creates an asyncua subscription with a _ForgeSubHandler bridge, then subscribes to data changes on the specified nodes. The handler converts every notification through the converter layer before invoking the caller\u2019s callback. Returns a Forge-level subscription_id. Subscription and MonitoredItem Pydantic models track the active state. Unsubscribe deletes the asyncua subscription and clears tracking."),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("4.5 History Read")] }),

        bodyRuns([
          { text: "Method: ", bold: true },
          { text: "history_read(node_id, start_time, end_time, num_values)", font: "Consolas", size: 20 },
        ]),
        bodyText("Delegates to asyncua\u2019s Node.read_raw_history() for retrieving historical data from PLCs that support the OPC-UA History service. Each returned DataValue passes through the converter layer. In practice, most historical data comes from NextTrend rather than PLC-side history, but this service provides direct PLC access when needed."),

        new Paragraph({ children: [new PageBreak()] }),

        // ═══════════════════════════════════════════════════════
        // 5. SECURITY MODEL
        // ═══════════════════════════════════════════════════════
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("5. Security Model")] }),

        bodyText("The security layer uses frozen dataclasses (@dataclass(frozen=True), not Pydantic) for immutable configuration that cannot be mutated after construction."),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("5.1 Policy Levels")] }),

        new Table({
          width: { size: CW, type: WidthType.DXA },
          columnWidths: [3120, 3120, 3120],
          rows: [
            new TableRow({ children: [
              headerCell("Policy", 3120),
              headerCell("Mode", 3120),
              headerCell("Use Case", 3120),
            ] }),
            new TableRow({ children: [
              cell(new Paragraph({ children: [new TextRun({ text: "SecurityPolicy#None", font: "Consolas", size: 18, color: C.darkGray })] }), 3120),
              cell(new Paragraph({ children: [new TextRun({ text: "None", font: "Arial", size: 20, color: C.darkGray })] }), 3120),
              cell(new Paragraph({ children: [new TextRun({ text: "OT VLAN (10.4.x.x), isolated network, no certs. Default for ControlLogix v36 native OPC-UA.", font: "Arial", size: 20, color: C.darkGray })] }), 3120),
            ] }),
            new TableRow({ children: [
              cell(new Paragraph({ children: [new TextRun({ text: "Basic256Sha256", font: "Consolas", size: 18, color: C.darkGray })] }), 3120),
              cell(new Paragraph({ children: [new TextRun({ text: "Sign & Encrypt", font: "Arial", size: 20, color: C.darkGray })] }), 3120),
              cell(new Paragraph({ children: [new TextRun({ text: "Cross-VLAN or production environments. X.509 client certificate + TrustStore validation.", font: "Arial", size: 20, color: C.darkGray })] }), 3120),
            ] }),
            new TableRow({ children: [
              cell(new Paragraph({ children: [new TextRun({ text: "Aes128Sha256RsaOaep", font: "Consolas", size: 18, color: C.darkGray })] }), 3120),
              cell(new Paragraph({ children: [new TextRun({ text: "Sign & Encrypt", font: "Arial", size: 20, color: C.darkGray })] }), 3120),
              cell(new Paragraph({ children: [new TextRun({ text: "Future compliance requirement. Same certificate infrastructure.", font: "Arial", size: 20, color: C.darkGray })] }), 3120),
            ] }),
          ],
        }),

        spacer(80),

        bodyText("Basic256 (SHA-1) is intentionally excluded from the SecurityPolicy enum. SHA-1 is deprecated for OPC-UA security and should never be used in production SCADA environments."),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("5.2 Cross-Field Validation")] }),

        bodyText("SecurityConfig\u2019s __post_init__ enforces three invariants that cannot be represented by individual field validators:"),

        numberedRuns([
          "SecurityPolicy#None requires MessageSecurityMode#None (signing a plaintext channel is contradictory).",
        ], "numbers2"),
        numberedRuns([
          "Any policy requiring certificates (Basic256Sha256, Aes128Sha256RsaOaep) must have a non-None client_certificate.",
        ], "numbers2"),
        numberedRuns([
          "Certificate-requiring policies must use Sign or SignAndEncrypt mode (not None).",
        ], "numbers2"),

        bodyText("These checks fire at construction time, failing fast before any connection attempt."),

        new Paragraph({ children: [new PageBreak()] }),

        // ═══════════════════════════════════════════════════════
        // 6. FxTS GOVERNANCE
        // ═══════════════════════════════════════════════════════
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("6. FxTS Governance Integration")] }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("6.1 Spec-First, Not Test-First")] }),

        bodyText("FxTS (Forge Execution Test Specification) is a governance framework, not a testing framework. Specifications define what must exist; code conforms to specifications. The distinction matters: tests verify behavior, but FxTS specs declare capabilities, interfaces, and compliance requirements that the module must satisfy."),

        bodyText("The OT Module\u2019s FACTS specification (ot-module.facts.json) declares:"),

        bulletRuns([
          { text: "Adapter capabilities: ", bold: true },
          "Which OPC-UA services are supported (Browse, Read, Write, Subscribe, HistoryRead), their input/output types, and failure modes.",
        ], "bullets2"),
        bulletRuns([
          { text: "Transport contract: ", bold: true },
          "gRPC service definitions for hub\u2192spoke communication, using compiled Protobuf binary (never JSON-over-gRPC).",
        ], "bullets2"),
        bulletRuns([
          { text: "Health reporting: ", bold: true },
          "The ConnectionHealth model structure and update frequency.",
        ], "bullets2"),
        bulletRuns([
          { text: "Security requirements: ", bold: true },
          "Supported SecurityPolicy levels and certificate validation behavior.",
        ], "bullets2"),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("6.2 FTTS Transport Protocol")] }),

        bodyText("FTTS (Forge Transport Test Specification) governs all communication between the Forge hub and module spokes. The OT Module acts as a spoke that:"),

        numberedRuns([
          { text: "Receives commands from the hub ", bold: true },
          "(read tag, write tag, browse, subscribe) via gRPC unary RPCs with compiled Protobuf messages.",
        ], "numbers3"),
        numberedRuns([
          { text: "Streams data to the hub ", bold: true },
          "via gRPC server-streaming RPCs (subscription value updates, health reports).",
        ], "numbers3"),
        numberedRuns([
          { text: "Publishes to MQTT ", bold: true },
          "for fan-out to downstream consumers (MES, WMS, NextTrend, dashboards) as enriched ContextualRecords.",
        ], "numbers3"),

        bodyText("The gRPC transport is bidirectional but asymmetric: the hub sends commands (request/response), while the spoke streams telemetry (server-streaming). This maps naturally to the OPC-UA client\u2019s role as a protocol bridge between PLC wire protocol and the Forge data plane."),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("6.3 Hardened gRPC Requirements")] }),

        bodyText("Per established project policy, hub-to-spoke communication must use compiled Protobuf binary transport. JSON-over-gRPC is explicitly forbidden. This requirement exists because:"),

        bulletRuns([
          { text: "Type safety: ", bold: true },
          "Compiled Protobuf catches schema mismatches at compile time, not runtime.",
        ], "bullets3"),
        bulletRuns([
          { text: "Performance: ", bold: true },
          "Binary encoding is 3-10x smaller and faster than JSON for the volume of tag data flowing through the OT Module.",
        ], "bullets3"),
        bulletRuns([
          { text: "Contract enforcement: ", bold: true },
          "Proto files are the single source of truth for the hub\u2192spoke interface. Code is generated from proto files, not hand-written.",
        ], "bullets3"),

        new Paragraph({ children: [new PageBreak()] }),

        // ═══════════════════════════════════════════════════════
        // 7. i3X BROWSE API
        // ═══════════════════════════════════════════════════════
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("7. i3X-Compliant Browse API")] }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("7.1 Why i3X")] }),

        bodyText("CESMII\u2019s i3X specification (https://github.com/cesmii/i3X) is the emerging standard for industrial data access, currently in Alpha and targeting 1.0 in 2026. Rather than inventing a custom browse API, the Forge OT Module adopts the i3X data model and adapts it to FxTS governance. This provides:"),

        bulletRuns([
          { text: "A well-structured data model ", bold: true },
          "we don\u2019t have to invent\u2014Namespace \u2192 ObjectType \u2192 ObjectInstance is a natural mapping for PLC address spaces.",
        ], "bullets4"),
        bulletRuns([
          { text: "Ecosystem compatibility: ", bold: true },
          "Any i3X consumer can browse the OT Module\u2019s address space as the ecosystem grows.",
        ], "bullets4"),
        bulletRuns([
          { text: "Clean separation: ", bold: true },
          "The OPC-UA protocol layer (asyncua client) and the REST API layer (i3X endpoints) are decoupled. The browse API doesn\u2019t need to know about OPC-UA\u2014it talks to the tag engine.",
        ], "bullets4"),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("7.2 Six REST Endpoints")] }),

        new Table({
          width: { size: CW, type: WidthType.DXA },
          columnWidths: [800, 2600, 5960],
          rows: [
            new TableRow({ children: [
              headerCell("#", 800),
              headerCell("Endpoint", 2600),
              headerCell("Description", 5960),
            ] }),
            new TableRow({ children: [
              cell(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "1", font: "Arial", size: 20, color: C.darkGray })] }), 800),
              cell(new Paragraph({ children: [new TextRun({ text: "GET /api/v1/ot/namespaces", font: "Consolas", size: 18, color: C.darkGray })] }), 2600),
              cell(new Paragraph({ children: [new TextRun({ text: "List PLC connections as i3X namespaces (plc100, plc200, plc300, plc400). Each namespace maps to one OpcUaClient instance.", font: "Arial", size: 20, color: C.darkGray })] }), 5960),
            ] }),
            new TableRow({ children: [
              cell(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "2", font: "Arial", size: 20, color: C.darkGray })] }), 800),
              cell(new Paragraph({ children: [new TextRun({ text: "GET /api/v1/ot/objecttypes", font: "Consolas", size: 18, color: C.darkGray })] }), 2600),
              cell(new Paragraph({ children: [new TextRun({ text: "Equipment types from PLC address space (e.g., VFD_Drive, AnalogInstrument). Derived from OPC-UA ObjectType nodes.", font: "Arial", size: 20, color: C.darkGray })] }), 5960),
            ] }),
            new TableRow({ children: [
              cell(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "3", font: "Arial", size: 20, color: C.darkGray })] }), 800),
              cell(new Paragraph({ children: [new TextRun({ text: "GET /api/v1/ot/objects", font: "Consolas", size: 18, color: C.darkGray })] }), 2600),
              cell(new Paragraph({ children: [new TextRun({ text: "Browse child nodes with data types and access levels. This is the primary discovery endpoint, backed by the OpcUaClient.browse() service through the tag engine.", font: "Arial", size: 20, color: C.darkGray })] }), 5960),
            ] }),
            new TableRow({ children: [
              cell(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "4", font: "Arial", size: 20, color: C.darkGray })] }), 800),
              cell(new Paragraph({ children: [new TextRun({ text: "GET /api/v1/ot/objects/value", font: "Consolas", size: 18, color: C.darkGray })] }), 2600),
              cell(new Paragraph({ children: [new TextRun({ text: "Live value preview without creating a persistent subscription. Uses OpcUaClient.read() for a one-shot value fetch.", font: "Arial", size: 20, color: C.darkGray })] }), 5960),
            ] }),
            new TableRow({ children: [
              cell(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "5", font: "Arial", size: 20, color: C.darkGray })] }), 800),
              cell(new Paragraph({ children: [new TextRun({ text: "GET /api/v1/ot/objects/history", font: "Consolas", size: 18, color: C.darkGray })] }), 2600),
              cell(new Paragraph({ children: [new TextRun({ text: "Historical values, delegated to NextTrend historian for time-series data. Falls back to OpcUaClient.history_read() for PLC-side history.", font: "Arial", size: 20, color: C.darkGray })] }), 5960),
            ] }),
            new TableRow({ children: [
              cell(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "6", font: "Arial", size: 20, color: C.darkGray })] }), 800),
              cell(new Paragraph({ children: [new TextRun({ text: "GET /api/v1/ot/subscriptions", font: "Consolas", size: 18, color: C.darkGray })] }), 2600),
              cell(new Paragraph({ children: [new TextRun({ text: "Server-Sent Events (SSE) stream for real-time value changes. Backed by OpcUaClient.subscribe() with _ForgeSubHandler bridge.", font: "Arial", size: 20, color: C.darkGray })] }), 5960),
            ] }),
          ],
        }),

        spacer(120),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("7.3 Forge-Specific Extensions")] }),

        bodyText("Beyond the 6 standard i3X endpoints, the OT Module adds Forge-specific discovery and caching capabilities:"),

        bulletRuns([
          { text: "Tag Discovery ", bold: true },
          "(POST /api/v1/ot/discover) \u2014 Auto-creates Forge tag definitions from PLC address space. Walks the OPC-UA tree recursively and generates tag configs matching the 9-type tag engine schema.",
        ], "bullets5"),
        bulletRuns([
          { text: "Address Space Cache ", bold: true },
          "\u2014 Cached browse results per PLC connection with configurable refresh interval (default 5 minutes). Prevents hammering the PLC with redundant browse operations during rapid UI interactions.",
        ], "bullets5"),

        new Paragraph({ children: [new PageBreak()] }),

        // ═══════════════════════════════════════════════════════
        // 8. HOW IT ALL CONNECTS
        // ═══════════════════════════════════════════════════════
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("8. How the Three Layers Connect")] }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("8.1 Data Flow: PLC to Consumer")] }),

        bodyText("The vertical stack operates as a pipeline with clear boundaries at each layer:"),

        new Table({
          width: { size: CW, type: WidthType.DXA },
          columnWidths: [1200, 2400, 2880, 2880],
          rows: [
            new TableRow({ children: [
              headerCell("Layer", 1200),
              headerCell("Component", 2400),
              headerCell("Input", 2880),
              headerCell("Output", 2880),
            ] }),
            new TableRow({ children: [
              cell(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Wire", font: "Arial", size: 20, bold: true, color: C.darkGray })] }), 1200, { shading: C.lightBlue }),
              cell(new Paragraph({ children: [new TextRun({ text: "asyncua (opcua-asyncio)", font: "Arial", size: 20, color: C.darkGray })] }), 2400),
              cell(new Paragraph({ children: [new TextRun({ text: "OPC-UA binary frames from ControlLogix PLC on port 4840", font: "Arial", size: 20, color: C.darkGray })] }), 2880),
              cell(new Paragraph({ children: [new TextRun({ text: "ua.DataValue, ua.NodeId, ua.NodeClass (asyncua types)", font: "Consolas", size: 18, color: C.darkGray })] }), 2880),
            ] }),
            new TableRow({ children: [
              cell(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Converter", font: "Arial", size: 20, bold: true, color: C.darkGray })] }), 1200, { shading: C.lightBlue }),
              cell(new Paragraph({ children: [new TextRun({ text: "6 converter functions in client.py", font: "Arial", size: 20, color: C.darkGray })] }), 2400),
              cell(new Paragraph({ children: [new TextRun({ text: "asyncua types (internal)", font: "Arial", size: 20, color: C.darkGray })] }), 2880),
              cell(new Paragraph({ children: [new TextRun({ text: "Forge Pydantic models (public API)", font: "Arial", size: 20, color: C.darkGray })] }), 2880),
            ] }),
            new TableRow({ children: [
              cell(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Tag Engine", font: "Arial", size: 20, bold: true, color: C.darkGray })] }), 1200, { shading: C.lightBlue }),
              cell(new Paragraph({ children: [new TextRun({ text: "9-type tag engine with providers", font: "Arial", size: 20, color: C.darkGray })] }), 2400),
              cell(new Paragraph({ children: [new TextRun({ text: "Forge DataValue, BrowseResult models from OpcUaClient", font: "Arial", size: 20, color: C.darkGray })] }), 2880),
              cell(new Paragraph({ children: [new TextRun({ text: "Tagged, enriched values with quality, history config, alarm evaluation", font: "Arial", size: 20, color: C.darkGray })] }), 2880),
            ] }),
            new TableRow({ children: [
              cell(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "i3X API", font: "Arial", size: 20, bold: true, color: C.darkGray })] }), 1200, { shading: C.lightBlue }),
              cell(new Paragraph({ children: [new TextRun({ text: "6 REST endpoints", font: "Arial", size: 20, color: C.darkGray })] }), 2400),
              cell(new Paragraph({ children: [new TextRun({ text: "Tag engine queries and subscriptions", font: "Arial", size: 20, color: C.darkGray })] }), 2880),
              cell(new Paragraph({ children: [new TextRun({ text: "JSON REST responses, SSE streams for consumers (MES, WMS, HMI, dashboards)", font: "Arial", size: 20, color: C.darkGray })] }), 2880),
            ] }),
            new TableRow({ children: [
              cell(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Transport", font: "Arial", size: 20, bold: true, color: C.darkGray })] }), 1200, { shading: C.lightBlue }),
              cell(new Paragraph({ children: [new TextRun({ text: "gRPC + MQTT", font: "Arial", size: 20, color: C.darkGray })] }), 2400),
              cell(new Paragraph({ children: [new TextRun({ text: "Forge models from tag engine", font: "Arial", size: 20, color: C.darkGray })] }), 2880),
              cell(new Paragraph({ children: [new TextRun({ text: "Protobuf binary to Forge hub (gRPC), ContextualRecords to MQTT (fan-out)", font: "Arial", size: 20, color: C.darkGray })] }), 2880),
            ] }),
          ],
        }),

        spacer(120),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("8.2 The Tag Engine as Integration Hub")] }),

        bodyText("The 9-type tag engine sits between the OPC-UA client and the i3X API, providing the semantic enrichment layer that transforms raw protocol data into meaningful manufacturing context. The Standard (OPC) tag type maps directly to OpcUaClient operations, while the other 8 types (Memory, Expression, Query, Derived, Reference, Computed, Event, Virtual) add intelligence that doesn\u2019t exist at the protocol layer."),

        bodyText("The i3X browse API never calls the OpcUaClient directly. It queries the tag engine, which may fulfill the request from cache, from a live OPC-UA read, from a computed expression, or from an entirely different source (NextTrend, external database, MQTT event). This indirection is what makes the i3X API general-purpose: it exposes the full tag space, not just the OPC-UA address space."),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("8.3 The Converter Layer as Replaceable Seam")] }),

        bodyText("The critical architectural insight is that the 6 converter functions in client.py are the only place in the entire system that understands both asyncua types and Forge types simultaneously. Everything above this seam speaks Forge Pydantic models. Everything below speaks asyncua wire protocol types."),

        bodyText("This means replacing asyncua\u2014with a Rust FFI library, with a C++ SDK, with a hardware-accelerated FPGA transport\u2014requires rewriting only these 6 functions and the OpcUaClient class. The tag engine, the i3X API, the gRPC transport, the MQTT publisher, and every consumer application remain completely untouched."),

        new Paragraph({ children: [new PageBreak()] }),

        // ═══════════════════════════════════════════════════════
        // 9. FILE INVENTORY
        // ═══════════════════════════════════════════════════════
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("9. Implementation File Inventory")] }),

        bodyText("All source files reside under src/forge/modules/ot/opcua_client/ with corresponding tests under tests/modules/ot/opcua_client/."),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("9.1 Source Files")] }),

        new Table({
          width: { size: CW, type: WidthType.DXA },
          columnWidths: [2800, 1000, 5560],
          rows: [
            new TableRow({ children: [
              headerCell("File", 2800),
              headerCell("Lines", 1000),
              headerCell("Purpose", 5560),
            ] }),
            new TableRow({ children: [
              cell(new Paragraph({ children: [new TextRun({ text: "types.py", font: "Consolas", size: 18, color: C.darkGray })] }), 2800),
              cell(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "~400", font: "Arial", size: 20, color: C.darkGray })] }), 1000),
              cell(new Paragraph({ children: [new TextRun({ text: "Pydantic models and enums: QualityCode, DataType, NodeClass, AccessLevel, ConnectionState, NodeId, DataValue, BrowseResult, MonitoredItem, Subscription, OpcUaEndpoint, ConnectionHealth", font: "Arial", size: 20, color: C.darkGray })] }), 5560),
            ] }),
            new TableRow({ children: [
              cell(new Paragraph({ children: [new TextRun({ text: "exceptions.py", font: "Consolas", size: 18, color: C.darkGray })] }), 2800),
              cell(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "~230", font: "Arial", size: 20, color: C.darkGray })] }), 1000),
              cell(new Paragraph({ children: [new TextRun({ text: "18-class exception hierarchy rooted at OpcUaError. Three branches: ConnectionError (network), ServiceError (protocol), SecurityError (certificates/policy).", font: "Arial", size: 20, color: C.darkGray })] }), 5560),
            ] }),
            new TableRow({ children: [
              cell(new Paragraph({ children: [new TextRun({ text: "security.py", font: "Consolas", size: 18, color: C.darkGray })] }), 2800),
              cell(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "~250", font: "Arial", size: 20, color: C.darkGray })] }), 1000),
              cell(new Paragraph({ children: [new TextRun({ text: "Frozen dataclasses: SecurityPolicy, MessageSecurityMode, CertificateInfo, TrustStore, SecurityConfig with cross-field validation and factory methods.", font: "Arial", size: 20, color: C.darkGray })] }), 5560),
            ] }),
            new TableRow({ children: [
              cell(new Paragraph({ children: [new TextRun({ text: "client.py", font: "Consolas", size: 18, color: C.darkGray })] }), 2800),
              cell(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "~750", font: "Arial", size: 20, color: C.darkGray })] }), 1000),
              cell(new Paragraph({ children: [new TextRun({ text: "OpcUaClient class wrapping asyncua. Contains 6 converter functions, _ForgeSubHandler bridge, state machine, 5 OPC-UA service methods, auto-reconnect, health monitoring.", font: "Arial", size: 20, color: C.darkGray })] }), 5560),
            ] }),
            new TableRow({ children: [
              cell(new Paragraph({ children: [new TextRun({ text: "__init__.py", font: "Consolas", size: 18, color: C.darkGray })] }), 2800),
              cell(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "~115", font: "Arial", size: 20, color: C.darkGray })] }), 1000),
              cell(new Paragraph({ children: [new TextRun({ text: "Package exports: 34 symbols in __all__ covering client, types, security, and exceptions.", font: "Arial", size: 20, color: C.darkGray })] }), 5560),
            ] }),
          ],
        }),

        spacer(80),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("9.2 Test Files")] }),

        new Table({
          width: { size: CW, type: WidthType.DXA },
          columnWidths: [2800, 1000, 5560],
          rows: [
            new TableRow({ children: [
              headerCell("File", 2800),
              headerCell("Tests", 1000),
              headerCell("Coverage", 5560),
            ] }),
            new TableRow({ children: [
              cell(new Paragraph({ children: [new TextRun({ text: "test_types.py", font: "Consolas", size: 18, color: C.darkGray })] }), 2800),
              cell(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "39", font: "Arial", size: 20, color: C.darkGray })] }), 1000),
              cell(new Paragraph({ children: [new TextRun({ text: "All enums, NodeId parsing/round-trip/hashing, DataValue defaults and timestamp UTC enforcement, BrowseResult properties, Subscription/MonitoredItem, OpcUaEndpoint, ConnectionHealth.", font: "Arial", size: 20, color: C.darkGray })] }), 5560),
            ] }),
            new TableRow({ children: [
              cell(new Paragraph({ children: [new TextRun({ text: "test_exceptions.py", font: "Consolas", size: 18, color: C.darkGray })] }), 2800),
              cell(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "26", font: "Arial", size: 20, color: C.darkGray })] }), 1000),
              cell(new Paragraph({ children: [new TextRun({ text: "Hierarchy structure, attribute preservation, repr formatting, catch-all patterns for all 18 exception classes.", font: "Arial", size: 20, color: C.darkGray })] }), 5560),
            ] }),
            new TableRow({ children: [
              cell(new Paragraph({ children: [new TextRun({ text: "test_security.py", font: "Consolas", size: 18, color: C.darkGray })] }), 2800),
              cell(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "21", font: "Arial", size: 20, color: C.darkGray })] }), 1000),
              cell(new Paragraph({ children: [new TextRun({ text: "SecurityPolicy enum properties, SecurityConfig validation (no_security, with certs, cross-field), certificate loading (missing/empty), TrustStore, factory methods.", font: "Arial", size: 20, color: C.darkGray })] }), 5560),
            ] }),
            new TableRow({ children: [
              cell(new Paragraph({ children: [new TextRun({ text: "test_client.py", font: "Consolas", size: 18, color: C.darkGray })] }), 2800),
              cell(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "49", font: "Arial", size: 20, color: C.darkGray })] }), 1000),
              cell(new Paragraph({ children: [new TextRun({ text: "Type converters (all 6 functions), connection lifecycle, state machine, service guards, browse/read/write/subscribe/history_read services with mocked asyncua, health monitoring.", font: "Arial", size: 20, color: C.darkGray })] }), 5560),
            ] }),
          ],
        }),

        spacer(80),

        bodyRuns([
          { text: "Total: 135 unit tests ", bold: true },
          "covering types (39), exceptions (26), security (21), and client (49). Tests mock asyncua\u2019s Client class at the import site, allowing real asyncua ua.DataValue objects to flow through the converter functions, testing the full type conversion roundtrip.",
        ]),

        new Paragraph({ children: [new PageBreak()] }),

        // ═══════════════════════════════════════════════════════
        // 10. WHAT COMES NEXT
        // ═══════════════════════════════════════════════════════
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("10. What Comes Next")] }),

        bodyText("This document covers the OPC-UA Library Foundation (Epic 1.1) delivered in Sprint 1 of Phase 1. The remaining Sprint 1 deliverables and subsequent phases build on this foundation:"),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("10.1 Remaining Sprint 1 Epics")] }),

        bulletRuns([
          { text: "Epic 1.2 \u2014 Connection Manager: ", bold: true },
          "Multi-PLC connection pooling (plc100, plc200, plc300, plc400), parallel connection lifecycle, aggregate health dashboard.",
        ], "bullets6"),
        bulletRuns([
          { text: "Epic 1.3 \u2014 Tag Engine Core: ", bold: true },
          "Implementation of the 9-type tag engine with Standard (OPC), Memory, and Expression types first, followed by Query, Derived, Reference, Computed, Event, and Virtual.",
        ], "bullets6"),
        bulletRuns([
          { text: "Epic 1.4 \u2014 i3X REST API: ", bold: true },
          "The 6 i3X-compliant endpoints described in Section 7, plus the Forge-specific tag discovery and address space cache extensions.",
        ], "bullets6"),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("10.2 Subsequent Phases")] }),

        bulletRuns([
          { text: "Phase 2 \u2014 Alarm & Event Pipeline: ", bold: true },
          "Threshold alarms, state-change events, notification routing, alarm shelving.",
        ], "bullets6"),
        bulletRuns([
          { text: "Phase 3 \u2014 History & NextTrend Integration: ", bold: true },
          "Tag history configuration, NextTrend historian publish pipeline, LTTB downsampling.",
        ], "bullets6"),
        bulletRuns([
          { text: "Phase 4 \u2014 Python Scripting Engine: ", bold: true },
          "Python 3.12+ scripting replacing Ignition\u2019s Jython 2.7, sandboxed execution, forge.* SDK namespace (forge.tag, forge.db, forge.net).",
        ], "bullets6"),
        bulletRuns([
          { text: "Phase 5 \u2014 gRPC Hub Integration: ", bold: true },
          "Compiled Protobuf service definitions, spoke registration, bidirectional streaming, MQTT ContextualRecord publishing.",
        ], "bullets6"),

        spacer(200),

        new Paragraph({
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: C.medBlue, space: 8 } },
          spacing: { before: 200 },
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "End of Document", font: "Arial", size: 20, color: C.medGray, italics: true })],
        }),
      ],
    },
  ],
});

// ── Generate ────────────────────────────────────────────────────
const OUTPUT = process.argv[2] || "/sessions/serene-gracious-curie/mnt/Digital Strategy/P7_OT_Module_Architectural_Strategy.docx";
Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(OUTPUT, buffer);
  console.log(`Written: ${OUTPUT} (${(buffer.length / 1024).toFixed(0)} KB)`);
});
