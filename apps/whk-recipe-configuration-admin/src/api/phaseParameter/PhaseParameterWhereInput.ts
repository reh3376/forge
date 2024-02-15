import { StringFilter } from "../../util/StringFilter";
import { StringNullableFilter } from "../../util/StringNullableFilter";
import { EquipmentPhaseWhereUniqueInput } from "../equipmentPhase/EquipmentPhaseWhereUniqueInput";
import { BooleanNullableFilter } from "../../util/BooleanNullableFilter";
import { FloatNullableFilter } from "../../util/FloatNullableFilter";
import { IntFilter } from "../../util/IntFilter";

export type PhaseParameterWhereInput = {
  createdBy?: StringFilter;
  editedBy?: StringNullableFilter;
  equipmentPhase?: EquipmentPhaseWhereUniqueInput;
  id?: StringFilter;
  itemId?: StringNullableFilter;
  recipeId?: StringNullableFilter;
  schemaVersion?: StringNullableFilter;
  setpointBooleanValue?: BooleanNullableFilter;
  setpointLowerLimit?: FloatNullableFilter;
  setpointNumericalValue?: FloatNullableFilter;
  setpointType?: "Boolean" | "Numeric";
  setpointUpperLimit?: FloatNullableFilter;
  typeDescription?: StringFilter;
  typeName?: StringFilter;
  typeRevision?: IntFilter;
  typeUnits?: StringFilter;
};
