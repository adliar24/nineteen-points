import React, { useState } from "react";
import { FileSpreadsheet, Download, ChevronDown } from "lucide-react";
import { getSiswaList } from "../dbStore";
import { supabase, supabaseAdminAuth } from "../supabaseClient";
import * as XLSX from "xlsx";
import ModalPortal from "./ModalPortal";

interface ImportStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  showToast: (msg: string) => void;
}

export default function ImportStudentModal({
  isOpen,
  onClose,
  onSuccess,
  showToast,
}: ImportStudentModalProps) {
  const [importError, setImportError] = useState("");
  const [isImportingExcel, setIsImportingExcel] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatusMsg, setImportStatusMsg] = useState("");
  const [importText, setImportText] = useState("");

  const downloadTemplate = () => {
    try {
      const data = [
        ["NIS", "Nama Murid", "Kelas"],
        ["19001", "Ahmad Fauzi", "XII IPA 1"],
        ["19002", "Siti Aminah", "XII IPA 2"],
        ["19003", "Rian Hidayat", "XII IPS 1"],
        ["19004", "Dewi Sartika", "XII IPS 2"],
      ];

      const worksheet = XLSX.utils.aoa_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Template Murid SMAN 19");

      worksheet["!cols"] = [{ wch: 12 }, { wch: 25 }, { wch: 15 }];

      XLSX.writeFile(workbook, "TEMPLATE_IMPORT_MURID_SMAN19.xlsx");
      showToast("Template Excel berhasil diunduh!");
    } catch (err: any) {
      console.error(err);
      alert("Gagal mengunduh template: " + err.message);
    }
  };

  const processNewSiswa = async (
    newSiswaToInsert: any[],
    addedCount: number,
    duplicateCount: number
  ) => {
    if (newSiswaToInsert.length > 0) {
      setImportStatusMsg(`Menyimpan ${newSiswaToInsert.length} data murid baru...`);
      const { error } = await supabase.from("siswa").insert(newSiswaToInsert);
      if (error) throw error;

      let authFailedCount = 0;
      for (let idx = 0; idx < newSiswaToInsert.length; idx++) {
        const s = newSiswaToInsert[idx];
        setImportStatusMsg(
          `Membuat akun (${idx + 1}/${newSiswaToInsert.length}): ${s.nama}...`
        );
        setImportProgress(Math.round((idx / newSiswaToInsert.length) * 100));
        try {
          const { error: signUpError } = await supabaseAdminAuth.auth.admin.createUser({
            email: `${s.nis}@sman19.sch.id`,
            password: `Siswa${s.nis}`,
            email_confirm: true,
            user_metadata: {
              fullName: s.nama,
              role: "siswa",
              nis: s.nis,
            },
          });
          if (signUpError) throw signUpError;
        } catch (authErr) {
          console.error(`Gagal membuat akun auth untuk siswa NIS ${s.nis}:`, authErr);
          authFailedCount++;
        }
      }

      setImportProgress(100);
      setImportStatusMsg("Menyinkronkan data...");
      onClose();
      onSuccess();

      if (authFailedCount === 0) {
        showToast(
          `Sukses mengimpor ${addedCount} murid & akun login mereka!${
            duplicateCount > 0 ? ` (${duplicateCount} NIS duplikat dilewati).` : ""
          }`
        );
      } else {
        showToast(
          `Sukses mengimpor ${addedCount} murid (${
            addedCount - authFailedCount
          } akun berhasil, ${authFailedCount} gagal).`
        );
      }
    } else {
      setImportError(
        "Tidak ada baris data baru yang valid untuk diimpor. Pastikan NIS unik."
      );
    }
  };

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError("");
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      setIsImportingExcel(true);
      setImportProgress(0);
      setImportStatusMsg("Membaca data berkas Excel...");
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });

        if (rows.length < 2) {
          setImportError("File Excel kosong atau tidak memiliki baris data.");
          setIsImportingExcel(false);
          return;
        }

        const currentList = await getSiswaList();
        let addedCount = 0;
        let duplicateCount = 0;
        const newSiswaToInsert: any[] = [];

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          const nis = String(row[0] || "").trim();
          const nama = String(row[1] || "").trim().toUpperCase();
          const kelas = String(row[2] || "").trim();
          const total_poin = 0;

          if (!nis || !nama || !kelas) continue;

          if (
            currentList.some((s) => s.nis === nis) ||
            newSiswaToInsert.some((s) => s.nis === nis)
          ) {
            duplicateCount++;
            continue;
          }

          newSiswaToInsert.push({ nis, nama, kelas, total_poin });
          addedCount++;
        }

        await processNewSiswa(newSiswaToInsert, addedCount, duplicateCount);
      } catch (err: any) {
        console.error(err);
        setImportError("Gagal membaca file Excel: " + err.message);
      } finally {
        setIsImportingExcel(false);
        setImportProgress(0);
        setImportStatusMsg("");
        e.target.value = "";
      }
    };

    reader.onerror = () => {
      setImportError("Gagal membaca file.");
      setIsImportingExcel(false);
    };

    reader.readAsBinaryString(file);
  };

  const handleImportCSV = async (e: React.FormEvent) => {
    e.preventDefault();
    setImportError("");

    if (!importText.trim()) {
      setImportError("Masukkan teks CSV terlebih dahulu.");
      return;
    }

    setIsImportingExcel(true);
    setImportProgress(0);
    setImportStatusMsg("Memproses teks CSV...");

    const lines = importText.split("\n");
    const currentList = await getSiswaList();
    let addedCount = 0;
    let duplicateCount = 0;
    const newSiswaToInsert: any[] = [];

    for (let line of lines) {
      const row = line.trim();
      if (!row) continue;

      const parts = row.split(/[,;\t]/);
      if (parts.length < 3) continue;

      const nis = parts[0].trim();
      const nama = parts[1].trim().toUpperCase();
      const kelas = parts[2].trim();
      const total_poin = parts[3] ? parseInt(parts[3].trim(), 10) || 0 : 0;

      if (!nis || !nama || !kelas) continue;

      if (
        currentList.some((s) => s.nis === nis) ||
        newSiswaToInsert.some((s) => s.nis === nis)
      ) {
        duplicateCount++;
        continue;
      }

      newSiswaToInsert.push({ nis, nama, kelas, total_poin });
      addedCount++;
    }

    try {
      await processNewSiswa(newSiswaToInsert, addedCount, duplicateCount);
      setImportText("");
    } catch (err: any) {
      setImportError("Gagal mengimpor CSV: " + err.message);
    } finally {
      setIsImportingExcel(false);
      setImportProgress(0);
      setImportStatusMsg("");
    }
  };

  const handleClose = () => {
    setImportError("");
    setImportText("");
    onClose();
  };

  return (
    <ModalPortal
      isOpen={isOpen}
      onClose={handleClose}
      title="Impor Data Murid"
      icon={FileSpreadsheet}
      maxWidth="max-w-lg"
    >
      {isImportingExcel ? (
        <div className="py-12 flex flex-col items-center justify-center space-y-4">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-brand-100 border-t-brand-600 animate-spin"></div>
          </div>
          <div className="text-center space-y-1">
            <p className="text-xs font-black text-brand-950 uppercase tracking-wider">
              {importStatusMsg}
            </p>
            <p className="text-[10px] text-brand-400 font-bold">{importProgress}% Selesai</p>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 max-w-xs overflow-hidden border border-slate-200">
            <div
              className="bg-brand-600 h-full rounded-full transition-all duration-300"
              style={{ width: `${importProgress}%` }}
            ></div>
          </div>
        </div>
      ) : (
        <>
          {importError && (
            <div className="p-3 bg-rose-50 text-rose-800 text-xs font-semibold rounded-xl border border-rose-200 mb-4">
              {importError}
            </div>
          )}

          <div className="flex justify-between items-center bg-brand-50 p-3.5 rounded-2xl border border-brand-100 mb-4">
            <div className="text-left">
              <p className="text-xs font-black text-brand-950">Belum punya formatnya?</p>
              <p className="text-[10px] text-brand-500 font-semibold leading-none mt-1">
                Gunakan template resmi SMAN 19 Bandung.
              </p>
            </div>
            <button
              type="button"
              onClick={downloadTemplate}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-white text-brand-700 hover:text-brand-900 border border-brand-200 hover:border-brand-300 rounded-xl text-[10px] font-black shadow-xs transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Unduh Template
            </button>
          </div>

          <div className="space-y-1.5 mb-4">
            <label className="text-[10px] font-black text-brand-400 uppercase tracking-wider block">
              Unggah Berkas Excel (.xlsx, .xls, .csv)
            </label>
            <div className="border-2 border-dashed border-brand-200 hover:border-brand-400 rounded-2xl p-6 text-center cursor-pointer bg-brand-50/10 hover:bg-brand-50/20 transition-all relative">
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleExcelImport}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <FileSpreadsheet className="w-8 h-8 text-brand-500 mx-auto mb-2" />
              <p className="text-xs font-bold text-brand-950">Pilih atau Seret File Excel</p>
              <p className="text-[10px] text-brand-400 font-medium mt-1">
                Sistem akan otomatis mendeteksi kolom NIS, Nama, dan Kelas.
              </p>
            </div>
          </div>

          <details className="group border border-brand-100 rounded-2xl p-1 bg-brand-50/20">
            <summary className="text-[11px] font-bold text-brand-600 hover:text-brand-900 p-2 cursor-pointer select-none flex items-center justify-between list-none">
              <span>Atau gunakan alternatif salin-tempel teks (CSV)...</span>
              <ChevronDown className="w-3.5 h-3.5 transform group-open:rotate-180 transition-transform" />
            </summary>

            <div className="p-3 space-y-3 pt-1">
              <div className="text-[10px] text-brand-500 font-medium">
                Ketik langsung atau tempel baris-baris data Anda dengan format:
                <code className="block p-2 bg-slate-900 text-slate-100 rounded-lg text-[10px] font-mono font-bold select-all mt-1.5">
                  NIS,NamaMurid,Kelas
                  <br />
                  19013,Cahya Lestari,XII IPS 1
                </code>
              </div>

              <form onSubmit={handleImportCSV} className="space-y-3">
                <textarea
                  rows={4}
                  placeholder="Contoh: 19025,Amir Hamzah,XII IPA 2"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  className="w-full border border-brand-100 rounded-xl p-3 text-[11px] font-mono font-semibold text-brand-900 focus:ring-2 focus:ring-brand-500 outline-none bg-white placeholder-brand-300"
                ></textarea>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-black rounded-xl transition-all cursor-pointer"
                >
                  Proses Impor Teks
                </button>
              </form>
            </div>
          </details>
        </>
      )}
    </ModalPortal>
  );
}
