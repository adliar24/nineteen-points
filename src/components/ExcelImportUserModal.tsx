import React, { useState } from "react";
import { FileSpreadsheet, Download, AlertCircle } from "lucide-react";
import { supabase, supabaseAdminAuth } from "../supabaseClient";
import { fetchAllPages } from "../dbStore";
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
          "Role (guru/kepala_sekolah/murid/piket/tata_usaha)",
          "Password (opsional)",
          "Kelas (opsional untuk murid)",
        ],
        ["Hendra Wijaya, M.Si.", "19761102", "guru", "", ""],
        ["Ahmad Fauzi", "19001", "murid", "", "XII IPA 1"],
        ["Petugas Piket 1", "piket1@contoh.com", "piket", "password123", ""],
        ["Dra. Siti Nurhaliza, M.Pd.", "19780101", "kepala_sekolah", "", ""],
        ["Staff TU 1", "tu1@contoh.com", "tata_usaha", "", ""],
      ];

      const worksheet = XLSX.utils.aoa_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Template Akun SMAN 19");

      worksheet["!cols"] = [{ wch: 25 }, { wch: 22 }, { wch: 25 }, { wch: 18 }, { wch: 18 }];

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
        let duplicateCount = 0;
        let invalidRoleCount = 0;

        // Fetch existing siswa list to check before auto-inserting to table `siswa`
        const existingSiswa = await fetchAllPages<any>((from, to) =>
          supabase.from("siswa").select("nis").range(from, to)
        );
        const existingNisSet = new Set((existingSiswa || []).map((s) => String(s.nis).trim()));

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          const name = String(row[0] || "").trim();
          const username = String(row[1] || "").trim().replace(/\.0$/, "");
          const rawRole = String(row[2] || "").trim().toLowerCase();
          const passwordVal = String(row[3] || "").trim();
          const kelasVal = String(row[4] || "").trim();

          if (!name || !username || !rawRole) continue;

          // Normalize role input (accept 'murid' as 'siswa')
          let roleVal = rawRole;
          if (roleVal === "murid" || roleVal === "siswa" || roleVal === "siswa/murid") {
            roleVal = "siswa";
          } else if (
            roleVal === "kepala sekolah" ||
            roleVal === "kepala_sekolah" ||
            roleVal === "kepsek"
          ) {
            roleVal = "kepala_sekolah";
          } else if (roleVal === "guru") {
            roleVal = "guru";
          } else if (roleVal === "piket") {
            roleVal = "piket";
          } else if (roleVal === "tata usaha" || roleVal === "tata_usaha" || roleVal === "tu") {
            roleVal = "tata_usaha";
          } else {
            invalidRoleCount++;
            continue;
          }

          let emailVal = "";
          let finalPassword = "";
          let nisVal: string | null = null;

          if (roleVal === "siswa") {
            emailVal = `${username}@sman19.sch.id`;
            nisVal = username;
            finalPassword = passwordVal || "murid19*";
          } else if (roleVal === "kepala_sekolah") {
            emailVal = `${username}@sman19.sch.id`;
            finalPassword = passwordVal || "kepsek19*";
          } else if (roleVal === "guru") {
            emailVal = `${username}@sman19.sch.id`;
            finalPassword = passwordVal || "guru19*";
          } else if (roleVal === "piket") {
            if (!username.includes("@")) {
              emailVal = `${username}@sman19.sch.id`;
            } else {
              emailVal = username;
            }
            finalPassword = passwordVal || "piket19*";
          } else if (roleVal === "tata_usaha") {
            if (!username.includes("@")) {
              emailVal = `${username}@sman19.sch.id`;
            } else {
              emailVal = username;
            }
            finalPassword = passwordVal || "tatausaha19*";
          }

          try {
            // Register user in Supabase Auth
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

            if (signUpError) {
              if (
                signUpError.message.toLowerCase().includes("already registered") ||
                signUpError.message.toLowerCase().includes("already exists")
              ) {
                duplicateCount++;
              }
              throw signUpError;
            }

            // Sync student data to `siswa` table if role is 'siswa' and NIS is not in `siswa` table yet
            if (roleVal === "siswa" && nisVal) {
              if (!existingNisSet.has(nisVal)) {
                await supabase.from("siswa").insert({
                  nis: nisVal,
                  nama: name.toUpperCase(),
                  kelas: kelasVal || "Umum",
                  total_poin: 0,
                });
                existingNisSet.add(nisVal);
              }
            }

            addedCount++;
            await new Promise((r) => setTimeout(r, 150));
          } catch (err: any) {
            console.error(`Gagal mendaftarkan akun ${emailVal}:`, err);
            failCount++;
          }
        }

        if (addedCount > 0) {
          onClose();
          onSuccess();
        } else {
          let msg = "Tidak ada baris data baru yang valid untuk diimpor.";
          if (duplicateCount > 0) {
            msg = `Gagal mengimpor: ${duplicateCount} akun/NIS sudah terdaftar di sistem.`;
          } else if (invalidRoleCount > 0) {
            msg = `Gagal mengimpor: Role di Excel tidak dikenali. Gunakan "guru", "kepala_sekolah", "murid", "piket", atau "tata_usaha".`;
          } else if (failCount > 0) {
            msg = `Gagal mengimpor ${failCount} akun. Kemungkinan NIS/NIP/Email sudah terdaftar.`;
          }
          setImportUserError(msg);
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
          Unggah file Excel berisi data akun. Kolom Username diisi NIS (untuk murid) atau NIP (untuk
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
