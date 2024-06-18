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
import { LotList } from "./lot/LotList";
import { LotCreate } from "./lot/LotCreate";
import { LotEdit } from "./lot/LotEdit";
import { LotShow } from "./lot/LotShow";
import { BarrelList } from "./barrel/BarrelList";
import { BarrelCreate } from "./barrel/BarrelCreate";
import { BarrelEdit } from "./barrel/BarrelEdit";
import { BarrelShow } from "./barrel/BarrelShow";
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
        title={"core-mes"}
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
          name="Lot"
          list={LotList}
          edit={LotEdit}
          create={LotCreate}
          show={LotShow}
        />
        <Resource
          name="Barrel"
          list={BarrelList}
          edit={BarrelEdit}
          create={BarrelCreate}
          show={BarrelShow}
        />
      </Admin>
    </div>
  );
};

export default App;
