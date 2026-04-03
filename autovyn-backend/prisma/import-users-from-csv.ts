import 'dotenv/config';
import { importUsersFromCsv } from './import-users';

const parseArgs = (): { csvPath: string; defaultPassword?: string } => {
  const args = process.argv.slice(2);
  const csvPath = args[0];
  if (!csvPath) {
    throw new Error('Usage: tsx prisma/import-users-from-csv.ts <csv-path> [--default-password <password>]');
  }

  let defaultPassword: string | undefined;
  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--default-password') {
      const value = args[i + 1];
      if (!value?.trim()) {
        throw new Error('Expected a non-empty value after --default-password.');
      }
      defaultPassword = value.trim();
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { csvPath, defaultPassword };
};

const main = async (): Promise<void> => {
  const { csvPath, defaultPassword } = parseArgs();
  const result = await importUsersFromCsv({ csvPath, defaultPassword });

  console.log(`Imported users: ${result.created}`);
  console.log(`Manager links mapped: ${result.managerMapped}`);
  console.log(`Skipped duplicate loginIds: ${result.skippedDuplicates}`);
  console.log(`Previous month attendance rows created: ${result.attendanceRowsCreated}`);

  if (result.passwordMode === 'fixed') {
    console.log('Password mode: fixed default password for all imported users.');
    console.log(`Users assigned default password: ${result.overriddenPasswordCount}`);
    return;
  }

  console.log('Password mode: CSV UserPassword with employeeId fallback when blank.');
  console.log(`Users using CSV password: ${result.csvPasswordCount}`);
  console.log(`Users falling back to employeeId password: ${result.fallbackPasswordCount}`);
  console.log('Tip: pass --default-password <password> during import if you want one known password for all imported users.');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
