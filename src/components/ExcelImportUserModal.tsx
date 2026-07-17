import React, { useState } from "react";
import { FileSpreadsheet, Download, AlertCircle } from "lucide-react";
import { supabaseAdminAuth } from "../supabaseClient";
import * as XLSX from "xlsx";
import ModalPortal from "./ModalPortal";

interface ExcelImportUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ExcelImportUserModal({
  isOpen,
  onClose,
  onSuccess,
}: ExcelImportUserModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importUserError, setImportUserError] = useState("");

  const downloadTemplate = () => {
    try {
      const data = [
        [
          "Nama Lengkap",
          "Username (NIS/NIP)",
          "Role (guru/kepala_sekolah/siswa/piket)",
          "Password (opsional)",
        ],
        ["Hendra Wijaya, M.Si.", "19761102", "guru", ""],
        ["Ahmad Fauzi", "19001", "siswa", ""],
        ["Petugas Piket 1", "piket1@contoh.com", "piket", "password123"],
        ["Dra. Siti Nurhaliza, M.Pd.", "19780101", "kepala_sekolah", ""],
      ];

      const worksheet = XLSX.utils.aoa_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Template Akun SMAN 19");

      worksheet["!cols"] = [{ wch: 25 }, { wch: 22 }, { wch: 20 }, { wch: 18 }];

      XLSX.writeFile(workbook, "TEMPLATE_IMPORT_AKUN_SMAN19.xlsx");
    } catch (err: any) {
      alert("Gagal mengunduh template: " + err.message);
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportUserError("");
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSubmitting(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });

        if (rows.length < 2) {
          setImportUserError("File Excel kosong atau tidak memiliki data.");
          setIsSubmitting(false);
          return;
        }

        let addedCount = 0;
        let failCount = 0;

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          const name = String(row[0] || "").trim();
          const username = String(row[1] || "").trim();
          const roleVal = String(row[2] || "").trim().toLowerCase();
          const passwordVal = String(row[3] || "").trim();

          if (!name || !username || !roleVal) continue;
          if (
            roleVal !== "guru" &&
            roleVal !== "siswa" &&
            roleVal !== "piket" &&
            roleVal !== "kepala_sekolah"
          )
            continue;

          let emailVal = "";
          let finalPassword = "";
          let nisVal = null;

          if (roleVal === "siswa") {
            emailVal = `${username}@sman19.sch.id`;
            nisVal = username;
            finalPassword = passwordVal || `Siswa${username}`;
          } else if (roleVal === "guru" || roleVal === "kepala_sekolah") {
            emailVal = `${username}@sman19.sch.id`;
            finalPassword = passwordVal || "guru19*";
          } else if (roleVal === "piket") {
            if (!username.includes("@")) continue;
            emailVal = username;
            if (!passwordVal) continue;
            finalPassword = passwordVal;
          }

          try {
            const { error: signUpError } = await supabaseAdminAuth.auth.admin.createUser({
              email: emailVal,
              password: finalPassword,
              email_confirm: true,
              user_metadata: {
                fullName: name,
                role: roleVal,
                nis: nisVal,
              },
            });

            if (signUpError) throw signUpError;
            addedCount++;
            await new Promise((r) => setTimeout(r, 200));
          } catch (err) {
            console.error(`Gagal mendaftarkan akun ${emailVal}:`, err);
            failCount++;
          }
        }

        if (addedCount > 0) {
          onClose();
          onSuccess();
        } else {
          setImportUserError("Tidak ada baris data baru yang valid untuk diimpor.");
        }
      } catch (err: any) {
        setImportUserError("Gagal membaca Excel: " + err.message);
      } finally {
        setIsSubmitting(false);
        e.target.value = "";
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleClose = () => {
    setImportUserError("");
    onClose();
  };

  return (
    <ModalPortal
      isOpen={isOpen}
      onClose={handleClose}
      title="Impor Akun Massal dari Excel"
      icon={FileSpreadsheet}
    >
      <div className="space-y-4">
        <p className="text-xs text-brand-500 leading-relaxed font-medium">
          Unggah file Excel berisi data akun. Kolom Username diisi NIS (untuk siswa) atau NIP (untuk
          guru/kepala sekolah). Sistem akan otomatis membuat email login{" "}
          <strong className="text-brand-700">@sman19.sch.id</strong>.
        </p>

        <div className="bg-brand-50/70 border border-brand-100 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-brand-950">Unduh Template Excel</h4>
            <p className="text-xs text-brand-400 font-medium mt-0.5">
              Gunakan format ini untuk import
            </p>
          </div>
          <button
            onClick={downloadTemplate}
            className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold border border-emerald-200 rounded-xl text-sm flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Template
          </button>
        </div>

        {importUserError && (
          <div className="p-3.5 bg-rose-50 rounded-2xl border border-rose-100 text-sm text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4.5 h-4.5 text-rose-600 flex-shrink-0" />
            <span>{importUserError}</span>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-xs font-black text-brand-900 uppercase block">
            Pilih Berkas Excel (.xlsx / .xls)
          </label>
          <input
            type="file"
            accept=".xlsx, .xls"
            onChange={handleImport}
            disabled={isSubmitting}
            className="w-full text-sm text-brand-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 file:cursor-pointer disabled:opacity-50"
          />
        </div>
      </div>

      {isSubmitting && (
        <div className="py-4 text-center">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-xs font-bold text-brand-600">
            Sedang memproses & mendaftarkan akun di database Supabase...
          </p>
        </div>
      )}

      <div className="flex justify-end pt-3 border-t border-brand-50">
        <button
          onClick={handleClose}
          className="px-4 py-2 border border-brand-100 rounded-xl text-xs font-bold text-brand-600 hover:bg-brand-50 cursor-pointer"
        >
          Tutup
        </button>
      </div>
    </ModalPortal>
  );
}
