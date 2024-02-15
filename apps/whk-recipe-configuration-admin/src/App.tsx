import React, { useEffect, useState } from "react";
import { Admin, DataProvider, Resource } from "react-admin";
import buildGraphQLProvider from "./data-provider/graphqlDataProvider";
import { theme } from "./theme/theme";
import Login from "./Login";
import "./App.scss";
import Dashboard from "./pages/Dashboard";
import { UserList } from "./user/UserList";
import { UserCreate } from "./user/UserCreate";
import { UserEdit } from "./user/UserEdit";
import { UserShow } from "./user/UserShow";
import { PhaseParameterList } from "./phaseParameter/PhaseParameterList";
import { PhaseParameterCreate } from "./phaseParameter/PhaseParameterCreate";
import { PhaseParameterEdit } from "./phaseParameter/PhaseParameterEdit";
import { PhaseParameterShow } from "./phaseParameter/PhaseParameterShow";
import { TestParameterList } from "./testParameter/TestParameterList";
import { TestParameterCreate } from "./testParameter/TestParameterCreate";
import { TestParameterEdit } from "./testParameter/TestParameterEdit";
import { TestParameterShow } from "./testParameter/TestParameterShow";
import { RecipeParameterList } from "./recipeParameter/RecipeParameterList";
import { RecipeParameterCreate } from "./recipeParameter/RecipeParameterCreate";
import { RecipeParameterEdit } from "./recipeParameter/RecipeParameterEdit";
import { RecipeParameterShow } from "./recipeParameter/RecipeParameterShow";
import { InstructionList } from "./instruction/InstructionList";
import { InstructionCreate } from "./instruction/InstructionCreate";
import { InstructionEdit } from "./instruction/InstructionEdit";
import { InstructionShow } from "./instruction/InstructionShow";
import { EquipmentPhaseList } from "./equipmentPhase/EquipmentPhaseList";
import { EquipmentPhaseCreate } from "./equipmentPhase/EquipmentPhaseCreate";
import { EquipmentPhaseEdit } from "./equipmentPhase/EquipmentPhaseEdit";
import { EquipmentPhaseShow } from "./equipmentPhase/EquipmentPhaseShow";
import { OperationList } from "./operation/OperationList";
import { OperationCreate } from "./operation/OperationCreate";
import { OperationEdit } from "./operation/OperationEdit";
import { OperationShow } from "./operation/OperationShow";
import { ProcedureList } from "./procedure/ProcedureList";
import { ProcedureCreate } from "./procedure/ProcedureCreate";
import { ProcedureEdit } from "./procedure/ProcedureEdit";
import { ProcedureShow } from "./procedure/ProcedureShow";
import { jwtAuthProvider } from "./auth-provider/ra-auth-jwt";

const App = (): React.ReactElement => {
  const [dataProvider, setDataProvider] = useState<DataProvider | null>(null);
  useEffect(() => {
    buildGraphQLProvider
      .then((provider: any) => {
        setDataProvider(() => provider);
      })
      .catch((error: any) => {
        console.log(error);
      });
  }, []);
  if (!dataProvider) {
    return <div>Loading</div>;
  }
  return (
    <div className="App">
      <Admin
        title={"whk-recipe-configuration"}
        dataProvider={dataProvider}
        authProvider={jwtAuthProvider}
        theme={theme}
        dashboard={Dashboard}
        loginPage={Login}
      >
        <Resource
          name="User"
          list={UserList}
          edit={UserEdit}
          create={UserCreate}
          show={UserShow}
        />
        <Resource
          name="PhaseParameter"
          list={PhaseParameterList}
          edit={PhaseParameterEdit}
          create={PhaseParameterCreate}
          show={PhaseParameterShow}
        />
        <Resource
          name="TestParameter"
          list={TestParameterList}
          edit={TestParameterEdit}
          create={TestParameterCreate}
          show={TestParameterShow}
        />
        <Resource
          name="RecipeParameter"
          list={RecipeParameterList}
          edit={RecipeParameterEdit}
          create={RecipeParameterCreate}
          show={RecipeParameterShow}
        />
        <Resource
          name="Instruction"
          list={InstructionList}
          edit={InstructionEdit}
          create={InstructionCreate}
          show={InstructionShow}
        />
        <Resource
          name="EquipmentPhase"
          list={EquipmentPhaseList}
          edit={EquipmentPhaseEdit}
          create={EquipmentPhaseCreate}
          show={EquipmentPhaseShow}
        />
        <Resource
          name="Operation"
          list={OperationList}
          edit={OperationEdit}
          create={OperationCreate}
          show={OperationShow}
        />
        <Resource
          name="Procedure"
          list={ProcedureList}
          edit={ProcedureEdit}
          create={ProcedureCreate}
          show={ProcedureShow}
        />
      </Admin>
    </div>
  );
};

export default App;
