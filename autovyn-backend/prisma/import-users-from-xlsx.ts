import 'dotenv/config';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const PYTHON_XLSX_TO_CSV_SCRIPT = String.raw`
import csv
import sys
import zipfile
import xml.etree.ElementTree as ET

XLSX_PATH = sys.argv[1]
OUT_CSV_PATH = sys.argv[2]

NS = {
    'a': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
}

def column_index_from_ref(cell_ref: str) -> int:
    letters = ''.join(ch for ch in cell_ref if ch.isalpha()).upper()
    result = 0
    for ch in letters:
        result = result * 26 + ord(ch) - 64
    return result - 1

with zipfile.ZipFile(XLSX_PATH) as archive:
    workbook = ET.fromstring(archive.read('xl/workbook.xml'))
    first_sheet = workbook.find('a:sheets/a:sheet', NS)
    if first_sheet is None:
        raise RuntimeError('Workbook has no worksheets.')

    relationship_id = first_sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']
    relationships = ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))
    target_by_id = {rel.attrib['Id']: rel.attrib['Target'] for rel in relationships}

    target = target_by_id[relationship_id]
    if not target.startswith('xl/'):
        target = f'xl/{target}'

    shared_strings = []
    if 'xl/sharedStrings.xml' in archive.namelist():
        shared = ET.fromstring(archive.read('xl/sharedStrings.xml'))
        for item in shared.findall('a:si', NS):
            shared_strings.append(''.join(node.text or '' for node in item.findall('.//a:t', NS)))

    worksheet = ET.fromstring(archive.read(target))

    with open(OUT_CSV_PATH, 'w', newline='', encoding='utf-8') as handle:
        writer = csv.writer(handle)
        for row in worksheet.findall('.//a:sheetData/a:row', NS):
            output = []
            for cell in row.findall('a:c', NS):
                ref = cell.attrib.get('r', '')
                target_index = column_index_from_ref(ref) if ref else len(output)
                while len(output) < target_index:
                    output.append('')

                cell_type = cell.attrib.get('t')
                value = ''
                raw_value = cell.find('a:v', NS)
                if cell_type == 'inlineStr':
                    value = ''.join(node.text or '' for node in cell.findall('.//a:t', NS))
                elif raw_value is not None and raw_value.text is not None:
                    value = raw_value.text
                    if cell_type == 's' and value.isdigit():
                        value = shared_strings[int(value)]

                output.append(value)

            writer.writerow(output)
`;

const convertWithLibreOffice = (absolutePath: string, outDir: string): void => {
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
};

const convertWithPython = (absolutePath: string, outCsv: string): void => {
  execFileSync('python3', ['-', absolutePath, outCsv], {
    input: PYTHON_XLSX_TO_CSV_SCRIPT,
    stdio: ['pipe', 'inherit', 'inherit']
  });
};

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

  try {
    // Prefer LibreOffice when available because it preserves spreadsheet rendering rules well.
    convertWithLibreOffice(absolutePath, outDir);
  } catch (error) {
    console.warn('LibreOffice conversion failed, falling back to built-in Python XLSX parsing.', error);
    convertWithPython(absolutePath, outCsv);
  }

  if (!fs.existsSync(outCsv)) {
    throw new Error(`CSV conversion failed. Expected file missing: ${outCsv}`);
  }

  execFileSync('npx', ['tsx', 'prisma/import-users-from-csv.ts', outCsv, ...passthroughArgs], { stdio: 'inherit' });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
