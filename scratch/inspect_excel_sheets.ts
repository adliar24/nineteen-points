import XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

function inspectExcel() {
  const folderPath = path.join(process.cwd(), "kelasfix");
  const files = ["KELAS X.xlsx", "KELAS XI.xlsx", "KELAS XII.xlsx"];

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    console.log(`\n=================================================`);
    console.log(`  FILE: ${file}`);
    console.log(`=================================================`);

    const workbook = XLSX.readFile(filePath);
    console.log(`Sheet Names (${workbook.SheetNames.length}):`, workbook.SheetNames);

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      console.log(`\n--- Sheet: '${sheetName}' (Total rows: ${rows.length}) ---`);

      // Print first 5 non-empty rows to see structure
      const sample = rows.filter((r) => r && r.length > 0).slice(0, 5);
      sample.forEach((r, idx) => console.log(`  Row ${idx + 1}:`, r.slice(0, 8)));
    }
  }
}

inspectExcel();
