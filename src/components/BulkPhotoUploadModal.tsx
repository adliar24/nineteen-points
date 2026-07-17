import React, { useState } from "react";
import { Camera, Image, FileSpreadsheet, X } from "lucide-react";
import { compressImage } from "../compressImage";
import { supabase } from "../supabaseClient";
import { Profile } from "../types";
import { toSentenceCase } from "../formatName";

interface PhotoMatchItem {
  id: string;
  file: File;
  previewUrl: string;
  status: "matched" | "suggested" | "nomatch";
  matchedProfileId: string | null;
  similarity: number;
}

interface BulkPhotoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  profiles: Profile[];
  showToast: (msg: string, type?: "success" | "error" | "loading") => void;
}

export default function BulkPhotoUploadModal({
  isOpen,
  onClose,
  onSuccess,
  profiles,
  showToast,
}: BulkPhotoUploadModalProps) {
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [uploadStatusMsg, setUploadStatusMsg] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [photoMatchItems, setPhotoMatchItems] = useState<PhotoMatchItem[]>([]);

  const calculateSimilarity = (a: string, b: string): number => {
    const lenA = a.length;
    const lenB = b.length;
    if (lenA === 0 || lenB === 0) return 0;
    const matrix: number[][] = [];
    for (let i = 0; i <= lenA; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= lenB; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= lenA; i++) {
      for (let j = 1; j <= lenB; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    const maxLen = Math.max(lenA, lenB);
    return 1 - matrix[lenA][lenB] / maxLen;
  };

  const matchFileToUsername = (
    filename: string
  ): {
    matchedProfileId: string | null;
    status: "matched" | "suggested" | "nomatch";
    similarity: number;
  } => {
    const cleanFilename = filename
      .split(".")
      .slice(0, -1)
      .join(".")
      .trim()
      .toLowerCase();
    const nameOnly = cleanFilename
      .replace(/^[\d_\-.\s]+/, "")
      .replace(/[\d_\-.\s]+$/, "")
      .trim();

    const digitsMatch = cleanFilename.match(/\d{4,}/);
    if (digitsMatch) {
      const targetUsername = digitsMatch[0];
      const matched = profiles.find(
        (p) => p.email.split("@")[0] === targetUsername
      );
      if (matched)
        return { matchedProfileId: matched.id, status: "matched", similarity: 1.0 };
    }

    if (nameOnly) {
      const cleanNameOnly = nameOnly.replace(/[^a-z0-9]/g, "");
      const exactMatch = profiles.find(
        (p) =>
          p.nama.toLowerCase().replace(/[^a-z0-9]/g, "") === cleanNameOnly
      );
      if (exactMatch)
        return { matchedProfileId: exactMatch.id, status: "matched", similarity: 1.0 };
    }

    let bestId: string | null = null;
    let maxSim = 0;
    const fuzzySource = nameOnly || cleanFilename;
    profiles.forEach((p) => {
      const sim = calculateSimilarity(fuzzySource, p.nama);
      if (sim > maxSim) {
        maxSim = sim;
        bestId = p.id;
      }
    });

    if (maxSim >= 0.75)
      return { matchedProfileId: bestId, status: "matched", similarity: maxSim };
    if (maxSim >= 0.45)
      return { matchedProfileId: bestId, status: "suggested", similarity: maxSim };
    return { matchedProfileId: null, status: "nomatch", similarity: 0 };
  };

  const handleMultipleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newItems: PhotoMatchItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const matchResult = matchFileToUsername(file.name);
      newItems.push({
        id: Math.random().toString(36).substring(7),
        file,
        previewUrl: URL.createObjectURL(file),
        status: matchResult.status,
        matchedProfileId: matchResult.matchedProfileId,
        similarity: matchResult.similarity,
      });
    }
    setPhotoMatchItems((prev) => [...prev, ...newItems]);
    e.target.value = "";
  };

  const handleZipFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingPhotos(true);
    setUploadProgress(0);
    setUploadStatusMsg("Membaca file ZIP...");
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const zipData = await zip.loadAsync(file);
      const imageEntries: { path: string; entry: any }[] = [];
      zipData.forEach((relativePath, entry) => {
        if (!entry.dir && relativePath.match(/\.(jpe?g|png|webp)$/i)) {
          imageEntries.push({ path: relativePath, entry });
        }
      });
      if (imageEntries.length === 0) {
        alert("Tidak ditemukan file gambar dalam ZIP.");
        setIsUploadingPhotos(false);
        setUploadStatusMsg("");
        e.target.value = "";
        return;
      }
      const newItems: PhotoMatchItem[] = [];
      for (let idx = 0; idx < imageEntries.length; idx++) {
        const { path, entry } = imageEntries[idx];
        const filename = path.split("/").pop() || path;
        const blob = await entry.async("blob");
        const imageFile = new File(
          [blob],
          filename,
          {
            type: `image/${filename.toLowerCase().endsWith(".png") ? "png" : "jpeg"}`,
          }
        );
        const matchResult = matchFileToUsername(filename);
        newItems.push({
          id: Math.random().toString(36).substring(7),
          file: imageFile,
          previewUrl: URL.createObjectURL(imageFile),
          status: matchResult.status,
          matchedProfileId: matchResult.matchedProfileId,
          similarity: matchResult.similarity,
        });
        setUploadProgress(Math.round(((idx + 1) / imageEntries.length) * 90) + 5);
        setUploadStatusMsg(
          `Mengekstrak ${idx + 1} dari ${imageEntries.length} foto...`
        );
      }
      setUploadProgress(100);
      setPhotoMatchItems((prev) => [...prev, ...newItems]);
      showToast(`Sukses memuat ${newItems.length} foto dari ZIP!`, "success");
    } catch (err: any) {
      alert("Gagal mengekstrak ZIP: " + err.message);
    } finally {
      setIsUploadingPhotos(false);
      setUploadStatusMsg("");
      setUploadProgress(0);
      e.target.value = "";
    }
  };

  const handleUploadAllPhotos = async () => {
    const itemsToUpload = photoMatchItems.filter(
      (item) => item.matchedProfileId !== null
    );
    if (itemsToUpload.length === 0) {
      alert("Tidak ada foto tercocokkan.");
      return;
    }
    setIsUploadingPhotos(true);
    setUploadProgress(1);
    setUploadStatusMsg("Mempersiapkan server...");
    try {
      let successCount = 0;
      let failCount = 0;
      for (let i = 0; i < itemsToUpload.length; i++) {
        const item = itemsToUpload[i];
        const profile = profiles.find((p) => p.id === item.matchedProfileId);
        if (!profile) continue;
        setUploadStatusMsg(
          `${toSentenceCase(profile.nama)} (${i + 1}/${itemsToUpload.length})...`
        );
        setUploadProgress(
          Math.round(((i + 1) / itemsToUpload.length) * 100)
        );
        try {
          const compressedBlob = await compressImage(item.file, 300, 400, 0.75);
          const compressedFile = new File([compressedBlob], `${profile.id}.jpg`, {
            type: "image/jpeg",
          });
          const fileName = `${profile.id}_${Date.now()}.jpg`;
          const { error: uploadErr } = await supabase.storage
            .from("profile-photos")
            .upload(fileName, compressedFile, {
              cacheControl: "3600",
              upsert: true,
            });
          if (uploadErr) throw uploadErr;
          const { data: urlData } = supabase.storage
            .from("profile-photos")
            .getPublicUrl(fileName);
          const publicUrl = urlData.publicUrl;
          const { error: dbErr } = await supabase
            .from("profiles")
            .update({ foto_url: publicUrl })
            .eq("id", profile.id);
          if (dbErr) throw dbErr;
          if (profile.nis) {
            await supabase
              .from("siswa")
              .update({ foto_url: publicUrl })
              .eq("nis", profile.nis);
          }
          successCount++;
        } catch {
          failCount++;
        }
      }
      setUploadProgress(100);
      showToast(
        `${successCount} foto berhasil diunggah.${failCount > 0 ? ` ${failCount} gagal.` : ""}`,
        "success"
      );
      onSuccess();
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (err: any) {
      alert("Gagal: " + err.message);
      setIsUploadingPhotos(false);
      setUploadStatusMsg("");
    }
  };

  const handleClose = () => {
    setIsUploadingPhotos(false);
    setUploadStatusMsg("");
    setUploadProgress(0);
    setPhotoMatchItems([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-brand-950/65 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="fixed inset-0" onClick={handleClose} />
      <div className="bg-white rounded-3xl p-6 w-full max-w-4xl max-h-[85vh] border border-brand-100 shadow-2xl flex flex-col relative z-10">
        {/* Header */}
        <div className="flex justify-between items-center border-b pb-4 border-brand-50 flex-shrink-0">
          <div>
            <h3 className="text-base font-extrabold text-brand-950 flex items-center gap-2">
              <Camera className="w-5 h-5 text-purple-600" />
              Unggah & Petakan Foto Profil Massal
            </h3>
            <p className="text-[11px] text-brand-400 font-bold mt-0.5 uppercase tracking-wide">
              Pencocokan Cerdas berbasis Nama / NIS
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={isUploadingPhotos}
            className="p-1 text-brand-400 hover:text-brand-600 hover:bg-brand-50 rounded-xl cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto py-5 space-y-5">
          <div className="bg-brand-50/50 border border-brand-100/60 rounded-2xl p-4 text-xs text-brand-700 leading-relaxed font-semibold">
            Petunjuk Penggunaan Cepat:
            <ul className="list-disc list-inside mt-2 space-y-1 text-brand-500 font-medium">
              <li>
                Namai file foto dengan NIS (misal: 19013.jpg) untuk pencocokan otomatis 100% tepat.
              </li>
              <li>
                Sistem juga dapat mendeteksi nama secara cerdas jika ada salah ketik kecil (misal:
                amiir hamza.jpg akan cocok ke Amir Hamzah).
              </li>
              <li>
                Anda bisa memilih banyak file gambar sekaligus atau mengunggah satu file .zip berisi
                semua foto.
              </li>
            </ul>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-dashed border-brand-200 rounded-2xl p-5 flex flex-col items-center justify-center text-center space-y-3 bg-brand-50/10 hover:bg-brand-50/30 transition-all cursor-pointer relative group">
              <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 group-hover:scale-110 transition-transform">
                <Image className="w-5 h-5" />
              </div>
              <div>
                <h5 className="text-xs font-bold text-brand-950">
                  Pilih Berkas Foto Langsung
                </h5>
                <p className="text-[10px] text-brand-400 font-medium mt-0.5">
                  Mendukung format JPG, PNG, WEBP sekaligus banyak
                </p>
              </div>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleMultipleFilesChange}
                disabled={isUploadingPhotos}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </div>

            <div className="border border-dashed border-brand-200 rounded-2xl p-5 flex flex-col items-center justify-center text-center space-y-3 bg-brand-50/10 hover:bg-brand-50/30 transition-all cursor-pointer relative group">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h5 className="text-xs font-bold text-brand-950">
                  Unggah Berkas File ZIP
                </h5>
                <p className="text-[10px] text-brand-400 font-medium mt-0.5">
                  Kompresi semua file foto dalam satu berkas .zip
                </p>
              </div>
              <input
                type="file"
                accept=".zip"
                onChange={handleZipFileChange}
                disabled={isUploadingPhotos}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </div>
          </div>

          {isUploadingPhotos && (
            <div className="bg-brand-50 border border-brand-100 p-4.5 rounded-2xl space-y-3">
              <div className="flex justify-between items-center text-xs font-black text-brand-950 uppercase">
                <span>{uploadStatusMsg}</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
                <div
                  className="bg-brand-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            </div>
          )}

          {photoMatchItems.length > 0 && (
            <div className="space-y-2 border-t pt-4 border-brand-50 flex-1 flex flex-col min-h-0">
              <h5 className="text-xs font-black text-brand-950 uppercase">
                Hasil Pemetaan Foto ({photoMatchItems.length} File)
              </h5>
              <div className="border border-brand-100 rounded-2xl overflow-hidden flex-1 min-h-0 flex flex-col">
                <div className="overflow-x-auto overflow-y-auto max-h-[350px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-brand-50/40 border-b border-brand-100 text-brand-500 font-black uppercase tracking-wider text-[10px]">
                        <th className="py-3 px-4">Nama File</th>
                        <th className="py-3 px-4">Tinjau Foto</th>
                        <th className="py-3 px-4">Pengguna Terpetakan</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4">Ubah Pemetaan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-50 text-brand-900 font-semibold">
                      {photoMatchItems.map((item) => {
                        const prof = profiles.find(
                          (p) => p.id === item.matchedProfileId
                        );
                        return (
                          <tr
                            key={item.id}
                            className="hover:bg-brand-50/10 transition-colors"
                          >
                            <td
                              className="py-3 px-4 font-mono text-[10px] text-slate-500 truncate max-w-[150px]"
                              title={item.file.name}
                            >
                              {item.file.name}
                            </td>
                            <td className="py-3 px-4">
                              <img
                                src={item.previewUrl}
                                alt="preview"
                                className="w-9 h-12 rounded-lg object-cover border border-brand-100"
                              />
                            </td>
                            <td className="py-3 px-4">
                              {prof ? (
                                <div className="text-xs">
                                  <div className="font-extrabold text-brand-950">
                                    {toSentenceCase(prof.nama)}
                                  </div>
                                  <div className="text-[9px] text-brand-400 font-bold mt-0.5">
                                    {prof.email.split("@")[0]} &bull; {prof.role}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-400 italic">
                                  Belum terpetakan
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {item.status === "matched" && (
                                <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md text-[9px] font-black uppercase">
                                  Cocok
                                </span>
                              )}
                              {item.status === "suggested" && (
                                <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded-md text-[9px] font-black uppercase">
                                  Saran
                                </span>
                              )}
                              {item.status === "nomatch" && (
                                <span className="px-2 py-1 bg-rose-50 text-rose-700 rounded-md text-[9px] font-black uppercase">
                                  Gagal
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <select
                                value={item.matchedProfileId || ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setPhotoMatchItems((prev) =>
                                    prev.map((p) =>
                                      p.id === item.id
                                        ? {
                                            ...p,
                                            matchedProfileId:
                                              val === "" ? null : val,
                                            status:
                                              val === ""
                                                ? "nomatch"
                                                : "matched",
                                          }
                                        : p
                                    )
                                  );
                                }}
                                disabled={isUploadingPhotos}
                                className="w-36 text-[10px] bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-bold outline-none text-brand-900 cursor-pointer"
                              >
                                <option value="">-- Pilih Manual --</option>
                                {[...profiles]
                                  .sort((a, b) => a.nama.localeCompare(b.nama))
                                  .map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {toSentenceCase(p.nama)} ({p.role})
                                    </option>
                                  ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t pt-4 border-brand-50 flex-shrink-0">
          <button
            type="button"
            onClick={handleClose}
            disabled={isUploadingPhotos}
            className="px-5 py-2.5 border border-brand-100 rounded-xl text-sm font-bold text-brand-600 hover:bg-brand-50 cursor-pointer disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleUploadAllPhotos}
            disabled={
              isUploadingPhotos ||
              photoMatchItems.filter((item) => item.matchedProfileId !== null)
                .length === 0
            }
            className="px-6 py-2.5 brand-gradient hover:opacity-95 text-white font-bold rounded-xl text-sm shadow-md shadow-brand-500/20 disabled:opacity-50 cursor-pointer"
          >
            {isUploadingPhotos
              ? "Mengunggah..."
              : `Konfirmasi & Unggah (${
                  photoMatchItems.filter((item) => item.matchedProfileId !== null)
                    .length
                } Foto)`}
          </button>
        </div>
      </div>
    </div>
  );
}
