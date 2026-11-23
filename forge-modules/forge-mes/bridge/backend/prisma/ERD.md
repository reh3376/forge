```mermaid
erDiagram

        EnumAssetAssetType {
            ENT ENT
SITE SITE
AREA AREA
LINE LINE
CELL CELL
EQUIPMOD EQUIPMOD
EQUIPPHASE EQUIPPHASE
CONTROLMOD CONTROLMOD
UNIT UNIT
DEVICE DEVICE
        }



        EnumAssetStatus {
            OOS OOS
InService InService
        }



        EnumBatchOperationType {
            Mashing01 Mashing01
Fermentation01 Fermentation01
Distillation01 Distillation01
Processing01 Processing01
Barreling01 Barreling01
        }



        EnumEquipmentPhaseName {
            Steam Steam
Hold Hold
BacksetAdd BacksetAdd
WaterAdd WaterAdd
AdditiveAdd AdditiveAdd
CornAdd CornAdd
MaltAdd MaltAdd
RyeAdd RyeAdd
WheatAdd WheatAdd
Drop Drop
PhCapture PhCapture
Cooldown Cooldown
Rinse Rinse
HotFlush HotFlush
Cip Cip
Fill Fill
Run Run
FermenterSteam FermenterSteam
CoolerSteam CoolerSteam
DropTubSteam DropTubSteam
DropLineSteam DropLineSteam
DropToMashCooler DropToMashCooler
StillStartup StillStartup
StillShutdown StillShutdown
Cut Cut
Gauge Gauge
GrainAdd GrainAdd
LiquidAdd LiquidAdd
Prompt Prompt
        }



        EnumEquipmentPhaseStepType {
            Water Water
Backset Backset
Corn Corn
Rye Rye
Wheat Wheat
Malt Malt
Premalt Premalt
Specialty Specialty
Enzyme Enzyme
Nutrient Nutrient
Yeast Yeast
Citric Citric
Hold Hold
Cool Cool
NotRequired NotRequired
Heat Heat
Vessel Vessel
Pipe Pipe
        }



        EnumFermentationDayDatumDay {
            First First
Second Second
Third Third
Final Final
        }



        EnumItemReceiptStatus {
            InProgress InProgress
Complete Complete
Rejected Rejected
Hold Hold
        }



        EnumLotStatus {
            Started Started
PendingValidation PendingValidation
Submitted Submitted
Complete Complete
        }



        EnumLotWhiskeyType {
            AmericanSingleMalt AmericanSingleMalt
CornBourbon CornBourbon
CornWhiskey CornWhiskey
RyeBourbon RyeBourbon
RyeWhiskey RyeWhiskey
WheatedBourbon WheatedBourbon
WheatWhiskey WheatWhiskey
        }



        EnumMashingProtocolStepHoldType {
            Heat Heat
Cool Cool
Hold Hold
        }



        EnumMashingProtocolStepStepType {
            Hold Hold
LiquidAdd LiquidAdd
Corn Corn
Wheat Wheat
Rye Rye
PreMalt PreMalt
Malt Malt
Prompt Prompt
AdditiveAdd AdditiveAdd
        }



        EnumOperationName {
            Cook Cook
FermenterSet FermenterSet
Fermenter Fermenter
Clean Clean
StillRun StillRun
BlendingTank BlendingTank
CisternTank CisternTank
Barreling Barreling
        }



        EnumPhaseParameterSetpointType {
            Boolean Boolean
Numeric Numeric
String String
        }



        EnumPhaseParameterStaticName {
            Temperature Temperature
Time Time
Quantity Quantity
Speed Speed
FlowRate FlowRate
SprayballTime SprayballTime
Level Level
        }



        EnumProcedureName {
            Line1 Line1
        }



        EnumProductionOrderStatus {
            Planned Planned
Committed Committed
Initiated Initiated
InProgress InProgress
Complete Complete
        }



        EnumPurchaseOrderReceiptStatus {
            NotReceived NotReceived
ReceiptInProgress ReceiptInProgress
ReceiptComplete ReceiptComplete
PurchaseOrderComplete PurchaseOrderComplete
InitializedNotReceived InitializedNotReceived
ReceivedTested ReceivedTested
        }



        EnumRecipeBomItemOperation {
            Mashing01 Mashing01
Fermentation01 Fermentation01
Distillation01 Distillation01
Processing01 Processing01
        }



        EnumRecipeParameterOperation {
            Mashing01 Mashing01
Ferrmentation01 Ferrmentation01
Distillation01 Distillation01
Processing01 Processing01
        }



        EnumRecipeParameterRecipeSetpointType {
            Boolean Boolean
Numeric Numeric
Text Text
        }



        EnumRecipeWhiskeyType {
            RyeBourbon RyeBourbon
WheatedBourbon WheatedBourbon
FourGrainBourbon FourGrainBourbon
RyeWhiskey RyeWhiskey
WheatWhiskey WheatWhiskey
MaltWhiskey MaltWhiskey
FourGrainWhiskey FourGrainWhiskey
        }



        EnumScheduleOrderQueueNextOperation {
            Mashing01 Mashing01
Fermentation01 Fermentation01
Distillation01 Distillation01
Processing01 Processing01
        }



        EnumScheduleOrderStatus {
            Created Created
Scheduled Scheduled
InProgress InProgress
Complete Complete
        }



        EnumTestParameterTestSetpointType {
            Boolean Boolean
Numerical Numerical
        }



        EnumUnitProcedureName {
            Mashing01 Mashing01
Fermentation01 Fermentation01
Distillation01 Distillation01
Processing01 Processing01
Granary01 Granary01
        }



        EnumUnsConfigurationEventType {
            Create Create
Read Read
Update Update
Delete Delete
        }

  "AdditiveActual" {
    DateTime createdAt
    String id "🗝️"
    String itemNumber
    String lotNumber
    Int quantity
    DateTime updatedAt
    }


  "Asset" {
    String assetPath
    DateTime createdAt
    String createdBy
    String description
    String id "🗝️"
    String name
    Int revision "❓"
    String schemaVersion
    DateTime updatedAt
    String updatedBy "❓"
    String globalId "❓"
    EnumAssetAssetType assetType
    EnumAssetStatus status "❓"
    Float proofInitial "❓"
    }


  "Batch" {
    String id "🗝️"
    DateTime createdAt
    DateTime updatedAt
    String batchId
    Int quantity "❓"
    Json batchData "❓"
    Int revision "❓"
    Json customers "❓"
    Json parameterData "❓"
    String assetPath "❓"
    Json batchInitData "❓"
    String operationIndex "❓"
    String recipeName "❓"
    EnumBatchOperationType operationType "❓"
    Json durationSplits "❓"
    Int totalDuration "❓"
    }


  "Bom" {
    String id "🗝️"
    String editedBy "❓"
    String schemaVersion "❓"
    String className "❓"
    DateTime editedAt
    String createdBy
    DateTime createdAt
    String bomName
    String bomRevision
    String globalId "❓"
    String bomType "❓"
    String notes "❓"
    Boolean inactive "❓"
    DateTime effectiveStartDate "❓"
    DateTime effectiveEndDate "❓"
    String erpId "❓"
    }


  "BomItem" {
    String id "🗝️"
    DateTime createdAt
    DateTime updatedAt
    String createdBy
    String updatedBy "❓"
    Float quantity
    Float quantityActual "❓"
    String units "❓"
    DateTime consumedAt "❓"
    String globalId "❓"
    Boolean isClassDefinition "❓"
    }


  "Customer" {
    String address
    DateTime createdAt
    String createdBy
    String description "❓"
    String editedBy "❓"
    String email "❓"
    String id "🗝️"
    String name
    Int revision
    String schemaVersion "❓"
    DateTime updatedAt
    String globalId "❓"
    String customerCode "❓"
    String phone "❓"
    }


  "EquipmentPhase" {
    String createdBy
    DateTime createdAt "❓"
    String schemaVersion "❓"
    Int operationSequenceIndex "❓"
    EnumEquipmentPhaseName name
    String id "🗝️"
    String editedBy "❓"
    Int revision "❓"
    DateTime editedAt "❓"
    String className "❓"
    String description "❓"
    Boolean isClassDefinition "❓"
    Boolean active "❓"
    String path "❓"
    String globalId "❓"
    EnumEquipmentPhaseStepType stepType
    String message "❓"
    }


  "FermentationChemistry" {
    String id "🗝️"
    DateTime createdAt
    DateTime updatedAt
    String approvedBy "❓"
    Boolean approved "❓"
    }


  "FermentationDayDatum" {
    String id "🗝️"
    DateTime createdAt
    DateTime updatedAt
    String lotId
    String loggedBy
    EnumFermentationDayDatumDay day "❓"
    Float temperature
    Float balling
    Float acid
    Float pH
    Float dryInches "❓"
    Int fermenterNumber
    }


  "FermentationSettingDatum" {
    String id "🗝️"
    DateTime createdAt
    DateTime updatedAt
    String lotId
    Int fermenterNumber
    DateTime yeastPitchTime
    DateTime setTime
    Float temperature
    Float dryInches "❓"
    Float balling "❓"
    Float acid "❓"
    Float pH "❓"
    String loggedBy
    }


  "Instruction" {
    DateTime createdAt
    DateTime updatedAt
    String filePath
    String editedBy "❓"
    Boolean active "❓"
    String createdBy
    String id "🗝️"
    String schemaVersion "❓"
    Int revision
    String name "❓"
    String globalId "❓"
    }


  "Inventory" {
    String id "🗝️"
    DateTime createdAt
    DateTime updatedAt
    String createdBy
    String updatedBy "❓"
    String schemaVersion "❓"
    Int revision "❓"
    String correctionNote "❓"
    String correctedBy "❓"
    String lotNumber "❓"
    String notes "❓"
    String units "❓"
    String globalId "❓"
    Json customers "❓"
    Float proof "❓"
    Int fifoIndex "❓"
    Boolean active "❓"
    Int currentQuantity "❓"
    Int originalQuantity "❓"
    }


  "InventoryLog" {
    String id "🗝️"
    DateTime createdAt
    DateTime updatedAt
    DateTime dateTime
    DateTime date
    Float quantity "❓"
    String loggedBy
    Int revision "❓"
    String revisedBy "❓"
    String rawMeasurementValue "❓"
    String rawMeasurementUnits "❓"
    String units
    }


  "InventoryTransfer" {
    String id "🗝️"
    DateTime createdAt
    DateTime updatedAt
    String notes "❓"
    String department "❓"
    String createdBy "❓"
    String updatedBy "❓"
    Int quantity "❓"
    String globalId "❓"
    }


  "Item" {
    String id "🗝️"
    DateTime createdAt
    DateTime updatedAt
    Boolean active "❓"
    String createdBy
    String updatedBy "❓"
    String itemType
    String itemDescription "❓"
    String itemName
    Int itemRevision "❓"
    String itemNumber
    String schemaVersion "❓"
    String itemClass "❓"
    String itemGroup "❓"
    String globalId "❓"
    String erpId
    }


  "ItemGroup" {
    String id "🗝️"
    DateTime createdAt
    DateTime updatedAt
    String name
    String description "❓"
    String globalId "❓"
    }


  "ItemReceipt" {
    DateTime createdAt
    String createdBy
    String driver
    String id "🗝️"
    Float quantity
    String schemaVersion "❓"
    EnumItemReceiptStatus status "❓"
    String supplierLot "❓"
    String units
    DateTime updatedAt
    String updatedBy "❓"
    Float weighIn "❓"
    Float weighOut "❓"
    String globalId "❓"
    Int loadId "❓"
    Boolean testsPassed "❓"
    Int siloNumber "❓"
    Json lots "❓"
    }


  "Lot" {
    DateTime createdAt
    String createdBy "❓"
    String externalId "❓"
    String id "🗝️"
    String lotNumber
    String schemaVersion "❓"
    DateTime updatedAt
    String globalId "❓"
    Boolean isRawMaterial "❓"
    Float avgBblFillByPg "❓"
    Float avgBblFillByWg "❓"
    Float avgPGsFerm "❓"
    Float bblEntryProof "❓"
    String bblOem "❓"
    Int bblTotal "❓"
    String bblType "❓"
    Boolean confirmed "❓"
    Float densityFinal "❓"
    Float grainLbsFerm "❓"
    Float grainLbsPg "❓"
    String notes "❓"
    Float pgLosses "❓"
    Float standardYield "❓"
    Float totalFermenters "❓"
    Float totalPGs "❓"
    Float totalPGsByRecipe "❓"
    Float totalVolumeWg "❓"
    Float totalWGs "❓"
    Float totalWeight "❓"
    Int warehouseEntryNumber "❓"
    EnumLotWhiskeyType whiskeyType "❓"
    String filledFromString "❓"
    Float finalVolume "❓"
    Float finalWeight "❓"
    Float initialVolume "❓"
    Float initialWeight "❓"
    DateTime lotCreatedAt "❓"
    EnumLotStatus status "❓"
    String lotAlphaChar "❓"
    Float proofInitial "❓"
    }


  "MashDatum" {
    String id "🗝️"
    DateTime createdAt
    DateTime updatedAt
    String lotId
    Float balling
    Float pH
    Float backSetPH
    Float backsetVolume "❓"
    Float waterVolume
    Float cornLbs "❓"
    Float ryeLbs "❓"
    Float maltLbs "❓"
    Float wheatLbs "❓"
    String loggedBy
    Int fermenterNumber
    }


  "MashingDatum" {
    Int backsetQuantity "❓"
    DateTime cookCompleteTime "❓"
    DateTime cookDropTime "❓"
    Int cookDuration "❓"
    DateTime cookStartTime "❓"
    String cookStartedBy "❓"
    Int cookerNumber "❓"
    Int cornQuantity "❓"
    DateTime createdAt
    Int dropDuration "❓"
    String id "🗝️"
    Int maltQuantity "❓"
    Int preMaltQuantity "❓"
    Int ryeQuantity "❓"
    Int specialtyQuantity "❓"
    Int totalDuration "❓"
    DateTime updatedAt
    Int waterQuantity "❓"
    Int wheatQuantity "❓"
    }


  "MashingProtocol" {
    DateTime createdAt
    String createdBy
    String id "🗝️"
    Boolean master "❓"
    String name
    String revision "❓"
    Boolean running "❓"
    DateTime updatedAt
    String updatedBy "❓"
    }


  "MashingProtocolStep" {
    Boolean agitatorEnabled "❓"
    Float agitatorSpdSp "❓"
    Boolean coolEnabled "❓"
    Float coolTempSp "❓"
    DateTime createdAt
    String createdBy
    Boolean heatEnabled "❓"
    Float heatTempSp "❓"
    EnumMashingProtocolStepHoldType holdType "❓"
    String id "🗝️"
    Int index "❓"
    Boolean isClassDefinition "❓"
    String promptMessage "❓"
    Int stepTime "❓"
    EnumMashingProtocolStepStepType stepType "❓"
    Float temperatureActual "❓"
    Float temperatureSetpoint "❓"
    DateTime updatedAt
    String updatedBy "❓"
    }


  "Operation" {
    Int revision "❓"
    DateTime createdAt "❓"
    EnumOperationName name
    String editedBy "❓"
    String createdBy
    String description
    Int procedureSequenceIndex
    String schemaVersion "❓"
    Boolean active "❓"
    DateTime updatedAt "❓"
    String id "🗝️"
    Boolean isClassDefinition "❓"
    String path "❓"
    String abbreviation
    String globalId "❓"
    Json auxiliaryPhases "❓"
    String lotId "❓"
    }


  "PhaseParameter" {
    String id "🗝️"
    DateTime createdAt
    Float setpointUpperLimit "❓"
    Float setpointNumericalValue "❓"
    Boolean setpointBooleanValue "❓"
    String name
    String description
    DateTime updatedAt
    String itemId "❓"
    EnumPhaseParameterSetpointType setpointType
    Float setpointLowerLimit "❓"
    String schemaVersion "❓"
    String createdBy
    String units
    String recipeId "❓"
    String editedBy "❓"
    Int revision "❓"
    Boolean active "❓"
    Boolean isClassDef
    Boolean isStaticParameter "❓"
    EnumPhaseParameterStaticName staticName "❓"
    String globalId "❓"
    String stringValue "❓"
    }


  "Procedure" {
    String id "🗝️"
    DateTime createdAt
    DateTime updatedAt
    EnumProcedureName name "❓"
    String description "❓"
    String createdBy
    String updatedBy "❓"
    String schemaVersion "❓"
    Int revision "❓"
    Boolean active "❓"
    Boolean isClassDefinition "❓"
    String globalId "❓"
    }


  "ProductionOrder" {
    String id "🗝️"
    DateTime createdAt
    DateTime updatedAt
    String className "❓"
    Boolean complete "❓"
    String createdBy
    Boolean inProcess "❓"
    DateTime updatedBy "❓"
    Boolean scheduled "❓"
    String schemaVersion "❓"
    DateTime startDate "❓"
    DateTime endDate "❓"
    EnumProductionOrderStatus status "❓"
    String globalId "❓"
    String customerCode "❓"
    Int quantity "❓"
    String units "❓"
    String name "❓"
    Int executedCooks "❓"
    Int executedFermenters "❓"
    Int totalCooks "❓"
    Int totalFermenters "❓"
    Float estimatedBarrelsPerFermenter "❓"
    Float estimatedPGsPerBbl "❓"
    Float estimatedPGsPerBushel "❓"
    }


  "ProductionOrderBomItem" {
    String id "🗝️"
    DateTime createdAt
    DateTime updatedAt
    }


  "ProductionOrderRecipeInstance" {
    DateTime createdAt
    String createdBy
    String id "🗝️"
    DateTime updatedAt
    String updatedBy "❓"
    }


  "PurchaseOrder" {
    String className "❓"
    Boolean complete "❓"
    DateTime createdAt "❓"
    String createdBy
    DateTime updatedAt "❓"
    String updatedBy "❓"
    String transactionGroup "❓"
    String id "🗝️"
    String name
    Int totalOrderQuantity "❓"
    DateTime purchaseOrderReceiptDate "❓"
    Boolean purchaseOrderReceived "❓"
    EnumPurchaseOrderReceiptStatus receiptStatus "❓"
    Int receivedQuantity "❓"
    Int revision "❓"
    String schemaVersion "❓"
    String globalId
    Json lineItems "❓"
    String erpId
    }


  "Recipe" {
    String id "🗝️"
    DateTime createdAt
    DateTime updatedAt
    String createdBy
    String updatedBy "❓"
    String schemaVersion "❓"
    Int revision "❓"
    Boolean active "❓"
    String recipeName
    String globalId "❓"
    String customerCode "❓"
    Int cooksPerFerm "❓"
    Float estimatedAbv "❓"
    Boolean isClassDefinition "❓"
    Float targetProof "❓"
    Int totalCooks "❓"
    Int totalFermenters "❓"
    EnumRecipeWhiskeyType whiskeyType "❓"
    }


  "RecipeBom" {
    DateTime createdAt
    String id "🗝️"
    Boolean master "❓"
    String revision "❓"
    Boolean running "❓"
    DateTime updatedAt
    }


  "RecipeBomItem" {
    DateTime createdAt
    String createdBy
    String globalId "❓"
    String id "🗝️"
    Boolean isClassDefinition "❓"
    String lot "❓"
    EnumRecipeBomItemOperation operation
    Int operationIndex
    Float quantity "❓"
    Float quantityActual "❓"
    String units
    DateTime updatedAt
    DateTime updatedBy "❓"
    }


  "RecipeGroup" {
    String id "🗝️"
    DateTime createdAt
    DateTime updatedAt
    String recipe
    Int revision "❓"
    String schemaVersion "❓"
    String createdBy
    String updatedBy "❓"
    String globalId "❓"
    }


  "RecipeParameter" {
    EnumRecipeParameterRecipeSetpointType recipeSetpointType
    Int revision "❓"
    Float recipeSetpointUpperLimit "❓"
    String recipeParamName
    String className
    Boolean active
    String createdBy
    Float recipeSetpointLowerLimit "❓"
    String id "🗝️"
    String recipeParamDescription "❓"
    Boolean recipeSetpointBooleanValue "❓"
    DateTime createdAt
    String schemaVersion "❓"
    Boolean isClassDefinition "❓"
    String globalId "❓"
    Float recipeNumericalSetpoint "❓"
    DateTime updatedAt "❓"
    String updatedBy "❓"
    String recipeParamUnits "❓"
    String description "❓"
    }


  "SalesOrder" {
    DateTime createdAt
    String createdBy
    String id "🗝️"
    String orderType "❓"
    Int quantity
    Int revision
    String schemaVersion "❓"
    DateTime updatedAt
    String updatedBy "❓"
    String globalId
    String customerCode "❓"
    Json lineItems "❓"
    String erpId "❓"
    String name "❓"
    DateTime requestedShipDate "❓"
    }


  "ScheduleOrder" {
    String id "🗝️"
    DateTime createdAt
    DateTime updatedAt
    EnumScheduleOrderStatus status "❓"
    String createdBy "❓"
    String updatedBy "❓"
    String recipeName
    Float totalProofGallons "❓"
    Json productionOrderAllocation
    Int totalBarrels "❓"
    String globalId "❓"
    DateTime estimatedStart "❓"
    DateTime estimatedEnd "❓"
    DateTime actualStart "❓"
    DateTime actualEnd "❓"
    Float duration "❓"
    String durationUnits "❓"
    String name "❓"
    DateTime estimatedBarrelingStartTime "❓"
    Float estimatedDistillationDuration "❓"
    DateTime estimatedDistillationStartTime "❓"
    Float estimatedFermentationDuration "❓"
    DateTime estimatedFermentationStartTime "❓"
    Float estimatedMashingDuration "❓"
    DateTime estimatedMashingStartTime "❓"
    DateTime estimatedProcessingStartTime "❓"
    Float estimatedTotalProductionDuration "❓"
    }


  "ScheduleOrderQueue" {
    String id "🗝️"
    DateTime createdAt
    DateTime updatedAt
    String createdBy
    String updatedBy "❓"
    String schemaVersion "❓"
    Int queueIndex "❓"
    String globalId "❓"
    String nextUnitProcedureName "❓"
    EnumScheduleOrderQueueNextOperation nextOperation "❓"
    }


  "Test" {
    Boolean active
    DateTime createdAt
    String createdBy
    DateTime editedAt "❓"
    String editedBy "❓"
    String id "🗝️"
    Boolean isClassDefinition "❓"
    String schemaVersion "❓"
    String testDescription "❓"
    String testName
    Int testRevision "❓"
    String globalId "❓"
    }


  "TestParameter" {
    String description "❓"
    Boolean testPass "❓"
    DateTime createdAt
    String id "🗝️"
    Boolean testSetpointBooleanValue "❓"
    String updatedBy "❓"
    String name
    Boolean active
    String schemaVersion "❓"
    Float testSetpointValue "❓"
    String testParamUnits
    Float testSetpointUpperLimit "❓"
    String testParamRevision "❓"
    Float testSetpointLowerLimit "❓"
    String createdBy
    EnumTestParameterTestSetpointType testSetpointType "❓"
    DateTime updatedAt "❓"
    Boolean isClassDef "❓"
    String tooltip "❓"
    String testDetails "❓"
    String globalId "❓"
    String testedBy "❓"
    DateTime testedAt "❓"
    Float testResult "❓"
    Boolean required "❓"
    }


  "Unit" {
    String id "🗝️"
    DateTime createdAt
    DateTime updatedAt
    Boolean active "❓"
    String name "❓"
    String unitType "❓"
    String globalId "❓"
    }


  "UnitLookup" {
    String id "🗝️"
    DateTime createdAt
    DateTime updatedAt
    Float conversionRate "❓"
    String name
    String typeName
    String abbreviation
    String pluralAbbreviation
    String pluralName
    Boolean baseUnit "❓"
    }


  "UnitProcedure" {
    String id "🗝️"
    DateTime createdAt
    DateTime updatedAt
    String createdBy
    String updatedBy "❓"
    String schemaVersion "❓"
    Int revision "❓"
    EnumUnitProcedureName name
    String description "❓"
    Boolean isClassDef "❓"
    Boolean active "❓"
    String path "❓"
    String globalId "❓"
    String abbreviation "❓"
    }


  "UnsBrokerConfiguration" {
    String baseTopicPath "❓"
    DateTime createdAt
    String createdBy
    String host
    String id "🗝️"
    String password "❓"
    Int port "❓"
    String protocol "❓"
    Json subscriptions "❓"
    Boolean tls "❓"
    DateTime updatedAt
    String updatedBy "❓"
    String username "❓"
    Boolean validateCertificate "❓"
    }


  "UnsConfiguration" {
    DateTime createdAt
    String createdBy
    Boolean enabled "❓"
    String entityName "❓"
    EnumUnsConfigurationEventType eventType
    Json filterCriteria "❓"
    String id "🗝️"
    String topic "❓"
    String transformationFunction "❓"
    DateTime updatedAt
    String updatedBy "❓"
    }


  "User" {
    String id "🗝️"
    DateTime createdAt
    DateTime updatedAt
    String firstName "❓"
    String lastName "❓"
    String username
    String password
    Json roles
    }


  "Vendor" {
    String id "🗝️"
    DateTime createdAt
    DateTime updatedAt
    Boolean active "❓"
    Json additionalDetails "❓"
    Json contactInformation "❓"
    String createdBy
    String updatedBy "❓"
    String name "❓"
    String erpId "❓"
    String globalId "❓"
    }

    "AdditiveActual" o|--|o "Item" : "Item"
    "AdditiveActual" o|--|o "MashingDatum" : "MashingDatum"
    "Asset" o|--|| "EnumAssetAssetType" : "enum:assetType"
    "Asset" o|--|o "EnumAssetStatus" : "enum:status"
    "Asset" o|--|o "Asset" : "Asset"
    "Asset" o{--}o "Asset" : "other_Asset"
    "Asset" o{--}o "Batch" : "Batch"
    "Asset" o{--}o "FermentationChemistry" : "FermentationChemistry"
    "Asset" o{--}o "FermentationDayDatum" : "FermentationDayDatum"
    "Asset" o{--}o "Inventory" : "Inventory"
    "Asset" o{--}o "InventoryLog" : "InventoryLog"
    "Asset" o{--}o "InventoryTransfer" : "InventoryTransfer_InventoryTransfer_fromAssetIdToAsset"
    "Asset" o{--}o "ItemReceipt" : "ItemReceipt"
    "Asset" o{--}o "Lot" : "Lot_Lot_filledFromIdToAsset"
    "Asset" o{--}o "Lot" : "Lot_Lot_fromAssetIdToAsset"
    "Asset" o{--}o "Lot" : "Lot_Lot_proofingTankIdToAsset"
    "Asset" o{--}o "Lot" : "Lot_Lot_tankOfOriginIdToAsset"
    "Asset" o{--}o "MashDatum" : "MashDatum"
    "Asset" o{--}o "MashingDatum" : "MashingDatum"
    "Asset" o{--}o "PurchaseOrder" : "PurchaseOrder"
    "Asset" o{--}o "InventoryTransfer" : "InventoryTransfer_inventoryTransfersTo"
    "Batch" o|--|o "EnumBatchOperationType" : "enum:operationType"
    "Batch" o|--|o "Asset" : "Asset"
    "Batch" o|--|o "Customer" : "Customer"
    "Batch" o|--|o "Lot" : "Lot"
    "Batch" o|--|o "MashingProtocol" : "MashingProtocol"
    "Batch" o|--|o "Batch" : "Batch"
    "Batch" o{--}o "Batch" : "other_Batch"
    "Batch" o|--|o "ProductionOrder" : "ProductionOrder"
    "Batch" o|--|o "ProductionOrderRecipeInstance" : "ProductionOrderRecipeInstance"
    "Batch" o|--|o "Recipe" : "Recipe"
    "Batch" o{--}o "FermentationChemistry" : "FermentationChemistry"
    "Batch" o{--}o "RecipeBomItem" : "RecipeBomItem"
    "Bom" o|--|| "Item" : "Item"
    "Bom" o{--}o "BomItem" : "BomItem"
    "Bom" o{--}o "MashingDatum" : "MashingDatum"
    "Bom" o{--}o "ProductionOrder" : "ProductionOrder"
    "Bom" o{--}o "UnitProcedure" : "UnitProcedure_UnitProcedure_bomsIdToBom"
    "Bom" o{--}o "UnitProcedure" : "UnitProcedure_UnitProcedure_primaryBomIdToBom"
    "BomItem" o|--|o "Bom" : "Bom"
    "BomItem" o|--|o "BomItem" : "BomItem"
    "BomItem" o{--}o "BomItem" : "other_BomItem"
    "BomItem" o|--|| "Item" : "Item"
    "BomItem" o|--|o "Lot" : "Lot"
    "BomItem" o{--}o "EquipmentPhase" : "EquipmentPhase"
    "Customer" o{--}o "Batch" : "Batch"
    "Customer" o|--|o "InventoryLog" : "InventoryLog"
    "Customer" o{--}o "ProductionOrder" : "ProductionOrder"
    "Customer" o{--}o "Recipe" : "Recipe"
    "Customer" o{--}o "SalesOrder" : "SalesOrder"
    "Customer" o{--}o "ScheduleOrder" : "ScheduleOrder"
    "EquipmentPhase" o|--|| "EnumEquipmentPhaseName" : "enum:name"
    "EquipmentPhase" o|--|| "EnumEquipmentPhaseStepType" : "enum:stepType"
    "EquipmentPhase" o|--|o "EquipmentPhase" : "EquipmentPhase"
    "EquipmentPhase" o{--}o "EquipmentPhase" : "other_EquipmentPhase"
    "EquipmentPhase" o|--|| "Operation" : "Operation"
    "EquipmentPhase" o{--}o "BomItem" : "BomItem"
    "EquipmentPhase" o{--}o "Instruction" : "Instruction"
    "EquipmentPhase" o{--}o "PhaseParameter" : "PhaseParameter"
    "EquipmentPhase" o{--}o "TestParameter" : "TestParameter"
    "FermentationChemistry" o|--|| "Asset" : "Asset"
    "FermentationChemistry" o|--|| "Batch" : "Batch"
    "FermentationChemistry" o|--|| "Operation" : "Operation"
    "FermentationChemistry" o|--|o "ProductionOrder" : "ProductionOrder"
    "FermentationChemistry" o|--|o "FermentationSettingDatum" : "FermentationSettingDatum"
    "FermentationChemistry" o{--}o "FermentationDayDatum" : "FermentationDayDatum"
    "FermentationChemistry" o{--}o "MashDatum" : "MashDatum"
    "FermentationDayDatum" o|--|o "EnumFermentationDayDatumDay" : "enum:day"
    "FermentationDayDatum" o|--|o "Asset" : "Asset"
    "FermentationDayDatum" o|--|o "FermentationChemistry" : "FermentationChemistry"
    "FermentationDayDatum" o|--|| "Operation" : "Operation"
    "FermentationDayDatum" o|--|| "ProductionOrder" : "ProductionOrder"
    "FermentationSettingDatum" o{--}o "FermentationChemistry" : "FermentationChemistry"
    "FermentationSettingDatum" o|--|o "Operation" : "Operation"
    "Instruction" o{--}o "EquipmentPhase" : "EquipmentPhase"
    "Inventory" o|--|| "Asset" : "Asset"
    "Inventory" o|--|| "Item" : "Item"
    "Inventory" o|--|o "ItemReceipt" : "ItemReceipt"
    "InventoryLog" o{--}o "Customer" : "Customer"
    "InventoryLog" o|--|| "Asset" : "Asset"
    "InventoryLog" o|--|| "Item" : "Item"
    "InventoryTransfer" o|--|o "Asset" : "Asset_InventoryTransfer_fromAssetIdToAsset"
    "InventoryTransfer" o|--|o "Item" : "Item"
    "InventoryTransfer" o|--|o "Lot" : "Lot"
    "InventoryTransfer" o{--}o "Asset" : "Asset_inventoryTransfersTo"
    "Item" o{--}o "AdditiveActual" : "AdditiveActual"
    "Item" o{--}o "Bom" : "Bom"
    "Item" o{--}o "BomItem" : "BomItem"
    "Item" o{--}o "Inventory" : "Inventory"
    "Item" o{--}o "InventoryLog" : "InventoryLog"
    "Item" o{--}o "InventoryTransfer" : "InventoryTransfer"
    "Item" o|--|o "Vendor" : "Vendor"
    "Item" o{--}o "ItemReceipt" : "ItemReceipt"
    "Item" o{--}o "Lot" : "Lot_Lot_continerItemIdToItem"
    "Item" o{--}o "ProductionOrder" : "ProductionOrder"
    "Item" o{--}o "Recipe" : "Recipe"
    "Item" o{--}o "RecipeBomItem" : "RecipeBomItem"
    "Item" o{--}o "Lot" : "Lot_ItemOnLots"
    "Item" o{--}o "PurchaseOrder" : "PurchaseOrder"
    "Item" o{--}o "SalesOrder" : "SalesOrder"
    "ItemReceipt" o|--|o "EnumItemReceiptStatus" : "enum:status"
    "ItemReceipt" o{--}o "Inventory" : "Inventory"
    "ItemReceipt" o|--|| "Item" : "Item"
    "ItemReceipt" o|--|o "PurchaseOrder" : "PurchaseOrder"
    "ItemReceipt" o|--|o "Asset" : "Asset"
    "ItemReceipt" o{--}o "TestParameter" : "TestParameter"
    "Lot" o|--|o "EnumLotWhiskeyType" : "enum:whiskeyType"
    "Lot" o|--|o "EnumLotStatus" : "enum:status"
    "Lot" o{--}o "Batch" : "Batch"
    "Lot" o{--}o "BomItem" : "BomItem"
    "Lot" o{--}o "InventoryTransfer" : "InventoryTransfer"
    "Lot" o|--|o "Item" : "Item_Lot_continerItemIdToItem"
    "Lot" o|--|o "Asset" : "Asset_Lot_filledFromIdToAsset"
    "Lot" o|--|o "Asset" : "Asset_Lot_fromAssetIdToAsset"
    "Lot" o|--|o "ProductionOrder" : "ProductionOrder"
    "Lot" o|--|o "Asset" : "Asset_Lot_proofingTankIdToAsset"
    "Lot" o|--|o "PurchaseOrder" : "PurchaseOrder"
    "Lot" o|--|o "Recipe" : "Recipe"
    "Lot" o|--|o "Asset" : "Asset_Lot_tankOfOriginIdToAsset"
    "Lot" o{--}o "Item" : "Item_ItemOnLots"
    "MashDatum" o|--|o "Asset" : "Asset"
    "MashDatum" o|--|o "FermentationChemistry" : "FermentationChemistry"
    "MashingDatum" o{--}o "AdditiveActual" : "AdditiveActual"
    "MashingDatum" o|--|o "Asset" : "Asset"
    "MashingDatum" o|--|o "Bom" : "Bom"
    "MashingDatum" o|--|o "Operation" : "Operation"
    "MashingDatum" o|--|o "RecipeBom" : "RecipeBom"
    "MashingProtocol" o{--}o "Batch" : "Batch"
    "MashingProtocol" o|--|o "MashingProtocol" : "MashingProtocol_MashingProtocol_masterMashingProtocolIdToMashingProtocol"
    "MashingProtocol" o{--}o "MashingProtocol" : "other_MashingProtocol_MashingProtocol_masterMashingProtocolIdToMashingProtocol"
    "MashingProtocol" o|--|o "MashingProtocol" : "MashingProtocol_MashingProtocol_runningMashingProtocolIdToMashingProtocol"
    "MashingProtocol" o{--}o "MashingProtocol" : "other_MashingProtocol_MashingProtocol_runningMashingProtocolIdToMashingProtocol"
    "MashingProtocol" o{--}o "MashingProtocolStep" : "MashingProtocolStep"
    "MashingProtocol" o{--}o "Recipe" : "Recipe"
    "MashingProtocol" o{--}o "ProductionOrderRecipeInstance" : "ProductionOrderRecipeInstance"
    "MashingProtocolStep" o|--|o "EnumMashingProtocolStepHoldType" : "enum:holdType"
    "MashingProtocolStep" o|--|o "EnumMashingProtocolStepStepType" : "enum:stepType"
    "MashingProtocolStep" o|--|o "MashingProtocol" : "MashingProtocol"
    "MashingProtocolStep" o{--}o "RecipeBomItem" : "RecipeBomItem"
    "Operation" o|--|| "EnumOperationName" : "enum:name"
    "Operation" o{--}o "EquipmentPhase" : "EquipmentPhase"
    "Operation" o{--}o "FermentationChemistry" : "FermentationChemistry"
    "Operation" o{--}o "FermentationDayDatum" : "FermentationDayDatum"
    "Operation" o{--}o "FermentationSettingDatum" : "FermentationSettingDatum"
    "Operation" o{--}o "MashingDatum" : "MashingDatum"
    "Operation" o|--|o "Operation" : "Operation"
    "Operation" o{--}o "Operation" : "other_Operation"
    "Operation" o|--|o "UnitProcedure" : "UnitProcedure"
    "PhaseParameter" o|--|| "EnumPhaseParameterSetpointType" : "enum:setpointType"
    "PhaseParameter" o|--|o "EnumPhaseParameterStaticName" : "enum:staticName"
    "PhaseParameter" o|--|o "PhaseParameter" : "PhaseParameter"
    "PhaseParameter" o{--}o "PhaseParameter" : "other_PhaseParameter"
    "PhaseParameter" o{--}o "EquipmentPhase" : "EquipmentPhase"
    "Procedure" o|--|o "EnumProcedureName" : "enum:name"
    "Procedure" o|--|o "Procedure" : "Procedure"
    "Procedure" o{--}o "Procedure" : "other_Procedure"
    "Procedure" o{--}o "UnitProcedure" : "UnitProcedure"
    "ProductionOrder" o|--|o "EnumProductionOrderStatus" : "enum:status"
    "ProductionOrder" o{--}o "Batch" : "Batch"
    "ProductionOrder" o{--}o "FermentationChemistry" : "FermentationChemistry"
    "ProductionOrder" o{--}o "FermentationDayDatum" : "FermentationDayDatum"
    "ProductionOrder" o{--}o "Lot" : "Lot"
    "ProductionOrder" o|--|| "Bom" : "Bom"
    "ProductionOrder" o|--|| "Customer" : "Customer"
    "ProductionOrder" o|--|| "Item" : "Item"
    "ProductionOrder" o|--|o "RecipeGroup" : "RecipeGroup"
    "ProductionOrder" o|--|o "Recipe" : "Recipe"
    "ProductionOrder" o|--|o "ScheduleOrder" : "ScheduleOrder"
    "ProductionOrder" o{--}o "ProductionOrderRecipeInstance" : "ProductionOrderRecipeInstance"
    "ProductionOrder" o{--}o "SalesOrder" : "SalesOrder"
    "ProductionOrderRecipeInstance" o{--}o "Batch" : "Batch"
    "ProductionOrderRecipeInstance" o|--|| "ProductionOrder" : "ProductionOrder"
    "ProductionOrderRecipeInstance" o|--|| "Recipe" : "Recipe"
    "ProductionOrderRecipeInstance" o{--}o "MashingProtocol" : "MashingProtocol"
    "ProductionOrderRecipeInstance" o{--}o "RecipeBom" : "RecipeBom"
    "PurchaseOrder" o|--|o "EnumPurchaseOrderReceiptStatus" : "enum:receiptStatus"
    "PurchaseOrder" o{--}o "ItemReceipt" : "ItemReceipt"
    "PurchaseOrder" o{--}o "Lot" : "Lot"
    "PurchaseOrder" o|--|o "Asset" : "Asset"
    "PurchaseOrder" o|--|o "PurchaseOrder" : "PurchaseOrder"
    "PurchaseOrder" o{--}o "PurchaseOrder" : "other_PurchaseOrder"
    "PurchaseOrder" o|--|o "Vendor" : "Vendor"
    "PurchaseOrder" o{--}o "Item" : "Item"
    "PurchaseOrder" o{--}o "TestParameter" : "TestParameter"
    "Recipe" o|--|o "EnumRecipeWhiskeyType" : "enum:whiskeyType"
    "Recipe" o{--}o "Batch" : "Batch"
    "Recipe" o{--}o "Lot" : "Lot"
    "Recipe" o{--}o "ProductionOrder" : "ProductionOrder"
    "Recipe" o{--}o "ProductionOrderRecipeInstance" : "ProductionOrderRecipeInstance"
    "Recipe" o|--|o "Recipe" : "Recipe"
    "Recipe" o{--}o "Recipe" : "other_Recipe"
    "Recipe" o|--|| "Customer" : "Customer"
    "Recipe" o|--|o "Item" : "Item"
    "Recipe" o|--|o "MashingProtocol" : "MashingProtocol"
    "Recipe" o|--|o "RecipeGroup" : "RecipeGroup"
    "Recipe" o{--}o "ScheduleOrder" : "ScheduleOrder"
    "Recipe" o{--}o "RecipeBom" : "RecipeBom"
    "Recipe" o{--}o "RecipeParameter" : "RecipeParameter"
    "Recipe" o{--}o "UnitProcedure" : "UnitProcedure"
    "RecipeBom" o{--}o "MashingDatum" : "MashingDatum"
    "RecipeBom" o|--|o "RecipeBom" : "RecipeBom_RecipeBom_masterReceipeBomIdToRecipeBom"
    "RecipeBom" o{--}o "RecipeBom" : "other_RecipeBom_RecipeBom_masterReceipeBomIdToRecipeBom"
    "RecipeBom" o|--|o "RecipeBom" : "RecipeBom_RecipeBom_runningRecipeBomIdToRecipeBom"
    "RecipeBom" o{--}o "RecipeBom" : "other_RecipeBom_RecipeBom_runningRecipeBomIdToRecipeBom"
    "RecipeBom" o{--}o "RecipeBomItem" : "RecipeBomItem"
    "RecipeBom" o{--}o "ProductionOrderRecipeInstance" : "ProductionOrderRecipeInstance"
    "RecipeBom" o{--}o "Recipe" : "Recipe"
    "RecipeBomItem" o|--|| "EnumRecipeBomItemOperation" : "enum:operation"
    "RecipeBomItem" o|--|o "Batch" : "Batch"
    "RecipeBomItem" o|--|o "RecipeBomItem" : "RecipeBomItem"
    "RecipeBomItem" o{--}o "RecipeBomItem" : "other_RecipeBomItem"
    "RecipeBomItem" o|--|o "Item" : "Item"
    "RecipeBomItem" o|--|o "RecipeBom" : "RecipeBom"
    "RecipeBomItem" o{--}o "MashingProtocolStep" : "MashingProtocolStep"
    "RecipeGroup" o{--}o "ProductionOrder" : "ProductionOrder"
    "RecipeGroup" o{--}o "Recipe" : "Recipe"
    "RecipeGroup" o{--}o "ScheduleOrder" : "ScheduleOrder"
    "RecipeParameter" o|--|| "EnumRecipeParameterRecipeSetpointType" : "enum:recipeSetpointType"
    "RecipeParameter" o|--|o "RecipeParameter" : "RecipeParameter"
    "RecipeParameter" o{--}o "RecipeParameter" : "other_RecipeParameter"
    "RecipeParameter" o{--}o "Recipe" : "Recipe"
    "SalesOrder" o|--|o "Customer" : "Customer"
    "SalesOrder" o|--|o "ProductionOrder" : "ProductionOrder"
    "SalesOrder" o{--}o "Item" : "Item"
    "ScheduleOrder" o|--|o "EnumScheduleOrderStatus" : "enum:status"
    "ScheduleOrder" o{--}o "ProductionOrder" : "ProductionOrder"
    "ScheduleOrder" o|--|| "RecipeGroup" : "RecipeGroup"
    "ScheduleOrder" o|--|o "ScheduleOrderQueue" : "ScheduleOrderQueue"
    "ScheduleOrder" o|--|o "Recipe" : "Recipe"
    "ScheduleOrder" o{--}o "Customer" : "Customer"
    "ScheduleOrderQueue" o|--|o "EnumScheduleOrderQueueNextOperation" : "enum:nextOperation"
    "ScheduleOrderQueue" o{--}o "ScheduleOrder" : "ScheduleOrder"
    "ScheduleOrderQueue" o|--|o "UnitProcedure" : "UnitProcedure"
    "TestParameter" o|--|o "EnumTestParameterTestSetpointType" : "enum:testSetpointType"
    "TestParameter" o|--|o "TestParameter" : "TestParameter"
    "TestParameter" o{--}o "TestParameter" : "other_TestParameter"
    "TestParameter" o|--|o "ItemReceipt" : "ItemReceipt"
    "TestParameter" o{--}o "EquipmentPhase" : "EquipmentPhase"
    "TestParameter" o{--}o "PurchaseOrder" : "PurchaseOrder"
    "UnitLookup" o|--|o "UnitLookup" : "UnitLookup"
    "UnitLookup" o{--}o "UnitLookup" : "other_UnitLookup"
    "UnitProcedure" o|--|| "EnumUnitProcedureName" : "enum:name"
    "UnitProcedure" o{--}o "Operation" : "Operation"
    "UnitProcedure" o{--}o "ScheduleOrderQueue" : "ScheduleOrderQueue"
    "UnitProcedure" o|--|o "Bom" : "Bom_UnitProcedure_bomsIdToBom"
    "UnitProcedure" o|--|o "UnitProcedure" : "UnitProcedure"
    "UnitProcedure" o{--}o "UnitProcedure" : "other_UnitProcedure"
    "UnitProcedure" o|--|o "Bom" : "Bom_UnitProcedure_primaryBomIdToBom"
    "UnitProcedure" o|--|| "Procedure" : "Procedure"
    "UnitProcedure" o{--}o "Recipe" : "Recipe"
    "UnsConfiguration" o|--}o "EnumUnsConfigurationEventType" : "enum:eventType"
    "Vendor" o{--}o "Item" : "Item"
    "Vendor" o{--}o "PurchaseOrder" : "PurchaseOrder"
```
