import 'dotenv/config';
import { importUsersFromCsv, resolveBundledDummyUsersCsvPath } from './import-users';

async function main(): Promise<void> {
  const csvPath = resolveBundledDummyUsersCsvPath();
  const result = await importUsersFromCsv({ csvPath });

  console.log(`Database seeded from bundled dummy CSV: ${csvPath}`);
  console.log(`Imported users: ${result.created}`);
  console.log(`Manager links mapped: ${result.managerMapped}`);
  console.log(`Previous month attendance rows created: ${result.attendanceRowsCreated}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
