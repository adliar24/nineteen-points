import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import { Award, Plus, Trash2, Search, X, Check, RefreshCw, Layout, Upload, Save, RotateCcw, Move, Edit3, Image as ImageIcon, Users, CheckSquare, Square, FileText, AlignLeft } from "lucide-react";
import { getAllKegiatanGuru, getTeacherProfiles, addKegiatanGuruBulk, deleteKegiatanGuru, deleteKegiatanGuruBulk, deleteAllKegiatanGuru } from "../dbStore";
import ModalPortal from "./ModalPortal";
import { toSentenceCase } from "../formatName";
import { getSertifikatConfigAsync, saveSertifikatConfigAsync, resetSertifikatConfigAsync, SertifikatLayoutConfig, DEFAULT_SERTIFIKAT_CONFIG } from "../sertifikatConfig";
import { drawCertificateOnCanvas } from "./GuruSertifikatView";
import { KegiatanGuru } from "../types";

// Helper function to compress/resize uploaded image data to max 2000px width
function optimizeImageDataUrl(file: File, maxWidth = 2000): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const isPng = file.type === "image/png";
        const dataUrl = canvas.toDataURL(isPng ? "image/png" : "image/jpeg", 0.92);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error("Gagal membaca gambar"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Gagal membaca file"));
    reader.readAsDataURL(file);
  });
}

export default function KelolaSertifikatGuruView() {
  const [activeTab, setActiveTab] = useState<"riwayat" | "desainer">("riwayat");
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form State for publishing certificate
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [teacherSearchQuery, setTeacherSearchQuery] = useState("");
  const [namaKegiatan, setNamaKegiatan] = useState("");
  const [tanggalKegiatan, setTanggalKegiatan] = useState(() => new Date().toISOString().slice(0, 10));
  const [peran, setPeran] = useState("Peserta");
  const [customPeran, setCustomPeran] = useState("");
  const [noSertifikat, setNoSertifikat] = useState("");
  const [penyelenggara, setPenyelenggara] = useState("SMAN 19 Bandung");

  // Designer State
  const [config, setConfig] = useState<SertifikatLayoutConfig>(DEFAULT_SERTIFIKAT_CONFIG);
  const [selectedElement, setSelectedElement] = useState<string>("namaGuru");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load config from IndexedDB on mount
  useEffect(() => {
    getSertifikatConfigAsync().then(cfg => setConfig(cfg));
  }, []);

  const changeTtdCount = (count: 1 | 2 | 3) => {
    setConfig(prev => {
      const updatedPos = { ...prev.positions };
      if (count === 1) {
        updatedPos.ttd1ImagePos.xPercent = 50;
        updatedPos.ttd1NamaPos.xPercent = 50;
        updatedPos.ttd1JabatanPos.xPercent = 50;
      } else if (count === 2) {
        updatedPos.ttd1ImagePos.xPercent = 27;
        updatedPos.ttd1NamaPos.xPercent = 27;
        updatedPos.ttd1JabatanPos.xPercent = 27;

        updatedPos.ttd2ImagePos.xPercent = 73;
        updatedPos.ttd2NamaPos.xPercent = 73;
        updatedPos.ttd2JabatanPos.xPercent = 73;
      } else if (count === 3) {
        updatedPos.ttd1ImagePos.xPercent = 20;
        updatedPos.ttd1NamaPos.xPercent = 20;
        updatedPos.ttd1JabatanPos.xPercent = 20;

        updatedPos.ttd3ImagePos.xPercent = 50;
        updatedPos.ttd3NamaPos.xPercent = 50;
        updatedPos.ttd3JabatanPos.xPercent = 50;

        updatedPos.ttd2ImagePos.xPercent = 80;
        updatedPos.ttd2NamaPos.xPercent = 80;
        updatedPos.ttd2JabatanPos.xPercent = 80;
      }
      return { ...prev, jumlahTtd: count, positions: updatedPos };
    });
  };

  // Auto-save configuration changes automatically to IndexedDB & localStorage
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    saveSertifikatConfigAsync(config);
  }, [config]);

  // Queries
  const { data: kegiatanList = [], isLoading: loadingKegiatan, refetch: refetchKegiatan } = useQuery({
    queryKey: ["allKegiatanGuru"],
    queryFn: getAllKegiatanGuru,
  });

  const { data: teachers = [], isLoading: loadingTeachers } = useQuery({
    queryKey: ["teacherProfiles"],
    queryFn: getTeacherProfiles,
    enabled: isAddModalOpen,
  });

  // Mutations
  const addMutation = useMutation({
    mutationFn: async () => {
      const finalPeran = peran === "Lainnya" ? customPeran : peran;
      return addKegiatanGuruBulk(
        selectedTeacherIds,
        namaKegiatan,
        tanggalKegiatan,
        finalPeran,
        noSertifikat,
        penyelenggara
      );
    },
    onSuccess: () => {
      setSuccessMsg(`Sertifikat berhasil diterbitkan untuk ${selectedTeacherIds.length} guru!`);
      setIsAddModalOpen(false);
      refetchKegiatan();
      
      // Reset Form
      setSelectedTeacherIds([]);
      setTeacherSearchQuery("");
      setNamaKegiatan("");
      setTanggalKegiatan(new Date().toISOString().slice(0, 10));
      setPeran("Peserta");
      setCustomPeran("");
      setNoSertifikat("");
      setPenyelenggara("SMAN 19 Bandung");

      setTimeout(() => setSuccessMsg(null), 4000);
    },
    onError: (err: any) => {
      setErrorMsg("Gagal menyimpan sertifikat: " + err.message);
      setTimeout(() => setErrorMsg(null), 5000);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteKegiatanGuru(id),
    onSuccess: () => {
      setSuccessMsg("Sertifikat berhasil dihapus.");
      refetchKegiatan();
      setTimeout(() => setSuccessMsg(null), 4000);
    },
    onError: (err: any) => {
      alert("Gagal menghapus sertifikat: " + err.message);
    }
  });

  const handleDelete = (id: string, name: string) => {
    const confirm = window.confirm(`Apakah Anda yakin ingin menghapus data sertifikat untuk "${toSentenceCase(name)}"?`);
    if (confirm) {
      deleteMutation.mutate(id);
    }
  };

  // Selected certificates in the table
  const [selectedCertIds, setSelectedCertIds] = useState<string[]>([]);

  const deleteSelectedMutation = useMutation({
    mutationFn: () => deleteKegiatanGuruBulk(selectedCertIds),
    onSuccess: () => {
      setSuccessMsg(`Berhasil menghapus ${selectedCertIds.length} sertifikat.`);
      setSelectedCertIds([]);
      refetchKegiatan();
      setTimeout(() => setSuccessMsg(null), 4000);
    },
    onError: (err: any) => {
      alert("Gagal menghapus sertifikat terpilih: " + err.message);
    }
  });

  const handleDeleteSelected = () => {
    const confirm = window.confirm(`Apakah Anda yakin ingin menghapus ${selectedCertIds.length} sertifikat terpilih?`);
    if (confirm) {
      deleteSelectedMutation.mutate();
    }
  };

  const deleteAllMutation = useMutation({
    mutationFn: () => deleteAllKegiatanGuru(),
    onSuccess: () => {
      setSuccessMsg("Berhasil menghapus semua sertifikat.");
      setSelectedCertIds([]);
      refetchKegiatan();
      setTimeout(() => setSuccessMsg(null), 4000);
    },
    onError: (err: any) => {
      alert("Gagal menghapus semua sertifikat: " + err.message);
    }
  });

  const handleDeleteAll = () => {
    const confirm = window.confirm("PERINGATAN: Apakah Anda yakin ingin menghapus SEMUA sertifikat yang terdaftar di sistem? Tindakan ini tidak dapat dibatalkan.");
    if (confirm) {
      deleteAllMutation.mutate();
    }
  };

  // Select all / Toggle teachers
  const filteredTeachersInModal = teachers.filter(t => 
    t.nama.toLowerCase().includes(teacherSearchQuery.toLowerCase()) ||
    t.email.toLowerCase().includes(teacherSearchQuery.toLowerCase())
  );

  const isAllSelected = teachers.length > 0 && selectedTeacherIds.length === teachers.length;

  const handleSelectAllTeachers = (checked: boolean) => {
    if (checked) {
      setSelectedTeacherIds(teachers.map(t => t.id));
    } else {
      setSelectedTeacherIds([]);
    }
  };

  const handleToggleTeacher = (id: string) => {
    setSelectedTeacherIds(prev => 
      prev.includes(id) ? prev.filter(tId => tId !== id) : [...prev, id]
    );
  };

  // Render Canvas for Designer Preview
  useEffect(() => {
    if (activeTab === "desainer" && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const templateImg = new Image();
      templateImg.src = config.templateUrl || "/sertifikat_template.png";

      const loadImg = (src: string | null): Promise<HTMLImageElement | null> => {
        if (!src) return Promise.resolve(null);
        return new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = src;
        });
      };

      Promise.all([
        new Promise<void>((resolve) => {
          templateImg.onload = () => resolve();
          templateImg.onerror = () => resolve();
        }),
        loadImg(config.ttd1Image),
        loadImg(config.ttd2Image),
        loadImg(config.ttd3Image),
      ]).then(([_, ttd1Img, ttd2Img, ttd3Img]) => {
        canvas.width = templateImg.naturalWidth || 2000;
        canvas.height = templateImg.naturalHeight || 1414;

        const dummyKegiatan: KegiatanGuru = {
          id: "dummy",
          user_id: "dummy",
          nama_kegiatan: "WORKSHOP PENGEMBANGAN KURIKULUM & ASESMEN DIGITAL",
          tanggal_kegiatan: new Date().toISOString(),
          peran: "PESERTA",
          no_sertifikat: "SR.098979898666968968",
          penyelenggara: "SMAN 19 Bandung",
          durasi_jam: null,
          created_at: new Date().toISOString()
        };

        drawCertificateOnCanvas(
          ctx,
          canvas.width,
          canvas.height,
          templateImg,
          dummyKegiatan,
          "Joseph Adeyemi",
          config,
          ttd1Img,
          ttd2Img,
          ttd3Img
        );

        // Highlight selected element position with a target indicator
        const pos = config.positions;
        let targetX = canvas.width / 2;
        let targetY = canvas.height / 2;

        if (selectedElement === "noSertifikat") {
          targetX = (pos.noSertifikat.xPercent / 100) * canvas.width;
          targetY = (pos.noSertifikat.yPercent / 100) * canvas.height;
        } else if (selectedElement === "prefixNama") {
          targetX = (pos.prefixNama.xPercent / 100) * canvas.width;
          targetY = (pos.prefixNama.yPercent / 100) * canvas.height;
        } else if (selectedElement === "namaGuru") {
          targetX = (pos.namaGuru.xPercent / 100) * canvas.width;
          targetY = (pos.namaGuru.yPercent / 100) * canvas.height;
        } else if (selectedElement === "deskripsi") {
          targetX = (pos.deskripsi.xPercent / 100) * canvas.width;
          targetY = (pos.deskripsi.yPercent / 100) * canvas.height;
        } else if (selectedElement === "ttd1") {
          targetX = (pos.ttd1NamaPos.xPercent / 100) * canvas.width;
          targetY = (pos.ttd1NamaPos.yPercent / 100) * canvas.height;
        } else if (selectedElement === "ttd2") {
          targetX = (pos.ttd2NamaPos.xPercent / 100) * canvas.width;
          targetY = (pos.ttd2NamaPos.yPercent / 100) * canvas.height;
        } else if (selectedElement === "ttd3") {
          targetX = (pos.ttd3NamaPos.xPercent / 100) * canvas.width;
          targetY = (pos.ttd3NamaPos.yPercent / 100) * canvas.height;
        }

        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 4;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.arc(targetX, targetY, 24, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      });
    }
  }, [activeTab, config, selectedElement]);

  // Upload & Optimize Template Image
  const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const optimizedUrl = await optimizeImageDataUrl(file, 2000);
      const newConfig = { ...config, templateUrl: optimizedUrl };
      setConfig(newConfig);
      await saveSertifikatConfigAsync(newConfig);
      setSuccessMsg("Gambar template berhasil diunggah & disimpan!");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      alert("Gagal mengunggah template: " + err.message);
    }
  };

  // Upload TTD 1 Image
  const handleTtd1Upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const optimizedUrl = await optimizeImageDataUrl(file, 800);
      const newConfig = { ...config, ttd1Image: optimizedUrl };
      setConfig(newConfig);
      await saveSertifikatConfigAsync(newConfig);
      setSuccessMsg("TTD 1 berhasil diunggah & disimpan!");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      alert("Gagal mengunggah TTD: " + err.message);
    }
  };

  // Upload TTD 2 Image
  const handleTtd2Upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const optimizedUrl = await optimizeImageDataUrl(file, 800);
      const newConfig = { ...config, ttd2Image: optimizedUrl };
      setConfig(newConfig);
      await saveSertifikatConfigAsync(newConfig);
      setSuccessMsg("TTD 2 berhasil diunggah & disimpan!");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      alert("Gagal mengunggah TTD: " + err.message);
    }
  };

  // Upload TTD 3 Image
  const handleTtd3Upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const optimizedUrl = await optimizeImageDataUrl(file, 800);
      const newConfig = { ...config, ttd3Image: optimizedUrl };
      setConfig(newConfig);
      await saveSertifikatConfigAsync(newConfig);
      setSuccessMsg("TTD 3 berhasil diunggah & disimpan!");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      alert("Gagal mengunggah TTD: " + err.message);
    }
  };

  // Save Designer Config
  const handleSaveConfig = async () => {
    await saveSertifikatConfigAsync(config);
    setSuccessMsg("Konfigurasi desain template & posisi sertifikat berhasil disimpan!");
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  // Reset Designer Config
  const handleResetConfig = async () => {
    if (window.confirm("Apakah Anda yakin ingin mereset konfigurasi template ke pengaturan default?")) {
      const res = await resetSertifikatConfigAsync();
      setConfig(res);
      setSuccessMsg("Konfigurasi berhasil direset ke default.");
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  };

  // Click on Canvas to reposition selected element
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const xPercent = Math.round((clickX / rect.width) * 1000) / 10;
    const yPercent = Math.round((clickY / rect.height) * 1000) / 10;

    setConfig(prev => {
      const updatedPos = { ...prev.positions };
      if (selectedElement === "noSertifikat") {
        updatedPos.noSertifikat = { ...updatedPos.noSertifikat, xPercent, yPercent };
      } else if (selectedElement === "prefixNama") {
        updatedPos.prefixNama = { ...updatedPos.prefixNama, xPercent, yPercent };
      } else if (selectedElement === "namaGuru") {
        updatedPos.namaGuru = { ...updatedPos.namaGuru, xPercent, yPercent };
      } else if (selectedElement === "deskripsi") {
        updatedPos.deskripsi = { ...updatedPos.deskripsi, xPercent, yPercent };
      } else if (selectedElement === "ttd1") {
        updatedPos.ttd1ImagePos = { ...updatedPos.ttd1ImagePos, xPercent, yPercent: yPercent - 10 };
        updatedPos.ttd1NamaPos = { ...updatedPos.ttd1NamaPos, xPercent, yPercent };
        updatedPos.ttd1JabatanPos = { ...updatedPos.ttd1JabatanPos, xPercent, yPercent: yPercent + 3 };
      } else if (selectedElement === "ttd2") {
        updatedPos.ttd2ImagePos = { ...updatedPos.ttd2ImagePos, xPercent, yPercent: yPercent - 10 };
        updatedPos.ttd2NamaPos = { ...updatedPos.ttd2NamaPos, xPercent, yPercent };
        updatedPos.ttd2JabatanPos = { ...updatedPos.ttd2JabatanPos, xPercent, yPercent: yPercent + 3 };
      } else if (selectedElement === "ttd3") {
        updatedPos.ttd3ImagePos = { ...updatedPos.ttd3ImagePos, xPercent, yPercent: yPercent - 10 };
        updatedPos.ttd3NamaPos = { ...updatedPos.ttd3NamaPos, xPercent, yPercent };
        updatedPos.ttd3JabatanPos = { ...updatedPos.ttd3JabatanPos, xPercent, yPercent: yPercent + 3 };
      }
      return { ...prev, positions: updatedPos };
    });
  };

  const filteredList = kegiatanList.filter(row => 
    row.user_nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
    row.nama_kegiatan.toLowerCase().includes(searchQuery.toLowerCase()) ||
    row.peran.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-12 animate-fade-in font-sans">
      {/* Header & Mode Switcher */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-brand-950 tracking-tight">
            Kelola & Desainer Sertifikat Guru
          </h2>
          <p className="text-xs text-brand-500 font-semibold mt-1">
            Terbitkan sertifikat kegiatan guru dan atur posisi teks/TTD pada template sertifikat secara dinamis.
          </p>
        </div>

        {/* Tab Selector */}
        <div className="flex bg-brand-50 p-1.5 rounded-2xl border border-brand-100/80 shadow-inner">
          <button
            onClick={() => setActiveTab("riwayat")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "riwayat"
                ? "bg-white text-brand-900 shadow-sm border border-brand-100"
                : "text-brand-600 hover:text-brand-900"
            }`}
          >
            <Award className="w-4 h-4 text-brand-500" />
            Riwayat & Terbitkan
          </button>
          <button
            onClick={() => setActiveTab("desainer")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "desainer"
                ? "bg-white text-brand-900 shadow-sm border border-brand-100"
                : "text-brand-600 hover:text-brand-900"
            }`}
          >
            <Layout className="w-4 h-4 text-brand-500" />
            Desainer Template & Posisi
          </button>
        </div>
      </div>

      {/* ALERT SUCCESS */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-3 shadow-md">
          <div className="w-6 h-6 bg-emerald-500 rounded-lg text-white flex items-center justify-center flex-shrink-0">
            <Check className="w-3.5 h-3.5" />
          </div>
          <span>{successMsg}</span>
        </div>
      )}

      {/* TAB 1: RIWAYAT & TERBITKAN SERTIFIKAT */}
      {activeTab === "riwayat" && (
        <>
          {/* CONTROLS BAR */}
          <div className="bg-white p-5 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-500/50 w-5 h-5" />
              <input
                type="text"
                placeholder="Cari berdasarkan nama guru, kegiatan, atau peran..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-brand-50/20 rounded-2xl border border-brand-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all text-brand-950 placeholder-brand-500/30"
              />
            </div>

            <div className="flex items-center gap-3.5 w-full md:w-auto justify-end">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setIsAddModalOpen(true)}
                className="flex items-center justify-center gap-2 px-5 py-3.5 brand-gradient text-white rounded-2xl text-xs font-black shadow-md cursor-pointer w-full sm:w-auto"
              >
                <Plus className="w-4.5 h-4.5" />
                Terbitkan Sertifikat
              </motion.button>
              <button
                onClick={() => refetchKegiatan()}
                className="p-3 bg-brand-50 text-brand-600 rounded-2xl hover:bg-brand-100 border border-brand-100/50 transition-colors cursor-pointer flex items-center justify-center"
              >
                <RefreshCw className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>

          {/* BULK ACTIONS BAR */}
          {selectedCertIds.length > 0 && (
            <div className="bg-rose-50 border border-rose-100 p-4 rounded-3xl flex items-center justify-between gap-4 animate-fade-in">
              <span className="text-xs font-bold text-rose-800">
                Terpilih {selectedCertIds.length} dari {filteredList.length} sertifikat
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedCertIds([])}
                  className="px-4 py-2 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition-all cursor-pointer bg-transparent border-0"
                >
                  Batal Pilihan
                </button>
                <button
                  onClick={handleDeleteSelected}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black shadow-xs transition-all cursor-pointer border-0 flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Hapus Terpilih ({selectedCertIds.length})
                </button>
              </div>
            </div>
          )}

          {/* TABLE OF ISSUED CERTIFICATES */}
          <div className="bg-white rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-semibold text-brand-950">
                <thead className="bg-brand-50/60 border-b border-brand-100 text-[10px] font-black uppercase text-brand-400 tracking-wider">
                  <tr>
                    <th className="py-4 px-6 w-12 text-center">
                      <input
                        type="checkbox"
                        checked={filteredList.length > 0 && selectedCertIds.length === filteredList.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedCertIds(filteredList.map(row => row.id));
                          } else {
                            setSelectedCertIds([]);
                          }
                        }}
                        className="w-4 h-4 rounded cursor-pointer accent-brand-600"
                      />
                    </th>
                    <th className="py-4 px-6">Guru / Peserta</th>
                    <th className="py-4 px-6">Nama Kegiatan</th>
                    <th className="py-4 px-6">Peran</th>
                    <th className="py-4 px-6">Tanggal</th>
                    <th className="py-4 px-6 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-50">
                  {loadingKegiatan ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-brand-500" />
                        <p className="text-xs font-bold text-brand-400 mt-2">Memuat list sertifikat...</p>
                      </td>
                    </tr>
                  ) : filteredList.length > 0 ? (
                    filteredList.map((row) => (
                      <tr key={row.id} className="hover:bg-brand-50/30 transition-colors">
                        <td className="py-4 px-6 w-12 text-center">
                          <input
                            type="checkbox"
                            checked={selectedCertIds.includes(row.id)}
                            onChange={() => {
                              setSelectedCertIds(prev => 
                                prev.includes(row.id) ? prev.filter(id => id !== row.id) : [...prev, row.id]
                              );
                            }}
                            className="w-4 h-4 rounded cursor-pointer accent-brand-600"
                          />
                        </td>
                        <td className="py-4 px-6">
                          <div className="font-bold text-brand-950">{toSentenceCase(row.user_nama)}</div>
                          <div className="text-[10px] text-slate-400">{row.user_email}</div>
                        </td>
                        <td className="py-4 px-6">
                          <div className="font-bold text-brand-900 line-clamp-2 max-w-xs">{row.nama_kegiatan}</div>
                          {row.no_sertifikat && (
                            <span className="text-[10px] text-slate-400 font-mono block mt-1">No: {row.no_sertifikat}</span>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          <span className="inline-block px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-[10px] font-black uppercase">
                            {row.peran}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-slate-500">
                          {new Date(row.tanggal_kegiatan).toLocaleDateString("id-ID", { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="py-4 px-6 text-right">
                          <button
                            onClick={() => handleDelete(row.id, row.user_nama)}
                            className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer border-0 bg-transparent"
                            title="Hapus Sertifikat"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-slate-400 font-semibold">
                        Belum ada data sertifikat diterbitkan atau cocok dengan filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* DANGER AREA ACTIONS */}
          {filteredList.length > 0 && (
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleDeleteAll}
                className="px-4 py-2.5 text-rose-500 hover:text-rose-700 bg-rose-50/50 hover:bg-rose-50 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer border border-rose-250/30 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Hapus Semua Sertifikat ({filteredList.length})
              </button>
            </div>
          )}
        </>
      )}

      {/* TAB 2: DESAINER TEMPLATE & POSISI ELEMEN */}
      {activeTab === "desainer" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT PANEL: UPLOAD, DESKRIPSI & ELEMENT POSITIONS CONTROL (5 COLS) */}
          <div className="lg:col-span-5 space-y-6">
            {/* 1. KUSTOMISASI DESKRIPSI SERTIFIKAT (MENDUKUNG **BOLD**) */}
            <div className="bg-white p-5 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-brand-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-brand-600" />
                Edit Kalimat Deskripsi & Format Tebal
              </h3>
              <p className="text-[11px] text-slate-500 leading-relaxed font-semibold">
                Gunakan <code className="bg-slate-100 px-1 py-0.5 rounded text-brand-700 font-mono">**teks tebal**</code> untuk menebalkan kata. Gunakan variabel <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-brand-700">&#123;peran&#125;</code>, <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-brand-700">&#123;nama_kegiatan&#125;</code>, dan <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-brand-700">&#123;penyelenggara&#125;</code>.
              </p>
              <textarea
                rows={3}
                value={config.deskripsiTemplate}
                onChange={(e) => setConfig(prev => ({ ...prev, deskripsiTemplate: e.target.value }))}
                placeholder='Atas partisipasi aktifnya sebagai **{peran}** dalam kegiatan **"{nama_kegiatan}"** yang diselenggarakan oleh **{penyelenggara}**.'
                className="w-full p-3 bg-brand-50/30 rounded-2xl border border-brand-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 text-brand-950 leading-relaxed"
              />
            </div>

            {/* 2. TEMPLATE & JUMLAH TTD SECTION */}
            <div className="bg-white p-5 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 space-y-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-brand-900 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-brand-600" />
                Upload Template & Jumlah Tanda Tangan
              </h3>

              {/* Upload Template Background */}
              <div className="space-y-1.5">
                <label className="text-[10.5px] font-bold text-slate-500 block">
                  Template Latar Sertifikat (PNG / JPG)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/png, image/jpeg"
                    onChange={handleTemplateUpload}
                    id="upload-template-bg"
                    className="hidden"
                  />
                  <label
                    htmlFor="upload-template-bg"
                    className="px-4 py-2.5 bg-brand-50 hover:bg-brand-100 border border-brand-100 rounded-2xl text-brand-700 text-xs font-bold flex items-center gap-2 cursor-pointer transition-all flex-1"
                  >
                    <Upload className="w-4 h-4" />
                    Ganti Gambar Template
                  </label>
                  {config.templateUrl && (
                    <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2.5 py-1 rounded-xl">Kustom Active</span>
                  )}
                </div>
              </div>

              {/* Pilihan Jumlah TTD (1, 2, atau 3 TTD) */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="text-[10.5px] font-bold text-slate-700 block">
                  Pilih Jumlah Tanda Tangan (TTD):
                </label>
                <div className="grid grid-cols-3 gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => changeTtdCount(1)}
                    className={`py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer border-0 ${
                      config.jumlahTtd === 1 ? "bg-brand-600 text-white shadow-sm" : "bg-transparent text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    1 TTD
                  </button>
                  <button
                    type="button"
                    onClick={() => changeTtdCount(2)}
                    className={`py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer border-0 ${
                      config.jumlahTtd === 2 ? "bg-brand-600 text-white shadow-sm" : "bg-transparent text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    2 TTD
                  </button>
                  <button
                    type="button"
                    onClick={() => changeTtdCount(3)}
                    className={`py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer border-0 ${
                      config.jumlahTtd === 3 ? "bg-brand-600 text-white shadow-sm" : "bg-transparent text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    3 TTD
                  </button>
                </div>
              </div>

              {/* Toggle Garis Otomatis */}
              <div className="space-y-2 pt-3 border-t border-slate-100">
                <label className="text-[10.5px] font-bold text-slate-700 block">
                  Tampilkan Garis Otomatis:
                </label>
                <div className="space-y-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.showJudulLine}
                      onChange={(e) => setConfig(prev => ({ ...prev, showJudulLine: e.target.checked }))}
                      className="w-4 h-4 accent-brand-600 rounded cursor-pointer"
                    />
                    <span>Garis Bawah Nomor/Judul Sertifikat</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.showNamaLine}
                      onChange={(e) => setConfig(prev => ({ ...prev, showNamaLine: e.target.checked }))}
                      className="w-4 h-4 accent-brand-600 rounded cursor-pointer"
                    />
                    <span>Garis Bawah Kolom Nama</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.showTtdLines}
                      onChange={(e) => setConfig(prev => ({ ...prev, showTtdLines: e.target.checked }))}
                      className="w-4 h-4 accent-brand-600 rounded cursor-pointer"
                    />
                    <span>Garis Bawah Tanda Tangan (TTD)</span>
                  </label>
                </div>
              </div>

              {/* Upload TTD 1 */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <label className="text-[10.5px] font-bold text-slate-500 block">
                  TTD 1 ({config.jumlahTtd === 1 ? "Tengah / Utama" : "Kiri"}) - Gambar PNG Transparan
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/png"
                    onChange={handleTtd1Upload}
                    id="upload-ttd-1"
                    className="hidden"
                  />
                  <label
                    htmlFor="upload-ttd-1"
                    className="px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-2xl text-slate-700 text-xs font-bold flex items-center gap-2 cursor-pointer transition-all flex-1"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload Gambar TTD 1
                  </label>
                  {config.ttd1Image && (
                    <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2.5 py-1 rounded-xl">TTD Ready</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <input
                    type="text"
                    placeholder="Nama (misal: Ben Harrington)"
                    value={config.ttd1Nama}
                    onChange={(e) => setConfig(prev => ({ ...prev, ttd1Nama: e.target.value }))}
                    className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold"
                  />
                  <input
                    type="text"
                    placeholder="Jabatan (misal: CEO / Kepala Sekolah)"
                    value={config.ttd1Jabatan}
                    onChange={(e) => setConfig(prev => ({ ...prev, ttd1Jabatan: e.target.value }))}
                    className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold"
                  />
                </div>
              </div>

              {/* Upload TTD 2 (Jika Jumlah TTD >= 2) */}
              {config.jumlahTtd >= 2 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <label className="text-[10.5px] font-bold text-slate-500 block">
                    TTD 2 ({config.jumlahTtd === 3 ? "Kanan" : "Kanan"}) - Gambar PNG Transparan
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept="image/png"
                      onChange={handleTtd2Upload}
                      id="upload-ttd-2"
                      className="hidden"
                    />
                    <label
                      htmlFor="upload-ttd-2"
                      className="px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-2xl text-slate-700 text-xs font-bold flex items-center gap-2 cursor-pointer transition-all flex-1"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Upload Gambar TTD 2
                    </label>
                    {config.ttd2Image && (
                      <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2.5 py-1 rounded-xl">TTD Ready</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <input
                      type="text"
                      placeholder="Nama (misal: Sameer Shah)"
                      value={config.ttd2Nama}
                      onChange={(e) => setConfig(prev => ({ ...prev, ttd2Nama: e.target.value }))}
                      className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold"
                    />
                    <input
                      type="text"
                      placeholder="Jabatan (misal: Manager)"
                      value={config.ttd2Jabatan}
                      onChange={(e) => setConfig(prev => ({ ...prev, ttd2Jabatan: e.target.value }))}
                      className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold"
                    />
                  </div>
                </div>
              )}

              {/* Upload TTD 3 (Jika Jumlah TTD == 3) */}
              {config.jumlahTtd === 3 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <label className="text-[10.5px] font-bold text-slate-500 block">
                    TTD 3 (Tengah / Tambahan) - Gambar PNG Transparan
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept="image/png"
                      onChange={handleTtd3Upload}
                      id="upload-ttd-3"
                      className="hidden"
                    />
                    <label
                      htmlFor="upload-ttd-3"
                      className="px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-2xl text-slate-700 text-xs font-bold flex items-center gap-2 cursor-pointer transition-all flex-1"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Upload Gambar TTD 3
                    </label>
                    {config.ttd3Image && (
                      <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2.5 py-1 rounded-xl">TTD Ready</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <input
                      type="text"
                      placeholder="Nama (misal: Drs. Sukarno)"
                      value={config.ttd3Nama}
                      onChange={(e) => setConfig(prev => ({ ...prev, ttd3Nama: e.target.value }))}
                      className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold"
                    />
                    <input
                      type="text"
                      placeholder="Jabatan (misal: Kepala Sekolah)"
                      value={config.ttd3Jabatan}
                      onChange={(e) => setConfig(prev => ({ ...prev, ttd3Jabatan: e.target.value }))}
                      className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 3. ELEMENT POSITION EDITOR CONTROLS */}
            <div className="bg-white p-5 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 space-y-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-brand-900 flex items-center gap-2">
                <Move className="w-4 h-4 text-brand-600" />
                Pengaturan Posisi, Font & Spasi Elemen
              </h3>

              {/* Selector Elemen */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                  Pilih Elemen yang Ingin Diatur:
                </label>
                <select
                  value={selectedElement}
                  onChange={(e) => setSelectedElement(e.target.value)}
                  className="w-full p-3 bg-brand-50 rounded-2xl border border-brand-200 text-xs font-bold text-brand-950 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="namaGuru">Nama Guru / Peserta</option>
                  <option value="prefixNama">Label "Diberikan kepada:"</option>
                  <option value="noSertifikat">Nomor Surat Sertifikat</option>
                  <option value="deskripsi">Deskripsi & Peran Kegiatan</option>
                  <option value="ttd1">TTD 1 - Posisi & Teks</option>
                  {config.jumlahTtd >= 2 && <option value="ttd2">TTD 2 - Posisi & Teks</option>}
                  {config.jumlahTtd === 3 && <option value="ttd3">TTD 3 - Posisi & Teks</option>}
                </select>
              </div>

              {/* Slider Posisi X & Y */}
              {!selectedElement.startsWith("ttd") ? (
                (() => {
                  const elemKey = selectedElement as keyof typeof config.positions;
                  const elemPos = (config.positions as any)[elemKey];
                  if (!elemPos) return null;

                  return (
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                      {/* Posisi X % */}
                      <div>
                        <div className="flex justify-between text-[11px] font-bold text-slate-600">
                          <span>Posisi Horizontal (X)</span>
                          <span className="font-mono text-brand-600">{elemPos.xPercent}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="0.5"
                          value={elemPos.xPercent}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setConfig(prev => ({
                              ...prev,
                              positions: {
                                ...prev.positions,
                                [elemKey]: { ...elemPos, xPercent: val }
                              }
                            }));
                          }}
                          className="w-full accent-brand-600 cursor-pointer"
                        />
                      </div>

                      {/* Posisi Y % */}
                      <div>
                        <div className="flex justify-between text-[11px] font-bold text-slate-600">
                          <span>Posisi Vertikal (Y)</span>
                          <span className="font-mono text-brand-600">{elemPos.yPercent}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="0.5"
                          value={elemPos.yPercent}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setConfig(prev => ({
                              ...prev,
                              positions: {
                                ...prev.positions,
                                [elemKey]: { ...elemPos, yPercent: val }
                              }
                            }));
                          }}
                          className="w-full accent-brand-600 cursor-pointer"
                        />
                      </div>

                      {/* Ukuran Font & Warna */}
                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 block">Ukuran Font (px)</label>
                          <input
                            type="number"
                            min="10"
                            max="120"
                            value={elemPos.fontSize}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 24;
                              setConfig(prev => ({
                                ...prev,
                                positions: {
                                  ...prev.positions,
                                  [elemKey]: { ...elemPos, fontSize: val }
                                }
                              }));
                            }}
                            className="w-full p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-center"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-500 block">Warna Teks</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={elemPos.color}
                              onChange={(e) => {
                                setConfig(prev => ({
                                  ...prev,
                                  positions: {
                                    ...prev.positions,
                                    [elemKey]: { ...elemPos, color: e.target.value }
                                  }
                                }));
                              }}
                              className="w-8 h-9 bg-transparent border-0 cursor-pointer rounded"
                            />
                            <span className="text-[11px] font-mono text-slate-600 uppercase font-bold">{elemPos.color}</span>
                          </div>
                        </div>
                      </div>

                      {/* Jarak Spasi Baris / Line Height */}
                      <div className="pt-2 border-t border-slate-100">
                        <div className="flex justify-between text-[11px] font-bold text-slate-600">
                          <span>Jarak Spasi Baris (Line Height)</span>
                          <span className="font-mono text-brand-600">{(elemPos.lineHeightMultiplier || 1.45).toFixed(2)}x</span>
                        </div>
                        <input
                          type="range"
                          min="1.0"
                          max="2.5"
                          step="0.05"
                          value={elemPos.lineHeightMultiplier || 1.45}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setConfig(prev => ({
                              ...prev,
                              positions: {
                                ...prev.positions,
                                [elemKey]: { ...elemPos, lineHeightMultiplier: val }
                              }
                            }));
                          }}
                          className="w-full accent-brand-600 cursor-pointer"
                        />
                      </div>
                    </div>
                  );
                })()
              ) : (
                (() => {
                  const ttdNum = selectedElement === "ttd1" ? "1" : selectedElement === "ttd2" ? "2" : "3";
                  const posKey = `ttd${ttdNum}NamaPos`;
                  const jabKey = `ttd${ttdNum}JabatanPos`;
                  const imgPosKey = `ttd${ttdNum}ImagePos`;

                  const elemPos = (config.positions as any)[posKey];
                  const imgPos = (config.positions as any)[imgPosKey];
                  if (!elemPos) return null;

                  return (
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                      <div>
                        <div className="flex justify-between text-[11px] font-bold text-slate-600">
                          <span>Posisi Horizontal TTD {ttdNum} (X)</span>
                          <span className="font-mono text-brand-600">{elemPos.xPercent}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="0.5"
                          value={elemPos.xPercent}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setConfig(prev => ({
                              ...prev,
                              positions: {
                                ...prev.positions,
                                [posKey]: { ...elemPos, xPercent: val },
                                [jabKey]: { ...(prev.positions as any)[jabKey], xPercent: val },
                                [imgPosKey]: { ...imgPos, xPercent: val }
                              }
                            }));
                          }}
                          className="w-full accent-brand-600 cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] font-bold text-slate-600">
                          <span>Posisi Vertikal TTD {ttdNum} (Y)</span>
                          <span className="font-mono text-brand-600">{elemPos.yPercent}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="0.5"
                          value={elemPos.yPercent}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setConfig(prev => ({
                              ...prev,
                              positions: {
                                ...prev.positions,
                                [posKey]: { ...elemPos, yPercent: val },
                                [jabKey]: { ...(prev.positions as any)[jabKey], yPercent: val + 3 },
                                [imgPosKey]: { ...imgPos, yPercent: val - 11.5 }
                              }
                            }));
                          }}
                          className="w-full accent-brand-600 cursor-pointer"
                        />
                      </div>
                    </div>
                  );
                })()
              )}

              {/* SAVE / RESET BUTTONS */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                <button
                  onClick={handleResetConfig}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset Default
                </button>

                <button
                  onClick={handleSaveConfig}
                  className="px-5 py-2.5 brand-gradient text-white rounded-2xl text-xs font-black flex items-center gap-2 cursor-pointer shadow-md transition-all hover:scale-[1.02]"
                >
                  <Save className="w-4 h-4" />
                  Simpan Desain Template
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: LIVE INTERACTIVE CANVAS PREVIEW (7 COLS) */}
          <div className="lg:col-span-7 bg-slate-950 p-6 rounded-3xl border border-slate-800 shadow-2xl flex flex-col items-center justify-center relative min-h-[450px]">
            <div className="absolute top-4 left-5 right-5 flex justify-between items-center z-10">
              <span className="text-[11px] font-black uppercase text-brand-400 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-800 shadow-sm flex items-center gap-2">
                <Edit3 className="w-3.5 h-3.5 text-brand-400" />
                Live Pratinjau Desainer Sertifikat
              </span>
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/80 px-2.5 py-1 rounded-lg border border-emerald-800/60 flex items-center gap-1.5">
                <Check className="w-3 h-3 text-emerald-400" />
                Tersimpan Otomatis
              </span>
            </div>

            <div className="w-full h-full flex items-center justify-center pt-8">
              <canvas
                ref={canvasRef}
                onClick={handleCanvasClick}
                className="w-full h-auto max-h-[65vh] object-contain rounded-2xl shadow-2xl border border-slate-800 cursor-crosshair hover:ring-2 hover:ring-brand-500 transition-all"
                title="Klik untuk memindahkan elemen yang dipilih"
              />
            </div>
          </div>
        </div>
      )}

      {/* MODAL TERBITKAN SERTIFIKAT BARU */}
      <ModalPortal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Terbitkan Sertifikat Guru"
        icon={Award}
        maxWidth="max-w-lg"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (selectedTeacherIds.length === 0) {
              alert("Pilihlah minimal 1 guru penerima sertifikat!");
              return;
            }
            if (!namaKegiatan) {
              alert("Isi nama kegiatan terlebih dahulu!");
              return;
            }
            addMutation.mutate();
          }}
          className="space-y-4"
        >
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-xs font-bold">
              {errorMsg}
            </div>
          )}

          {/* Pilih Guru (Multi-Select & Pilih Semua) */}
          <div className="space-y-2 bg-brand-50/50 p-4 rounded-2xl border border-brand-100">
            <div className="flex justify-between items-center">
              <label className="text-[11px] font-black text-brand-950 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-4 h-4 text-brand-600" />
                Pilih Guru Penerima Sertifikat *
              </label>
              <span className="text-[10px] font-extrabold bg-brand-600 text-white px-2.5 py-0.5 rounded-xl">
                {selectedTeacherIds.length} / {teachers.length} Guru Terpilih
              </span>
            </div>

            {/* Header Checkbox: Pilih Semua */}
            <div className="flex items-center justify-between pt-1 pb-2 border-b border-brand-200/60">
              <button
                type="button"
                onClick={() => handleSelectAllTeachers(!isAllSelected)}
                className="flex items-center gap-2 text-xs font-bold text-brand-700 hover:text-brand-900 cursor-pointer bg-transparent border-0"
              >
                {isAllSelected ? (
                  <CheckSquare className="w-4 h-4 text-brand-600" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400" />
                )}
                <span>Pilih Semua Guru ({teachers.length})</span>
              </button>
            </div>

            {/* Filter Search Teacher */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
              <input
                type="text"
                placeholder="Cari nama atau email guru..."
                value={teacherSearchQuery}
                onChange={(e) => setTeacherSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white rounded-xl border border-brand-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            {/* Teacher List Checkboxes */}
            <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100">
              {loadingTeachers ? (
                <p className="text-center py-4 text-xs text-slate-400">Memuat data guru...</p>
              ) : filteredTeachersInModal.length > 0 ? (
                filteredTeachersInModal.map((t) => {
                  const isChecked = selectedTeacherIds.includes(t.id);
                  return (
                    <label
                      key={t.id}
                      className={`flex items-center justify-between p-2 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                        isChecked ? "bg-white shadow-xs border border-brand-200 text-brand-950" : "hover:bg-brand-100/50 text-slate-600"
                      }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleTeacher(t.id)}
                          className="w-4 h-4 accent-brand-600 rounded cursor-pointer"
                        />
                        <div className="truncate">
                          <span className="font-bold text-slate-900 block truncate">{toSentenceCase(t.nama)}</span>
                          <span className="text-[10px] text-slate-400 block truncate">{t.email}</span>
                        </div>
                      </div>
                    </label>
                  );
                })
              ) : (
                <p className="text-center py-4 text-xs text-slate-400">Tidak ada guru ditemukan.</p>
              )}
            </div>
          </div>

          {/* Nama Kegiatan */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-brand-400 uppercase tracking-widest block">
              Nama Kegiatan / Pelatihan *
            </label>
            <input
              type="text"
              placeholder="Contoh: Workshop Pembelajaran Berbasis AI"
              value={namaKegiatan}
              onChange={(e) => setNamaKegiatan(e.target.value)}
              required
              className="w-full p-3 bg-brand-50/40 rounded-2xl border border-brand-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 text-brand-950 placeholder-brand-500/30"
            />
          </div>

          {/* Tanggal & Peran */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-brand-400 uppercase tracking-widest block">
                Tanggal Kegiatan *
              </label>
              <input
                type="date"
                value={tanggalKegiatan}
                onChange={(e) => setTanggalKegiatan(e.target.value)}
                required
                className="w-full p-3 bg-brand-50/40 rounded-2xl border border-brand-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 text-brand-950"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-brand-400 uppercase tracking-widest block">
                Peran Guru *
              </label>
              <select
                value={peran}
                onChange={(e) => setPeran(e.target.value)}
                className="w-full p-3 bg-brand-50/40 rounded-2xl border border-brand-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 text-brand-950"
              >
                <option value="Peserta">Peserta</option>
                <option value="Narasumber">Narasumber / Pemateri</option>
                <option value="Panitia">Panitia</option>
                <option value="Moderator">Moderator</option>
                <option value="Lainnya">Lainnya...</option>
              </select>
            </div>
          </div>

          {peran === "Lainnya" && (
            <input
              type="text"
              placeholder="Ketik peran..."
              value={customPeran}
              onChange={(e) => setCustomPeran(e.target.value)}
              className="w-full p-3 bg-brand-50/40 rounded-2xl border border-brand-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 text-brand-950"
            />
          )}

          {/* No Sertifikat */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-brand-400 uppercase tracking-widest block">
              Nomor Surat Sertifikat
            </label>
            <input
              type="text"
              placeholder="Contoh: SR.098979898666968968"
              value={noSertifikat}
              onChange={(e) => setNoSertifikat(e.target.value)}
              className="w-full p-3 bg-brand-50/40 rounded-2xl border border-brand-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 text-brand-950 font-mono"
            />
          </div>

          {/* Penyelenggara */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-brand-400 uppercase tracking-widest block">
              Penyelenggara
            </label>
            <input
              type="text"
              value={penyelenggara}
              onChange={(e) => setPenyelenggara(e.target.value)}
              className="w-full p-3 bg-brand-50/40 rounded-2xl border border-brand-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 text-brand-950"
            />
          </div>

          {/* Modal Footer */}
          <div className="pt-4 border-t border-brand-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2.5 rounded-2xl hover:bg-brand-200/40 text-brand-600 font-bold text-xs transition-all cursor-pointer bg-transparent border-0"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={addMutation.isPending || selectedTeacherIds.length === 0}
              className="px-5 py-2.5 rounded-2xl brand-gradient text-white font-bold text-xs shadow-md transition-all cursor-pointer border-0 flex items-center gap-2 disabled:opacity-50"
            >
              {addMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : `Simpan & Terbitkan (${selectedTeacherIds.length} Guru)`}
            </button>
          </div>
        </form>
      </ModalPortal>
    </div>
  );
}
