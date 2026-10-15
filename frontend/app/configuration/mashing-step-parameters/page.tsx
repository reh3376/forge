"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Edit,
  Trash2,
  Beaker,
  AlertTriangle,
  Settings,
  RefreshCw,
} from "lucide-react";
import {
  GET_MASHING_STEP_PARAMETER_DEFINITIONS,
  CREATE_MASHING_STEP_PARAMETER_DEFINITION,
  UPDATE_MASHING_STEP_PARAMETER_DEFINITION,
  DELETE_MASHING_STEP_PARAMETER_DEFINITION,
  MashingStepParameterDefinition,
  CreateMashingStepParameterDefinitionInput,
  UpdateMashingStepParameterDefinitionInput,
  MashingStepType,
  MashingParameterType,
  MASHING_STEP_TYPES,
  MASHING_PARAMETER_TYPES,
  PARAMETER_CATEGORIES,
} from "@/lib/api/graphql/mashing-step-parameters";

const DEFAULT_FORM_DATA: CreateMashingStepParameterDefinitionInput = {
  stepType: "Hold",
  parameterName: "",
  displayName: "",
  parameterType: "Float",
  description: "",
  unit: "",
  isRequired: true,
  defaultValue: "",
  validationMin: undefined,
  validationMax: undefined,
  deviationThreshold: undefined,
  displayOrder: 0,
  category: "Temperature",
  enumValues: [],
};

export default function MashingStepParametersPage() {
  const { toast } = useToast();
  const [selectedStepType, setSelectedStepType] = useState<MashingStepType>("Hold");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingParameter, setEditingParameter] = useState<MashingStepParameterDefinition | null>(null);
  const [deletingParameter, setDeletingParameter] = useState<MashingStepParameterDefinition | null>(null);
  const [formData, setFormData] = useState<CreateMashingStepParameterDefinitionInput>(DEFAULT_FORM_DATA);
  const [enumValuesInput, setEnumValuesInput] = useState("");

  // Query for definitions by step type
  const { data, loading, error, refetch } = useQuery<{
    mashingStepParameterDefinitions: MashingStepParameterDefinition[];
  }>(GET_MASHING_STEP_PARAMETER_DEFINITIONS, {
    variables: { stepType: selectedStepType },
  });

  const definitions = data?.mashingStepParameterDefinitions || [];

  // Mutations
  const [createDefinition, { loading: createLoading }] = useMutation(
    CREATE_MASHING_STEP_PARAMETER_DEFINITION,
    {
      onCompleted: () => {
        toast({ title: "Parameter Created", description: "Parameter definition created successfully" });
        setIsCreateDialogOpen(false);
        resetForm();
        refetch();
      },
      onError: (err) => {
        toast({ variant: "destructive", title: "Error", description: err.message });
      },
    }
  );

  const [updateDefinition, { loading: updateLoading }] = useMutation(
    UPDATE_MASHING_STEP_PARAMETER_DEFINITION,
    {
      onCompleted: () => {
        toast({ title: "Parameter Updated", description: "Parameter definition updated successfully" });
        setIsEditDialogOpen(false);
        setEditingParameter(null);
        refetch();
      },
      onError: (err) => {
        toast({ variant: "destructive", title: "Error", description: err.message });
      },
    }
  );

  const [deleteDefinition, { loading: deleteLoading }] = useMutation(
    DELETE_MASHING_STEP_PARAMETER_DEFINITION,
    {
      onCompleted: () => {
        toast({ title: "Parameter Deleted", description: "Parameter definition deleted successfully" });
        setIsDeleteDialogOpen(false);
        setDeletingParameter(null);
        refetch();
      },
      onError: (err) => {
        toast({ variant: "destructive", title: "Error", description: err.message });
      },
    }
  );

  const resetForm = () => {
    setFormData({ ...DEFAULT_FORM_DATA, stepType: selectedStepType });
    setEnumValuesInput("");
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsCreateDialogOpen(true);
  };

  const handleOpenEdit = (param: MashingStepParameterDefinition) => {
    setEditingParameter(param);
    setFormData({
      stepType: param.stepType,
      parameterName: param.parameterName,
      displayName: param.displayName,
      parameterType: param.parameterType,
      description: param.description || "",
      unit: param.unit || "",
      isRequired: param.isRequired,
      defaultValue: param.defaultValue || "",
      validationMin: param.validationMin,
      validationMax: param.validationMax,
      deviationThreshold: param.deviationThreshold,
      displayOrder: param.displayOrder,
      category: param.category || "",
      enumValues: param.enumValues || [],
    });
    setEnumValuesInput(param.enumValues?.join(", ") || "");
    setIsEditDialogOpen(true);
  };

  const handleOpenDelete = (param: MashingStepParameterDefinition) => {
    setDeletingParameter(param);
    setIsDeleteDialogOpen(true);
  };

  const handleCreate = async () => {
    const enumValues = enumValuesInput
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);

    await createDefinition({
      variables: {
        data: {
          ...formData,
          enumValues: formData.parameterType === "Enum" ? enumValues : undefined,
        },
        createdBy: "system",
      },
    });
  };

  const handleUpdate = async () => {
    if (!editingParameter) return;

    const enumValues = enumValuesInput
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);

    const updateData: UpdateMashingStepParameterDefinitionInput = {
      displayName: formData.displayName,
      description: formData.description || undefined,
      unit: formData.unit || undefined,
      isRequired: formData.isRequired,
      defaultValue: formData.defaultValue || undefined,
      validationMin: formData.validationMin,
      validationMax: formData.validationMax,
      deviationThreshold: formData.deviationThreshold,
      displayOrder: formData.displayOrder,
      category: formData.category || undefined,
      enumValues: formData.parameterType === "Enum" ? enumValues : undefined,
    };

    await updateDefinition({
      variables: {
        where: { id: editingParameter.id },
        data: updateData,
        updatedBy: "system",
      },
    });
  };

  const handleDelete = async () => {
    if (!deletingParameter) return;
    await deleteDefinition({
      variables: { where: { id: deletingParameter.id } },
    });
  };

  const getParameterTypeBadgeColor = (type: MashingParameterType) => {
    switch (type) {
      case "Float":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "Int":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "Boolean":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case "Text":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
      case "Enum":
        return "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200";
      default:
        return "";
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Settings className="h-8 w-8" />
            Mashing Step Parameters
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure parameter definitions for each mashing step type
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Add Parameter
          </Button>
        </div>
      </div>

      {/* Step Type Tabs */}
      <Tabs
        value={selectedStepType}
        onValueChange={(v) => setSelectedStepType(v as MashingStepType)}
      >
        <TabsList className="flex flex-wrap h-auto gap-1">
          {MASHING_STEP_TYPES.map((type) => (
            <TabsTrigger
              key={type.value}
              value={type.value}
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              {type.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {MASHING_STEP_TYPES.map((type) => (
          <TabsContent key={type.value} value={type.value} className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Beaker className="h-5 w-5" />
                      {type.label} Parameters
                    </CardTitle>
                    <CardDescription>{type.description}</CardDescription>
                  </div>
                  <Badge variant="secondary">
                    {definitions.length} parameter{definitions.length !== 1 ? "s" : ""}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : error ? (
                  <div className="flex items-center justify-center py-8 text-destructive">
                    <AlertTriangle className="h-5 w-5 mr-2" />
                    Failed to load parameters
                  </div>
                ) : definitions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Beaker className="h-12 w-12 mb-4" />
                    <p>No parameters defined for {type.label} steps</p>
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={handleOpenCreate}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add First Parameter
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">Order</TableHead>
                        <TableHead>Parameter Name</TableHead>
                        <TableHead>Display Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Required</TableHead>
                        <TableHead>Deviation %</TableHead>
                        <TableHead className="w-[100px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {definitions
                        .slice()
                        .sort((a, b) => a.displayOrder - b.displayOrder)
                        .map((param) => (
                          <TableRow key={param.id}>
                            <TableCell className="font-mono text-sm">
                              {param.displayOrder}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {param.parameterName}
                            </TableCell>
                            <TableCell className="font-medium">
                              {param.displayName}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={getParameterTypeBadgeColor(param.parameterType)}
                              >
                                {param.parameterType}
                              </Badge>
                            </TableCell>
                            <TableCell>{param.unit || "-"}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{param.category || "-"}</Badge>
                            </TableCell>
                            <TableCell>
                              {param.isRequired ? (
                                <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                                  Required
                                </Badge>
                              ) : (
                                <Badge variant="secondary">Optional</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {param.deviationThreshold
                                ? `${param.deviationThreshold}%`
                                : "-"}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleOpenEdit(param)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleOpenDelete(param)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Parameter Definition</DialogTitle>
            <DialogDescription>
              Add a new parameter for {MASHING_STEP_TYPES.find((t) => t.value === selectedStepType)?.label} steps
            </DialogDescription>
          </DialogHeader>
          <ParameterForm
            formData={formData}
            setFormData={setFormData}
            enumValuesInput={enumValuesInput}
            setEnumValuesInput={setEnumValuesInput}
            isEdit={false}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createLoading}>
              {createLoading ? "Creating..." : "Create Parameter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Parameter Definition</DialogTitle>
            <DialogDescription>
              Update parameter: {editingParameter?.parameterName}
            </DialogDescription>
          </DialogHeader>
          <ParameterForm
            formData={formData}
            setFormData={setFormData}
            enumValuesInput={enumValuesInput}
            setEnumValuesInput={setEnumValuesInput}
            isEdit={true}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={updateLoading}>
              {updateLoading ? "Updating..." : "Update Parameter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Parameter Definition</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deletingParameter?.displayName}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading}>
              {deleteLoading ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Parameter Form Component
interface ParameterFormProps {
  formData: CreateMashingStepParameterDefinitionInput;
  setFormData: React.Dispatch<React.SetStateAction<CreateMashingStepParameterDefinitionInput>>;
  enumValuesInput: string;
  setEnumValuesInput: React.Dispatch<React.SetStateAction<string>>;
  isEdit: boolean;
}

function ParameterForm({
  formData,
  setFormData,
  enumValuesInput,
  setEnumValuesInput,
  isEdit,
}: ParameterFormProps) {
  return (
    <div className="grid gap-4 py-4">
      {/* Row 1: Step Type & Parameter Name */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="stepType">Step Type</Label>
          <Select
            value={formData.stepType}
            onValueChange={(v) => setFormData((prev) => ({ ...prev, stepType: v as MashingStepType }))}
            disabled={isEdit}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MASHING_STEP_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="parameterName">Parameter Name (key)</Label>
          <Input
            id="parameterName"
            value={formData.parameterName}
            onChange={(e) => setFormData((prev) => ({ ...prev, parameterName: e.target.value }))}
            placeholder="e.g., grainQuantity"
            disabled={isEdit}
          />
        </div>
      </div>

      {/* Row 2: Display Name & Type */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="displayName">Display Name</Label>
          <Input
            id="displayName"
            value={formData.displayName}
            onChange={(e) => setFormData((prev) => ({ ...prev, displayName: e.target.value }))}
            placeholder="e.g., Grain Quantity"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="parameterType">Parameter Type</Label>
          <Select
            value={formData.parameterType}
            onValueChange={(v) => setFormData((prev) => ({ ...prev, parameterType: v as MashingParameterType }))}
            disabled={isEdit}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MASHING_PARAMETER_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 3: Unit & Category */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="unit">Unit</Label>
          <Input
            id="unit"
            value={formData.unit}
            onChange={(e) => setFormData((prev) => ({ ...prev, unit: e.target.value }))}
            placeholder="e.g., lbs, °F, gal"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <Select
            value={formData.category || ""}
            onValueChange={(v) => setFormData((prev) => ({ ...prev, category: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {PARAMETER_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="Describe what this parameter captures..."
          rows={2}
        />
      </div>

      {/* Enum Values (only for Enum type) */}
      {formData.parameterType === "Enum" && (
        <div className="space-y-2">
          <Label htmlFor="enumValues">Enum Values (comma-separated)</Label>
          <Input
            id="enumValues"
            value={enumValuesInput}
            onChange={(e) => setEnumValuesInput(e.target.value)}
            placeholder="e.g., Heat, Cool, Hold"
          />
        </div>
      )}

      {/* Row 4: Validation (for numeric types) */}
      {(formData.parameterType === "Float" || formData.parameterType === "Int") && (
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="validationMin">Min Value</Label>
            <Input
              id="validationMin"
              type="number"
              value={formData.validationMin ?? ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  validationMin: e.target.value ? parseFloat(e.target.value) : undefined,
                }))
              }
              placeholder="Min"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="validationMax">Max Value</Label>
            <Input
              id="validationMax"
              type="number"
              value={formData.validationMax ?? ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  validationMax: e.target.value ? parseFloat(e.target.value) : undefined,
                }))
              }
              placeholder="Max"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="deviationThreshold">Deviation Threshold (%)</Label>
            <Input
              id="deviationThreshold"
              type="number"
              step="0.1"
              value={formData.deviationThreshold ?? ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  deviationThreshold: e.target.value ? parseFloat(e.target.value) : undefined,
                }))
              }
              placeholder="e.g., 5"
            />
          </div>
        </div>
      )}

      {/* Row 5: Display Order & Required */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="displayOrder">Display Order</Label>
          <Input
            id="displayOrder"
            type="number"
            value={formData.displayOrder ?? 0}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, displayOrder: parseInt(e.target.value) || 0 }))
            }
          />
        </div>
        <div className="flex items-center gap-3 pt-6">
          <Switch
            id="isRequired"
            checked={formData.isRequired}
            onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, isRequired: checked }))}
          />
          <Label htmlFor="isRequired">Required Parameter</Label>
        </div>
      </div>

      {/* Default Value */}
      <div className="space-y-2">
        <Label htmlFor="defaultValue">Default Value</Label>
        <Input
          id="defaultValue"
          value={formData.defaultValue}
          onChange={(e) => setFormData((prev) => ({ ...prev, defaultValue: e.target.value }))}
          placeholder="Optional default value"
        />
      </div>
    </div>
  );
}
