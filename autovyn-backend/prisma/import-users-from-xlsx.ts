import 'dotenv/config';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const main = async (): Promise<void> => {
  const xlsxPath = process.argv[2];
  const passthroughArgs = process.argv.slice(3);
  if (!xlsxPath) {
    throw new Error('Usage: tsx prisma/import-users-from-xlsx.ts <xlsx-path> [--default-password <password>]');
  }

  const absolutePath = path.resolve(xlsxPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`XLSX file not found: ${absolutePath}`);
  }

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autovyn-xlsx-'));
  const outCsv = path.join(outDir, `${path.basename(absolutePath, path.extname(absolutePath))}.csv`);

  // Converts first worksheet into CSV using LibreOffice.
  execFileSync(
    'libreoffice',
    [
      '--headless',
      '--convert-to',
      'csv:Text - txt - csv (StarCalc):44,34,76,1',
      '--outdir',
      outDir,
      absolutePath
    ],
    { stdio: 'inherit' }
  );

  if (!fs.existsSync(outCsv)) {
    throw new Error(`CSV conversion failed. Expected file missing: ${outCsv}`);
  }

  execFileSync('npx', ['tsx', 'prisma/import-users-from-csv.ts', outCsv, ...passthroughArgs], { stdio: 'inherit' });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
