import { SeedModule, SEED_PRIORITIES } from "../config";
import { usersModule } from "./users";
import { unitLinksModule } from "./unit-links";
import { itemGroupsModule } from "./item-groups";
import { testParametersModule } from "./test-parameters";
import { customersModule } from "./customers";
import { unitsModule } from "./units";
import { derivedUnitsModule } from "./derived-units";
import { basicItemsModule } from "./basic-items";
import { assetsModule } from "./assets";
import { equipmentHierarchyModule } from "./equipment-hierarchy";
import { unitsItemGroupsModule } from "./units-itemgroups";
import { binConfigurationsModule } from "./bin-configurations";
import { operationsModule } from "./operations";
import { recipeGroupsModule } from "./recipe-groups";
import { mashingProtocolsModule } from "./mashing-protocols";
import { recipesModule } from "./recipes";
import { recipeBomsModule } from "./recipe-boms";
import { scheduleOrdersModule } from "./schedule-orders";
import { recipeParametersModule } from "./recipe-parameters";
import { mashingProtocolStepsModule } from "./mashing-protocol-steps";
import { customerLinksValidationModule } from "./customer-links-validation";
import { enzymeConfigModule } from "./enzyme-config";
// Temporarily disabled imports due to schema issues:
// import { coreConfigModule } from './core-config';
// import { vendorsCustomersModule } from './vendors-customers';
// import { itemsModule } from './items';
// import { recipesModule } from './recipes';
// import { protocolsModule } from './protocols';

export async function loadSeedModules(): Promise<SeedModule[]> {
  return [
    usersModule,
    unitLinksModule,
    itemGroupsModule,
    testParametersModule,
    customersModule,
    unitsModule,
    derivedUnitsModule,
    basicItemsModule,
    assetsModule,
    equipmentHierarchyModule,
    unitsItemGroupsModule,
    binConfigurationsModule,
    recipeGroupsModule,
    mashingProtocolsModule,
    recipesModule,
    recipeBomsModule,
    operationsModule,
    scheduleOrdersModule,
    recipeParametersModule,
    mashingProtocolStepsModule,
    customerLinksValidationModule,
    enzymeConfigModule,
    // Temporarily disabled modules with schema issues:
    // coreConfigModule,
    // vendorsCustomersModule,
    // itemsModule,
    // protocolsModule,
  ];
}

// Re-export individual modules for direct use
// Temporarily disabled exports due to schema issues:
// export {
//   coreConfigModule,
//   vendorsCustomersModule,
//   itemsModule,
//   recipesModule,
//   protocolsModule,
//   enzymeConfigModule,
// };
