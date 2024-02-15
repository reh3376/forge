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
import { ParameterTypeList } from "./parameterType/ParameterTypeList";
import { ParameterTypeCreate } from "./parameterType/ParameterTypeCreate";
import { ParameterTypeEdit } from "./parameterType/ParameterTypeEdit";
import { ParameterTypeShow } from "./parameterType/ParameterTypeShow";
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
import { OperationStepList } from "./operationStep/OperationStepList";
import { OperationStepCreate } from "./operationStep/OperationStepCreate";
import { OperationStepEdit } from "./operationStep/OperationStepEdit";
import { OperationStepShow } from "./operationStep/OperationStepShow";
import { OperationList } from "./operation/OperationList";
import { OperationCreate } from "./operation/OperationCreate";
import { OperationEdit } from "./operation/OperationEdit";
import { OperationShow } from "./operation/OperationShow";
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
          name="ParameterType"
          list={ParameterTypeList}
          edit={ParameterTypeEdit}
          create={ParameterTypeCreate}
          show={ParameterTypeShow}
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
          name="OperationStep"
          list={OperationStepList}
          edit={OperationStepEdit}
          create={OperationStepCreate}
          show={OperationStepShow}
        />
        <Resource
          name="Operation"
          list={OperationList}
          edit={OperationEdit}
          create={OperationCreate}
          show={OperationShow}
        />
      </Admin>
    </div>
  );
};

export default App;
