import * as dotenv from "dotenv";
import { seedEnzymeSystemConfigurations } from "./seed.enzyme.systemconfig";

// Configure environment variables
dotenv.config();

// Run the seeder
async function testSeed() {
  console.log("=== TESTING ENZYME SYSTEM CONFIGURATION SEEDER ===");

  try {
    await seedEnzymeSystemConfigurations();
    console.log("✅ Enzyme system configurations seeded successfully");
  } catch (error) {
    console.error("❌ Error seeding enzyme system configurations:", error);
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testSeed()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("Unexpected error:", error);
      process.exit(1);
    });
}
