import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import { parseDateSafe } from "../parseDateSafe";
import { Award, Plus, Trash2, Search, X, Check, RefreshCw, Layout, Upload, Save, RotateCcw, Move, Edit3, Image as ImageIcon, Users, CheckSquare, Square, FileText, AlignLeft, Folder, FolderOpen, ArrowLeft, Download } from "lucide-react";
import { getAllKegiatanGuru, getTeacherProfiles, getAllCertifiableProfiles, addKegiatanGuruBulk, deleteKegiatanGuru, deleteKegiatanGuruBulk, deleteAllKegiatanGuru } from "../dbStore";
import ModalPortal from "./ModalPortal";
import { toSentenceCase } from "../formatName";
import { getSertifikatConfigAsync, saveSertifikatConfigAsync, resetSertifikatConfigAsync, SertifikatLayoutConfig, DEFAULT_SERTIFIKAT_CONFIG, getSertifikatPresetsAsync, saveSertifikatPresetAsync, deleteSertifikatPresetAsync } from "../sertifikatConfig";
import { drawCertificateOnCanvas, drawJpTablePageOnCanvas } from "./GuruSertifikatView";
import { KegiatanGuru } from "../types";
import { jsPDF } from "jspdf";
import JSZip from "jszip";

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
  const [selectedActivityFolder, setSelectedActivityFolder] = useState<string | null>(null);
  const [zipDownloadingId, setZipDownloadingId] = useState<string | null>(null);
  const [zipProgress, setZipProgress] = useState<{ current: number; total: number } | null>(null);
  const [bulkDownloadMenu, setBulkDownloadMenu] = useState<string | null>(null);
  const [singleDownloadMenu, setSingleDownloadMenu] = useState<string | null>(null);

  useEffect(() => {
    const handler = () => { setBulkDownloadMenu(null); setSingleDownloadMenu(null); };
    if (bulkDownloadMenu || singleDownloadMenu) {
      window.addEventListener("click", handler);
      return () => window.removeEventListener("click", handler);
    }
  }, [bulkDownloadMenu, singleDownloadMenu]);

  // Form State for publishing certificate
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [teacherSearchQuery, setTeacherSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"semua" | "guru" | "tata_usaha" | "murid" | "siswa">("semua");
  const [namaKegiatan, setNamaKegiatan] = useState("");
  const [tanggalKegiatan, setTanggalKegiatan] = useState(() => new Date().toISOString().slice(0, 10));
  const [peran, setPeran] = useState("Peserta");
  const [customPeran, setCustomPeran] = useState("");
  const [noSertifikat, setNoSertifikat] = useState("");
  const [penyelenggara, setPenyelenggara] = useState("SMAN 19 Bandung");

  // Designer State
  const [config, setConfig] = useState<SertifikatLayoutConfig>(DEFAULT_SERTIFIKAT_CONFIG);
  const [selectedElement, setSelectedElement] = useState<string>("namaGuru");
  const [desainerPage, setDesainerPage] = useState<1 | 2>(1);
  const [sidebarTab, setSidebarTab] = useState<"konten" | "posisi" | "jp" | "presets">("konten");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const dragStartPercent = useRef<{ xPercent: number; yPercent: number } | null>(null);

  const getClosestElement = (xPercent: number, yPercent: number, page: 1 | 2): string | null => {
    const pos = config.positions;
    let minDistance = Infinity;
    let closestKey: string | null = null;

    const page1Keys = [
      "noSertifikat", "prefixNama", "namaGuru", "deskripsi", "tanggalKegiatan",
      "sertifikatTitlePos", "logoFrontPos", "logoBackPos"
    ];
    const page2Keys = [
      "jpHeaderTitlePos", "jpHeaderSubtitlePos", "jpHeaderSub2Pos", "jpTanggalPos", "materiJpTablePos"
    ];

    const targetKeys = page === 1 ? page1Keys : page2Keys;

    for (const key of targetKeys) {
      const elemPos = (pos as any)[key];
      if (elemPos && typeof elemPos.xPercent === "number" && typeof elemPos.yPercent === "number") {
        const dx = elemPos.xPercent - xPercent;
        const dy = elemPos.yPercent - yPercent;
        const dist = Math.hypot(dx, dy);
        if (dist < 12 && dist < minDistance) {
          minDistance = dist;
          closestKey = key;
        }
      }
    }

    if (page === 1) {
      if (pos.ttd1NamaPos) {
        const dist = Math.hypot(pos.ttd1NamaPos.xPercent - xPercent, pos.ttd1NamaPos.yPercent - yPercent);
        if (dist < 12 && dist < minDistance) {
          minDistance = dist;
          closestKey = "ttd1";
        }
      }
      if (pos.ttd2NamaPos) {
        const dist = Math.hypot(pos.ttd2NamaPos.xPercent - xPercent, pos.ttd2NamaPos.yPercent - yPercent);
        if (dist < 12 && dist < minDistance) {
          minDistance = dist;
          closestKey = "ttd2";
        }
      }
      if (pos.ttd3NamaPos) {
        const dist = Math.hypot(pos.ttd3NamaPos.xPercent - xPercent, pos.ttd3NamaPos.yPercent - yPercent);
        if (dist < 12 && dist < minDistance) {
          minDistance = dist;
          closestKey = "ttd3";
        }
      }
    } else {
      if (pos.jpTtdNamaPos) {
        const dist = Math.hypot(pos.jpTtdNamaPos.xPercent - xPercent, pos.jpTtdNamaPos.yPercent - yPercent);
        if (dist < 12 && dist < minDistance) {
          minDistance = dist;
          closestKey = "jpTtd";
        }
      }
    }

    return closestKey;
  };

  // Preset State
  const [presets, setPresets] = useState<{ id: string; config: SertifikatLayoutConfig }[]>([]);
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [presetSlotToSave, setPresetSlotToSave] = useState("");
  const [presetNameInput, setPresetNameInput] = useState("");
  const [successToast, setSuccessToast] = useState("");
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);

  const loadPresets = () => {
    getSertifikatPresetsAsync().then(res => setPresets(res));
  };

  // Load config & presets on mount
  useEffect(() => {
    getSertifikatConfigAsync().then(cfg => setConfig(cfg));
    loadPresets();
  }, []);

  const changeTtdCount = (count: 1 | 2 | 3) => {
    setConfig(prev => {
      const updatedPos = { ...prev.positions };
      if (count === 1) {
        updatedPos.ttd1ImagePos.xPercent = 50;
        updatedPos.ttd1NamaPos.xPercent = 50;
        updatedPos.ttd1JabatanPos.xPercent = 50;
        updatedPos.ttd1SubText1Pos.xPercent = 50;
        updatedPos.ttd1SubText2Pos.xPercent = 50;
        if (updatedPos.jpTanggalPos) {
          updatedPos.jpTanggalPos.xPercent = 72.5;
        }
      } else if (count === 2) {
        updatedPos.ttd1ImagePos.xPercent = 27;
        updatedPos.ttd1NamaPos.xPercent = 27;
        updatedPos.ttd1JabatanPos.xPercent = 27;
        updatedPos.ttd1SubText1Pos.xPercent = 27;
        updatedPos.ttd1SubText2Pos.xPercent = 27;

        updatedPos.ttd2ImagePos.xPercent = 73;
        updatedPos.ttd2NamaPos.xPercent = 73;
        updatedPos.ttd2JabatanPos.xPercent = 73;
        updatedPos.ttd2SubText1Pos.xPercent = 73;
        updatedPos.ttd2SubText2Pos.xPercent = 73;
        if (updatedPos.jpTanggalPos) {
          updatedPos.jpTanggalPos.xPercent = 73;
        }
      } else if (count === 3) {
        updatedPos.ttd1ImagePos.xPercent = 20;
        updatedPos.ttd1NamaPos.xPercent = 20;
        updatedPos.ttd1JabatanPos.xPercent = 20;
        updatedPos.ttd1SubText1Pos.xPercent = 20;
        updatedPos.ttd1SubText2Pos.xPercent = 20;

        updatedPos.ttd3ImagePos.xPercent = 50;
        updatedPos.ttd3NamaPos.xPercent = 50;
        updatedPos.ttd3JabatanPos.xPercent = 50;
        updatedPos.ttd3SubText1Pos.xPercent = 50;
        updatedPos.ttd3SubText2Pos.xPercent = 50;

        updatedPos.ttd2ImagePos.xPercent = 80;
        updatedPos.ttd2NamaPos.xPercent = 80;
        updatedPos.ttd2JabatanPos.xPercent = 80;
        updatedPos.ttd2SubText1Pos.xPercent = 80;
        updatedPos.ttd2SubText2Pos.xPercent = 80;
        if (updatedPos.jpTanggalPos) {
          updatedPos.jpTanggalPos.xPercent = 80;
        }
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
    queryKey: ["allCertifiableProfiles"],
    queryFn: getAllCertifiableProfiles,
    enabled: isAddModalOpen,
  });

  // Mutations
  const addMutation = useMutation({
    mutationFn: async () => {
      const finalPeran = peran === "Lainnya" ? customPeran : peran;
      const calculatedTotalJp = config.hasJpPage
        ? (config.materiJpRows || []).reduce((acc, row) => acc + (Number(row.jp) || 0), 0)
        : undefined;
      return addKegiatanGuruBulk(
        selectedTeacherIds,
        namaKegiatan,
        tanggalKegiatan,
        finalPeran,
        noSertifikat,
        penyelenggara,
        calculatedTotalJp,
        config.hasJpPage ? config.materiJpRows : null
      );
    },
    onSuccess: () => {
      setSuccessMsg(`Sertifikat berhasil diterbitkan untuk ${selectedTeacherIds.length} penerima!`);
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

  // Filter by role then by search
  const filteredByRole = roleFilter === "semua"
    ? teachers
    : roleFilter === "murid"
    ? teachers.filter((t) => t.role === "murid" || t.role === "siswa")
    : teachers.filter((t) => t.role === roleFilter);

  const filteredTeachersInModal = filteredByRole.filter(t =>
    t.nama.toLowerCase().includes(teacherSearchQuery.toLowerCase()) ||
    t.email.toLowerCase().includes(teacherSearchQuery.toLowerCase())
  );

  const isAllSelected = filteredTeachersInModal.length > 0 && filteredTeachersInModal.every(t => selectedTeacherIds.includes(t.id));

  const handleSelectAllTeachers = (checked: boolean) => {
    if (checked) {
      setSelectedTeacherIds(prev => {
        const newIds = filteredTeachersInModal.map(t => t.id);
        return Array.from(new Set([...prev, ...newIds]));
      });
    } else {
      const removeIds = new Set(filteredTeachersInModal.map(t => t.id));
      setSelectedTeacherIds(prev => prev.filter(id => !removeIds.has(id)));
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
        document.fonts.ready,
        new Promise<void>((resolve) => {
          templateImg.onload = () => resolve();
          templateImg.onerror = () => resolve();
        }),
        loadImg(config.ttd1Image),
        loadImg(config.ttd2Image),
        loadImg(config.ttd3Image),
        loadImg(config.templateJpUrl),
        loadImg(config.logoFrontImage),
        loadImg(config.logoBackImage),
      ]).then(([___, _, ttd1Img, ttd2Img, ttd3Img, templateJpImg, logoFrontImg, logoBackImg]) => {
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
          materi_jp: config.materiJpRows || [],
          created_at: new Date().toISOString()
        };

        // Helper to draw highlight box around selected element
        const drawHighlightBox = (x: number, y: number, label: string, width = 350, height = 70, align = "center") => {
          ctx.strokeStyle = "#3b82f6";
          ctx.lineWidth = 4;
          ctx.setLineDash([10, 6]);
          
          let boxX = x - width / 2;
          if (align === "left") boxX = x;
          if (align === "right") boxX = x - width;
          const boxY = y - height / 2;

          ctx.beginPath();
          // Draw rounded dashed rect
          ctx.roundRect(boxX, boxY, width, height, 12);
          ctx.stroke();
          ctx.setLineDash([]);

          // Draw label box above/below
          ctx.fillStyle = "#3b82f6";
          ctx.font = "bold 20px sans-serif";
          const labelText = ` ${label} `;
          const labelW = ctx.measureText(labelText).width + 16;
          const labelH = 32;
          const labelY = boxY - labelH - 8 > 10 ? boxY - labelH - 8 : boxY + height + 8;
          
          ctx.beginPath();
          ctx.roundRect(boxX, labelY, labelW, labelH, 6);
          ctx.fill();

          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(labelText, boxX + 8, labelY + labelH / 2);
        };

        if (desainerPage === 2 && config.hasJpPage) {
          drawJpTablePageOnCanvas(
            ctx,
            canvas.width,
            canvas.height,
            dummyKegiatan,
            config,
            ttd1Img,
            ttd2Img,
            ttd3Img,
            templateJpImg,
            logoBackImg
          );

          // Highlight selected element position with a target indicator on page 2
          const pos = config.positions;
          let targetX = canvas.width / 2;
          let targetY = canvas.height / 2;
          let label = "";
          let w = 400;
          let h = 80;
          let align = "center";
          let showTarget = false;

          if (selectedElement === "jpHeaderTitlePos" && pos.jpHeaderTitlePos) {
            targetX = (pos.jpHeaderTitlePos.xPercent / 100) * canvas.width;
            targetY = (pos.jpHeaderTitlePos.yPercent / 100) * canvas.height;
            label = "Judul Halaman Belakang (JP)";
            h = (pos.jpHeaderTitlePos.fontSize || 32) * 1.6;
            w = 800;
            showTarget = true;
          } else if (selectedElement === "jpHeaderSubtitlePos" && pos.jpHeaderSubtitlePos) {
            targetX = (pos.jpHeaderSubtitlePos.xPercent / 100) * canvas.width;
            targetY = (pos.jpHeaderSubtitlePos.yPercent / 100) * canvas.height;
            label = "Subjudul JP";
            h = (pos.jpHeaderSubtitlePos.fontSize || 20) * 1.6;
            w = 800;
            showTarget = true;
          } else if (selectedElement === "jpHeaderSub2Pos" && pos.jpHeaderSub2Pos) {
            targetX = (pos.jpHeaderSub2Pos.xPercent / 100) * canvas.width;
            targetY = (pos.jpHeaderSub2Pos.yPercent / 100) * canvas.height;
            label = "Instansi JP";
            h = (pos.jpHeaderSub2Pos.fontSize || 18) * 1.6;
            w = 800;
            showTarget = true;
          } else if (selectedElement === "jpTanggalPos" && pos.jpTanggalPos) {
            targetX = (pos.jpTanggalPos.xPercent / 100) * canvas.width;
            targetY = (pos.jpTanggalPos.yPercent / 100) * canvas.height;
            label = "Tempat & Tanggal JP";
            h = (pos.jpTanggalPos.fontSize || 18) * 1.6;
            w = 350;
            showTarget = true;
          } else if (selectedElement === "jpTtd" && pos.jpTtdNamaPos) {
            targetX = (pos.jpTtdNamaPos.xPercent / 100) * canvas.width;
            targetY = (pos.jpTtdNamaPos.yPercent / 100) * canvas.height;
            label = "Grup Tanda Tangan JP";
            h = 160;
            w = 380;
            showTarget = true;
          } else if (selectedElement === "jpTtdJabatanPos" && pos.jpTtdJabatanPos) {
            targetX = (pos.jpTtdJabatanPos.xPercent / 100) * canvas.width;
            targetY = (pos.jpTtdJabatanPos.yPercent / 100) * canvas.height;
            label = "Jabatan TTD JP";
            h = (pos.jpTtdJabatanPos.fontSize || 18) * 1.6;
            w = 350;
            showTarget = true;
          } else if (selectedElement === "logoBackPos" && pos.logoBackPos) {
            targetX = (pos.logoBackPos.xPercent / 100) * canvas.width;
            targetY = (pos.logoBackPos.yPercent / 100) * canvas.height;
            label = "Logo Belakang (JP)";
            w = (pos.logoBackPos.widthPercent / 100) * canvas.width;
            h = w; // Assume square aspect ratio for box
            showTarget = true;
          }

          if (showTarget) {
            drawHighlightBox(targetX, targetY, label, w, h, align);
          }
        } else {
          drawCertificateOnCanvas(
            ctx,
            canvas.width,
            canvas.height,
            templateImg,
            dummyKegiatan,
            "Joseph Adeyemi, S.Pd.",
            config,
            ttd1Img,
            ttd2Img,
            ttd3Img,
            logoFrontImg
          );

          // Highlight selected element position with a target indicator
          const pos = config.positions;
          let targetX = canvas.width / 2;
          let targetY = canvas.height / 2;
          let label = "";
          let w = 400;
          let h = 80;
          let align = "center";
          let showTarget = true;

          if (selectedElement === "noSertifikat" && pos.noSertifikat) {
            targetX = (pos.noSertifikat.xPercent / 100) * canvas.width;
            targetY = (pos.noSertifikat.yPercent / 100) * canvas.height;
            label = "Nomor Sertifikat";
            h = (pos.noSertifikat.fontSize || 22) * 1.6;
            w = 600;
          } else if (selectedElement === "prefixNama" && pos.prefixNama) {
            targetX = (pos.prefixNama.xPercent / 100) * canvas.width;
            targetY = (pos.prefixNama.yPercent / 100) * canvas.height;
            label = "Prefix Nama";
            h = (pos.prefixNama.fontSize || 20) * 1.6;
            w = 400;
          } else if (selectedElement === "namaGuru" && pos.namaGuru) {
            targetX = (pos.namaGuru.xPercent / 100) * canvas.width;
            targetY = (pos.namaGuru.yPercent / 100) * canvas.height;
            label = "Nama Guru / Penerima";
            h = (pos.namaGuru.fontSize || 40) * 1.6;
            w = 900;
          } else if (selectedElement === "deskripsi" && pos.deskripsi) {
            targetX = (pos.deskripsi.xPercent / 100) * canvas.width;
            targetY = (pos.deskripsi.yPercent / 100) * canvas.height;
            label = "Kalimat Deskripsi";
            h = (pos.deskripsi.fontSize || 20) * 4.0; // Multi-line description
            w = canvas.width * 0.78;
            align = pos.deskripsi.align || "center";
          } else if (selectedElement === "tanggalKegiatan" && pos.tanggalKegiatan) {
            targetX = (pos.tanggalKegiatan.xPercent / 100) * canvas.width;
            targetY = (pos.tanggalKegiatan.yPercent / 100) * canvas.height;
            label = "Tempat & Tanggal";
            h = (pos.tanggalKegiatan.fontSize || 18) * 1.6;
            w = 400;
          } else if (selectedElement === "sertifikatTitlePos" && pos.sertifikatTitlePos) {
            targetX = (pos.sertifikatTitlePos.xPercent / 100) * canvas.width;
            targetY = (pos.sertifikatTitlePos.yPercent / 100) * canvas.height;
            label = "Judul Sertifikat";
            h = (pos.sertifikatTitlePos.fontSize || 60) * 1.6;
            w = 800;
          } else if (selectedElement === "logoFrontPos" && pos.logoFrontPos) {
            targetX = (pos.logoFrontPos.xPercent / 100) * canvas.width;
            targetY = (pos.logoFrontPos.yPercent / 100) * canvas.height;
            label = "Logo Depan";
            w = (pos.logoFrontPos.widthPercent / 100) * canvas.width;
            h = w;
          } else if (selectedElement === "ttd1" && pos.ttd1NamaPos) {
            targetX = (pos.ttd1NamaPos.xPercent / 100) * canvas.width;
            targetY = (pos.ttd1NamaPos.yPercent / 100) * canvas.height;
            label = "Grup Tanda Tangan 1";
            h = 180;
            w = 380;
          } else if (selectedElement === "ttd2" && pos.ttd2NamaPos) {
            targetX = (pos.ttd2NamaPos.xPercent / 100) * canvas.width;
            targetY = (pos.ttd2NamaPos.yPercent / 100) * canvas.height;
            label = "Grup Tanda Tangan 2";
            h = 180;
            w = 380;
          } else if (selectedElement === "ttd3" && pos.ttd3NamaPos) {
            targetX = (pos.ttd3NamaPos.xPercent / 100) * canvas.width;
            targetY = (pos.ttd3NamaPos.yPercent / 100) * canvas.height;
            label = "Grup Tanda Tangan 3";
            h = 180;
            w = 380;
          } else if (selectedElement === "ttd1JabatanPos" && pos.ttd1JabatanPos) {
            targetX = (pos.ttd1JabatanPos.xPercent / 100) * canvas.width;
            targetY = (pos.ttd1JabatanPos.yPercent / 100) * canvas.height;
            label = "Jabatan TTD 1";
            h = (pos.ttd1JabatanPos.fontSize || 18) * 1.6;
            w = 350;
          } else if (selectedElement === "ttd2JabatanPos" && pos.ttd2JabatanPos) {
            targetX = (pos.ttd2JabatanPos.xPercent / 100) * canvas.width;
            targetY = (pos.ttd2JabatanPos.yPercent / 100) * canvas.height;
            label = "Jabatan TTD 2";
            h = (pos.ttd2JabatanPos.fontSize || 18) * 1.6;
            w = 350;
          } else if (selectedElement === "ttd3JabatanPos" && pos.ttd3JabatanPos) {
            targetX = (pos.ttd3JabatanPos.xPercent / 100) * canvas.width;
            targetY = (pos.ttd3JabatanPos.yPercent / 100) * canvas.height;
            label = "Jabatan TTD 3";
            h = (pos.ttd3JabatanPos.fontSize || 18) * 1.6;
            w = 350;
          } else {
            showTarget = false;
          }

          if (showTarget) {
            drawHighlightBox(targetX, targetY, label, w, h, align);
          }
        }
      });
    }
  }, [activeTab, config, selectedElement, desainerPage]);

  // Click on Canvas to reposition selected element
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // If it was a drag operation (dragged more than threshold), do not process as click
    if (isDraggingRef.current) return;

    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const xPercent = Math.round((clickX / rect.width) * 1000) / 10;
    const yPercent = Math.round((clickY / rect.height) * 1000) / 10;

    // Check proximity to auto-select element
    const closest = getClosestElement(xPercent, yPercent, desainerPage);
    if (closest) {
      setSelectedElement(closest);
      return; // Select only on click, don't move it yet
    }

    // Otherwise, move currently selected element to clicked position
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
      } else if (selectedElement === "tanggalKegiatan") {
        updatedPos.tanggalKegiatan = { ...updatedPos.tanggalKegiatan, xPercent, yPercent };
      } else if (selectedElement === "sertifikatTitlePos") {
        updatedPos.sertifikatTitlePos = { ...updatedPos.sertifikatTitlePos, xPercent, yPercent };
      } else if (selectedElement === "logoFrontPos") {
        updatedPos.logoFrontPos = { ...updatedPos.logoFrontPos, xPercent, yPercent };
      } else if (selectedElement === "logoBackPos") {
        updatedPos.logoBackPos = { ...updatedPos.logoBackPos, xPercent, yPercent };
      } else if (selectedElement === "jpHeaderTitlePos") {
        updatedPos.jpHeaderTitlePos = { ...updatedPos.jpHeaderTitlePos, xPercent, yPercent };
      } else if (selectedElement === "jpHeaderSubtitlePos") {
        updatedPos.jpHeaderSubtitlePos = { ...updatedPos.jpHeaderSubtitlePos, xPercent, yPercent };
      } else if (selectedElement === "jpHeaderSub2Pos") {
        updatedPos.jpHeaderSub2Pos = { ...updatedPos.jpHeaderSub2Pos, xPercent, yPercent };
      } else if (selectedElement === "jpTanggalPos") {
        updatedPos.jpTanggalPos = { ...updatedPos.jpTanggalPos, xPercent, yPercent };
      } else if (selectedElement === "jpTtd") {
        updatedPos.jpTtdImagePos = { ...updatedPos.jpTtdImagePos, xPercent, yPercent: yPercent - 7 };
        updatedPos.jpTtdNamaPos = { ...updatedPos.jpTtdNamaPos, xPercent, yPercent: yPercent + 7 };
        updatedPos.jpTtdJabatanPos = { ...updatedPos.jpTtdJabatanPos, xPercent, yPercent: yPercent - 5 };
        updatedPos.jpTtdSubText1Pos = { ...updatedPos.jpTtdSubText1Pos, xPercent, yPercent: yPercent + 9.5 };
        updatedPos.jpTtdSubText2Pos = { ...updatedPos.jpTtdSubText2Pos, xPercent, yPercent: yPercent + 11.5 };
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
      } else if (selectedElement === "ttd1JabatanPos") {
        updatedPos.ttd1JabatanPos = { ...updatedPos.ttd1JabatanPos, xPercent, yPercent };
      } else if (selectedElement === "ttd2JabatanPos") {
        updatedPos.ttd2JabatanPos = { ...updatedPos.ttd2JabatanPos, xPercent, yPercent };
      } else if (selectedElement === "ttd3JabatanPos") {
        updatedPos.ttd3JabatanPos = { ...updatedPos.ttd3JabatanPos, xPercent, yPercent };
      } else if (selectedElement === "jpTtdJabatanPos") {
        updatedPos.jpTtdJabatanPos = { ...updatedPos.jpTtdJabatanPos, xPercent, yPercent };
      }
      return { ...prev, positions: updatedPos };
    });
  };

  // Drag and Drop Event Handlers
  const startDrag = (clientX: number, clientY: number) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const xPercent = (x / rect.width) * 100;
    const yPercent = (y / rect.height) * 100;

    // Detect if clicking near an element to auto-select it
    const closest = getClosestElement(xPercent, yPercent, desainerPage);
    let activeElem = selectedElement;
    if (closest) {
      setSelectedElement(closest);
      activeElem = closest;
    }

    const pos = config.positions;
    let elemX = 50;
    let elemY = 50;

    if (activeElem === "ttd1" && pos.ttd1NamaPos) {
      elemX = pos.ttd1NamaPos.xPercent;
      elemY = pos.ttd1NamaPos.yPercent;
    } else if (activeElem === "ttd2" && pos.ttd2NamaPos) {
      elemX = pos.ttd2NamaPos.xPercent;
      elemY = pos.ttd2NamaPos.yPercent;
    } else if (activeElem === "ttd3" && pos.ttd3NamaPos) {
      elemX = pos.ttd3NamaPos.xPercent;
      elemY = pos.ttd3NamaPos.yPercent;
    } else if (activeElem === "jpTtd" && pos.jpTtdNamaPos) {
      elemX = pos.jpTtdNamaPos.xPercent;
      elemY = pos.jpTtdNamaPos.yPercent;
    } else {
      const ePos = (pos as any)[activeElem];
      if (ePos) {
        elemX = ePos.xPercent;
        elemY = ePos.yPercent;
      }
    }

    dragStartPos.current = { x: clientX, y: clientY };
    dragStartPercent.current = { xPercent: elemX, yPercent: elemY };
    isDraggingRef.current = false;
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return; // Left click only
    startDrag(e.clientX, e.clientY);
  };

  const handleCanvasTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 0) return;
    // Prevent default scrolling behavior when trying to drag on touch devices
    e.preventDefault();
    startDrag(e.touches[0].clientX, e.touches[0].clientY);
  };

  const moveDrag = (clientX: number, clientY: number) => {
    if (!dragStartPos.current || !dragStartPercent.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const dx = clientX - dragStartPos.current.x;
    const dy = clientY - dragStartPos.current.y;

    if (!isDraggingRef.current) {
      if (Math.hypot(dx, dy) > 5) {
        isDraggingRef.current = true;
        setIsDragging(true);
      } else {
        return;
      }
    }

    const dxPercent = (dx / rect.width) * 100;
    const dyPercent = (dy / rect.height) * 100;

    let targetX = Math.round((dragStartPercent.current.xPercent + dxPercent) * 10) / 10;
    let targetY = Math.round((dragStartPercent.current.yPercent + dyPercent) * 10) / 10;

    targetX = Math.max(0, Math.min(100, targetX));
    targetY = Math.max(0, Math.min(100, targetY));

    setConfig(prev => {
      const updatedPos = { ...prev.positions };
      const elemKey = selectedElement;

      if (elemKey === "noSertifikat") {
        updatedPos.noSertifikat = { ...updatedPos.noSertifikat, xPercent: targetX, yPercent: targetY };
      } else if (elemKey === "prefixNama") {
        updatedPos.prefixNama = { ...updatedPos.prefixNama, xPercent: targetX, yPercent: targetY };
      } else if (elemKey === "namaGuru") {
        updatedPos.namaGuru = { ...updatedPos.namaGuru, xPercent: targetX, yPercent: targetY };
      } else if (elemKey === "deskripsi") {
        updatedPos.deskripsi = { ...updatedPos.deskripsi, xPercent: targetX, yPercent: targetY };
      } else if (elemKey === "tanggalKegiatan" && updatedPos.tanggalKegiatan) {
        updatedPos.tanggalKegiatan = { ...updatedPos.tanggalKegiatan, xPercent: targetX, yPercent: targetY };
      } else if (elemKey === "sertifikatTitlePos" && updatedPos.sertifikatTitlePos) {
        updatedPos.sertifikatTitlePos = { ...updatedPos.sertifikatTitlePos, xPercent: targetX, yPercent: targetY };
      } else if (elemKey === "logoFrontPos" && updatedPos.logoFrontPos) {
        updatedPos.logoFrontPos = { ...updatedPos.logoFrontPos, xPercent: targetX, yPercent: targetY };
      } else if (elemKey === "logoBackPos" && updatedPos.logoBackPos) {
        updatedPos.logoBackPos = { ...updatedPos.logoBackPos, xPercent: targetX, yPercent: targetY };
      } else if (elemKey === "jpHeaderTitlePos" && updatedPos.jpHeaderTitlePos) {
        updatedPos.jpHeaderTitlePos = { ...updatedPos.jpHeaderTitlePos, xPercent: targetX, yPercent: targetY };
      } else if (elemKey === "jpHeaderSubtitlePos" && updatedPos.jpHeaderSubtitlePos) {
        updatedPos.jpHeaderSubtitlePos = { ...updatedPos.jpHeaderSubtitlePos, xPercent: targetX, yPercent: targetY };
      } else if (elemKey === "jpHeaderSub2Pos" && updatedPos.jpHeaderSub2Pos) {
        updatedPos.jpHeaderSub2Pos = { ...updatedPos.jpHeaderSub2Pos, xPercent: targetX, yPercent: targetY };
      } else if (elemKey === "jpTanggalPos" && updatedPos.jpTanggalPos) {
        updatedPos.jpTanggalPos = { ...updatedPos.jpTanggalPos, xPercent: targetX, yPercent: targetY };
      } else if (elemKey === "jpTtd" && updatedPos.jpTtdNamaPos) {
        const diffX = targetX - updatedPos.jpTtdNamaPos.xPercent;
        const diffY = targetY - updatedPos.jpTtdNamaPos.yPercent;

        updatedPos.jpTtdImagePos = { ...updatedPos.jpTtdImagePos, xPercent: updatedPos.jpTtdImagePos.xPercent + diffX, yPercent: updatedPos.jpTtdImagePos.yPercent + diffY };
        updatedPos.jpTtdNamaPos = { ...updatedPos.jpTtdNamaPos, xPercent: targetX, yPercent: targetY };
        updatedPos.jpTtdJabatanPos = { ...updatedPos.jpTtdJabatanPos, xPercent: updatedPos.jpTtdJabatanPos.xPercent + diffX, yPercent: updatedPos.jpTtdJabatanPos.yPercent + diffY };
        updatedPos.jpTtdSubText1Pos = { ...updatedPos.jpTtdSubText1Pos, xPercent: updatedPos.jpTtdSubText1Pos.xPercent + diffX, yPercent: updatedPos.jpTtdSubText1Pos.yPercent + diffY };
        updatedPos.jpTtdSubText2Pos = { ...updatedPos.jpTtdSubText2Pos, xPercent: updatedPos.jpTtdSubText2Pos.xPercent + diffX, yPercent: updatedPos.jpTtdSubText2Pos.yPercent + diffY };
      } else if (elemKey === "ttd1" && updatedPos.ttd1NamaPos) {
        const diffX = targetX - updatedPos.ttd1NamaPos.xPercent;
        const diffY = targetY - updatedPos.ttd1NamaPos.yPercent;

        updatedPos.ttd1ImagePos = { ...updatedPos.ttd1ImagePos, xPercent: updatedPos.ttd1ImagePos.xPercent + diffX, yPercent: updatedPos.ttd1ImagePos.yPercent + diffY };
        updatedPos.ttd1NamaPos = { ...updatedPos.ttd1NamaPos, xPercent: targetX, yPercent: targetY };
        updatedPos.ttd1JabatanPos = { ...updatedPos.ttd1JabatanPos, xPercent: updatedPos.ttd1JabatanPos.xPercent + diffX, yPercent: updatedPos.ttd1JabatanPos.yPercent + diffY };
        updatedPos.ttd1SubText1Pos = { ...updatedPos.ttd1SubText1Pos, xPercent: updatedPos.ttd1SubText1Pos.xPercent + diffX, yPercent: updatedPos.ttd1SubText1Pos.yPercent + diffY };
        updatedPos.ttd1SubText2Pos = { ...updatedPos.ttd1SubText2Pos, xPercent: updatedPos.ttd1SubText2Pos.xPercent + diffX, yPercent: updatedPos.ttd1SubText2Pos.yPercent + diffY };
      } else if (elemKey === "ttd2" && updatedPos.ttd2NamaPos) {
        const diffX = targetX - updatedPos.ttd2NamaPos.xPercent;
        const diffY = targetY - updatedPos.ttd2NamaPos.yPercent;

        updatedPos.ttd2ImagePos = { ...updatedPos.ttd2ImagePos, xPercent: updatedPos.ttd2ImagePos.xPercent + diffX, yPercent: updatedPos.ttd2ImagePos.yPercent + diffY };
        updatedPos.ttd2NamaPos = { ...updatedPos.ttd2NamaPos, xPercent: targetX, yPercent: targetY };
        updatedPos.ttd2JabatanPos = { ...updatedPos.ttd2JabatanPos, xPercent: updatedPos.ttd2JabatanPos.xPercent + diffX, yPercent: updatedPos.ttd2JabatanPos.yPercent + diffY };
        updatedPos.ttd2SubText1Pos = { ...updatedPos.ttd2SubText1Pos, xPercent: updatedPos.ttd2SubText1Pos.xPercent + diffX, yPercent: updatedPos.ttd2SubText1Pos.yPercent + diffY };
        updatedPos.ttd2SubText2Pos = { ...updatedPos.ttd2SubText2Pos, xPercent: updatedPos.ttd2SubText2Pos.xPercent + diffX, yPercent: updatedPos.ttd2SubText2Pos.yPercent + diffY };
      } else if (elemKey === "ttd3" && updatedPos.ttd3NamaPos) {
        const diffX = targetX - updatedPos.ttd3NamaPos.xPercent;
        const diffY = targetY - updatedPos.ttd3NamaPos.yPercent;

        updatedPos.ttd3ImagePos = { ...updatedPos.ttd3ImagePos, xPercent: updatedPos.ttd3ImagePos.xPercent + diffX, yPercent: updatedPos.ttd3ImagePos.yPercent + diffY };
        updatedPos.ttd3NamaPos = { ...updatedPos.ttd3NamaPos, xPercent: targetX, yPercent: targetY };
        updatedPos.ttd3JabatanPos = { ...updatedPos.ttd3JabatanPos, xPercent: updatedPos.ttd3JabatanPos.xPercent + diffX, yPercent: updatedPos.ttd3JabatanPos.yPercent + diffY };
        updatedPos.ttd3SubText1Pos = { ...updatedPos.ttd3SubText1Pos, xPercent: updatedPos.ttd3SubText1Pos.xPercent + diffX, yPercent: updatedPos.ttd3SubText1Pos.yPercent + diffY };
        updatedPos.ttd3SubText2Pos = { ...updatedPos.ttd3SubText2Pos, xPercent: updatedPos.ttd3SubText2Pos.xPercent + diffX, yPercent: updatedPos.ttd3SubText2Pos.yPercent + diffY };
      } else if (elemKey === "ttd1JabatanPos" && updatedPos.ttd1JabatanPos) {
        updatedPos.ttd1JabatanPos = { ...updatedPos.ttd1JabatanPos, xPercent: targetX, yPercent: targetY };
      } else if (elemKey === "ttd2JabatanPos" && updatedPos.ttd2JabatanPos) {
        updatedPos.ttd2JabatanPos = { ...updatedPos.ttd2JabatanPos, xPercent: targetX, yPercent: targetY };
      } else if (elemKey === "ttd3JabatanPos" && updatedPos.ttd3JabatanPos) {
        updatedPos.ttd3JabatanPos = { ...updatedPos.ttd3JabatanPos, xPercent: targetX, yPercent: targetY };
      } else if (elemKey === "jpTtdJabatanPos" && updatedPos.jpTtdJabatanPos) {
        updatedPos.jpTtdJabatanPos = { ...updatedPos.jpTtdJabatanPos, xPercent: targetX, yPercent: targetY };
      } else {
        const ePos = (updatedPos as any)[elemKey];
        if (ePos) {
          (updatedPos as any)[elemKey] = { ...ePos, xPercent: targetX, yPercent: targetY };
        }
      }

      return { ...prev, positions: updatedPos };
    });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    moveDrag(e.clientX, e.clientY);
  };

  const handleCanvasTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 0) return;
    // Prevent default scrolling behavior when trying to drag on touch devices
    e.preventDefault();
    moveDrag(e.touches[0].clientX, e.touches[0].clientY);
  };

  const endDrag = () => {
    dragStartPos.current = null;
    dragStartPercent.current = null;
    isDraggingRef.current = false;
    setIsDragging(false);
  };

  const handleCanvasMouseUp = () => endDrag();
  const handleCanvasTouchEnd = () => endDrag();

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

  // Upload Logo Front Image
  const handleLogoFrontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const optimizedUrl = await optimizeImageDataUrl(file, 800);
      const newConfig = { ...config, logoFrontImage: optimizedUrl };
      setConfig(newConfig);
      await saveSertifikatConfigAsync(newConfig);
      setSuccessMsg("Logo Depan berhasil diunggah & disimpan!");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      alert("Gagal mengunggah Logo Depan: " + err.message);
    }
  };

  // Upload Logo Back Image
  const handleLogoBackUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const optimizedUrl = await optimizeImageDataUrl(file, 800);
      const newConfig = { ...config, logoBackImage: optimizedUrl };
      setConfig(newConfig);
      await saveSertifikatConfigAsync(newConfig);
      setSuccessMsg("Logo Belakang berhasil diunggah & disimpan!");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      alert("Gagal mengunggah Logo Belakang: " + err.message);
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

  const filteredList = kegiatanList.filter(row => 
    row.user_nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
    row.nama_kegiatan.toLowerCase().includes(searchQuery.toLowerCase()) ||
    row.peran.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group activities by their name (folder)
  const groupedActivities = React.useMemo(() => {
    const groups: { [key: string]: KegiatanGuru[] } = {};
    kegiatanList.forEach((row) => {
      const key = (row.nama_kegiatan || "").trim();
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(row);
    });

    return Object.keys(groups).map((name) => {
      const items = groups[name];
      const hasJp = items.some(item => item.materi_jp && item.materi_jp.length > 0);
      return {
        nama_kegiatan: name,
        items,
        tanggal_kegiatan: items[0].tanggal_kegiatan,
        penyelenggara: items[0].penyelenggara,
        materi_jp: items[0].materi_jp,
        isJp: hasJp,
        total_jp: items[0].materi_jp ? items[0].materi_jp.reduce((acc: number, curr: any) => acc + (Number(curr.jp) || 0), 0) : 0
      };
    });
  }, [kegiatanList]);

  const filteredGroupedActivities = React.useMemo(() => {
    if (!searchQuery) return groupedActivities;
    return groupedActivities.filter(g =>
      g.nama_kegiatan.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [groupedActivities, searchQuery]);

  const folderItems = React.useMemo(() => {
    if (!selectedActivityFolder) return [];
    const matchedGroup = groupedActivities.find(g => g.nama_kegiatan === selectedActivityFolder);
    if (!matchedGroup) return [];
    
    // Filter inside folder by teacher name or role
    if (!searchQuery) return matchedGroup.items;
    return matchedGroup.items.filter(item =>
      item.user_nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.peran.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [selectedActivityFolder, groupedActivities, searchQuery]);

  const handleDownloadSingle = async (kegiatan: KegiatanGuru, pageOption: "front" | "back" | "both" = "both") => {
    const config = await getSertifikatConfigAsync();
    const canvas = document.createElement("canvas");
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

    const fileName = `SERTIFIKAT_${kegiatan.nama_kegiatan.toUpperCase().replace(/\s+/g, "_")}_${toSentenceCase(kegiatan.user_nama || "Guru SMAN 19").replace(/\s+/g, "_")}`;

    try {
      await document.fonts.ready;
      await new Promise<void>((resolve, reject) => {
        templateImg.onload = () => resolve();
        templateImg.onerror = () => reject(new Error("Gagal memuat template sertifikat"));
      });

      const ttd1Img = await loadImg(config.ttd1Image);
      const ttd2Img = await loadImg(config.ttd2Image);
      const ttd3Img = await loadImg(config.ttd3Image);
      const templateJpImg = await loadImg(config.templateJpUrl);
      const logoFrontImg = await loadImg(config.logoFrontImage);
      const logoBackImg = await loadImg(config.logoBackImage);

      canvas.width = templateImg.naturalWidth || 2000;
      canvas.height = templateImg.naturalHeight || 1414;

      const hasJp = config.hasJpPage && config.materiJpRows && config.materiJpRows.length > 0;
      const nameText = kegiatan.user_nama || "Guru SMAN 19";

      if (pageOption === "back" && hasJp) {
        const ctx2 = canvas.getContext("2d");
        if (!ctx2) throw new Error("Gagal");
        drawJpTablePageOnCanvas(ctx2, canvas.width, canvas.height, kegiatan, config, ttd1Img, ttd2Img, ttd3Img, templateJpImg, logoBackImg);
        const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [canvas.width, canvas.height] });
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height);
        pdf.save(`${fileName}_Belakang.pdf`);
      } else if (pageOption === "back" && !hasJp) {
        alert("Sertifikat ini tidak memiliki halaman belakang (Tabel JP).");
      } else {
        drawCertificateOnCanvas(ctx, canvas.width, canvas.height, templateImg, kegiatan, nameText, config, ttd1Img, ttd2Img, ttd3Img, logoFrontImg);

        if (hasJp && pageOption === "both") {
          const canvas2 = document.createElement("canvas");
          const ctx2 = canvas2.getContext("2d");
          if (!ctx2) throw new Error("Gagal");
          canvas2.width = canvas.width;
          canvas2.height = canvas.height;
          drawJpTablePageOnCanvas(ctx2, canvas2.width, canvas2.height, kegiatan, config, ttd1Img, ttd2Img, ttd3Img, templateJpImg, logoBackImg);

          const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [canvas.width, canvas.height] });
          pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height);
          pdf.addPage();
          pdf.addImage(canvas2.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height);
          pdf.save(`${fileName}.pdf`);
        } else {
          const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [canvas.width, canvas.height] });
          pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height);
          pdf.save(`${fileName}_Depan.pdf`);
        }
      }
    } catch (e: any) {
      alert("Gagal mengunduh: " + e.message);
    }
  };

  const handleDownloadAllAsZip = async (folderName: string, items: KegiatanGuru[], pageOption: "front" | "back" | "both" = "both") => {
    setZipDownloadingId(folderName);
    setZipProgress({ current: 0, total: items.length });

    const config = await getSertifikatConfigAsync();
    const zip = new JSZip();

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

    try {
      await document.fonts.ready;
      const templateImg = new Image();
      templateImg.src = config.templateUrl || "/sertifikat_template.png";
      await new Promise<void>((resolve, reject) => {
        templateImg.onload = () => resolve();
        templateImg.onerror = () => reject(new Error("Gagal memuat template"));
      });

      const ttd1Img = await loadImg(config.ttd1Image);
      const ttd2Img = await loadImg(config.ttd2Image);
      const ttd3Img = await loadImg(config.ttd3Image);
      const templateJpImg = await loadImg(config.templateJpUrl);
      const logoFrontImg = await loadImg(config.logoFrontImage);
      const logoBackImg = await loadImg(config.logoBackImage);

      const canvasWidth = templateImg.naturalWidth || 2000;
      const canvasHeight = templateImg.naturalHeight || 1414;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        setZipProgress({ current: i + 1, total: items.length });

        const canvas = document.createElement("canvas");
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;

        const nameText = item.user_nama || "Guru SMAN 19";
        const safeName = toSentenceCase(nameText).replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");
        const hasJp = config.hasJpPage && config.materiJpRows && config.materiJpRows.length > 0;

        if (pageOption === "back" && hasJp) {
          drawJpTablePageOnCanvas(ctx, canvasWidth, canvasHeight, item, config, ttd1Img, ttd2Img, ttd3Img, templateJpImg, logoBackImg);
          const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [canvasWidth, canvasHeight] });
          pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvasWidth, canvasHeight);
          const pdfOutput = pdf.output("arraybuffer");
          zip.file(`SERTIFIKAT_${safeName}_Belakang.pdf`, pdfOutput);
        } else if (pageOption === "back" && !hasJp) {
          continue;
        } else {
          drawCertificateOnCanvas(ctx, canvasWidth, canvasHeight, templateImg, item, nameText, config, ttd1Img, ttd2Img, ttd3Img, logoFrontImg);

          if (hasJp && pageOption === "both") {
            const canvas2 = document.createElement("canvas");
            canvas2.width = canvasWidth;
            canvas2.height = canvasHeight;
            const ctx2 = canvas2.getContext("2d");
            if (!ctx2) continue;
            drawJpTablePageOnCanvas(ctx2, canvasWidth, canvasHeight, item, config, ttd1Img, ttd2Img, ttd3Img, templateJpImg, logoBackImg);

            const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [canvasWidth, canvasHeight] });
            pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvasWidth, canvasHeight);
            pdf.addPage();
            pdf.addImage(canvas2.toDataURL("image/png"), "PNG", 0, 0, canvasWidth, canvasHeight);
            const pdfOutput = pdf.output("arraybuffer");
            zip.file(`SERTIFIKAT_${safeName}.pdf`, pdfOutput);
          } else {
            const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [canvasWidth, canvasHeight] });
            pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvasWidth, canvasHeight);
            const pdfOutput = pdf.output("arraybuffer");
            zip.file(`SERTIFIKAT_${safeName}_Depan.pdf`, pdfOutput);
          }
        }
      }

      const zipContent = await zip.generateAsync({ type: "blob" });
      const safeFolder = folderName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");
      
      const link = document.createElement("a");
      link.href = URL.createObjectURL(zipContent);
      link.download = `Sertifikat_${safeFolder}.zip`;
      link.click();
    } catch (err: any) {
      alert("Gagal mengunduh ZIP: " + err.message);
    } finally {
      setZipDownloadingId(null);
      setZipProgress(null);
    }
  };

  const [pdfDownloadingId, setPdfDownloadingId] = useState<string | null>(null);
  const [pdfProgress, setPdfProgress] = useState<{ current: number; total: number } | null>(null);

  const handleDownloadAllAsSinglePdf = async (folderName: string, items: KegiatanGuru[], pageOption: "front" | "back" | "both" = "both") => {
    setPdfDownloadingId(folderName);
    setPdfProgress({ current: 0, total: items.length });

    const config = await getSertifikatConfigAsync();

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

    try {
      await document.fonts.ready;
      const templateImg = new Image();
      templateImg.src = config.templateUrl || "/sertifikat_template.png";
      await new Promise<void>((resolve, reject) => {
        templateImg.onload = () => resolve();
        templateImg.onerror = () => reject(new Error("Gagal memuat template"));
      });

      const ttd1Img = await loadImg(config.ttd1Image);
      const ttd2Img = await loadImg(config.ttd2Image);
      const ttd3Img = await loadImg(config.ttd3Image);
      const templateJpImg = await loadImg(config.templateJpUrl);
      const logoFrontImg = await loadImg(config.logoFrontImage);
      const logoBackImg = await loadImg(config.logoBackImage);

      const origW = templateImg.naturalWidth || 2000;
      const origH = templateImg.naturalHeight || 1414;

      const MAX_DIM = 1500;
      const scale = Math.min(1, MAX_DIM / Math.max(origW, origH));
      const canvasWidth = Math.round(origW * scale);
      const canvasHeight = Math.round(origH * scale);

      const hasJp = config.hasJpPage && config.materiJpRows && config.materiJpRows.length > 0;

      let pdf: jsPDF | null = null;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        setPdfProgress({ current: i + 1, total: items.length });

        const canvas = document.createElement("canvas");
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;

        const nameText = item.user_nama || "Guru SMAN 19";
        const hasJp = config.hasJpPage && config.materiJpRows && config.materiJpRows.length > 0;

        if (pageOption === "back" && hasJp) {
          drawJpTablePageOnCanvas(ctx, canvasWidth, canvasHeight, item, config, ttd1Img, ttd2Img, ttd3Img, templateJpImg, logoBackImg);
          const imgData = canvas.toDataURL("image/jpeg", 0.82);
          if (!pdf) {
            pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [canvasWidth, canvasHeight], compress: true });
          } else {
            pdf.addPage([canvasWidth, canvasHeight], "landscape");
          }
          pdf.addImage(imgData, "JPEG", 0, 0, canvasWidth, canvasHeight);
        } else if (pageOption === "back" && !hasJp) {
          continue;
        } else {
          drawCertificateOnCanvas(ctx, canvasWidth, canvasHeight, templateImg, item, nameText, config, ttd1Img, ttd2Img, ttd3Img, logoFrontImg);
          const imgData = canvas.toDataURL("image/jpeg", 0.82);

          if (!pdf) {
            pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [canvasWidth, canvasHeight], compress: true });
          } else {
            pdf.addPage([canvasWidth, canvasHeight], "landscape");
          }
          pdf.addImage(imgData, "JPEG", 0, 0, canvasWidth, canvasHeight);

          if (hasJp && pageOption === "both") {
            const canvas2 = document.createElement("canvas");
            canvas2.width = canvasWidth;
            canvas2.height = canvasHeight;
            const ctx2 = canvas2.getContext("2d");
            if (!ctx2) continue;
            drawJpTablePageOnCanvas(ctx2, canvasWidth, canvasHeight, item, config, ttd1Img, ttd2Img, ttd3Img, templateJpImg, logoBackImg);
            const imgData2 = canvas2.toDataURL("image/jpeg", 0.82);
            pdf.addPage([canvasWidth, canvasHeight], "landscape");
            pdf.addImage(imgData2, "JPEG", 0, 0, canvasWidth, canvasHeight);
          }
        }
      }

      if (pdf) {
        const safeFolder = folderName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");
        pdf.save(`Sertifikat_${safeFolder}_Semua_Guru.pdf`);
      }
    } catch (err: any) {
      alert("Gagal mengunduh PDF gabungan: " + err.message);
    } finally {
      setPdfDownloadingId(null);
      setPdfProgress(null);
    }
  };

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

        <div className="flex bg-brand-100/50 p-1.5 rounded-2xl border border-brand-200/40 self-stretch sm:self-auto">
          <button
            onClick={() => setActiveTab("riwayat")}
            className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer border-0 ${
              activeTab === "riwayat"
                ? "bg-white text-brand-850 shadow-md"
                : "text-brand-500 hover:text-brand-800 bg-transparent"
            }`}
          >
            Riwayat & Terbitkan
          </button>
          <button
            onClick={() => setActiveTab("desainer")}
            className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer border-0 ${
              activeTab === "desainer"
                ? "bg-white text-brand-850 shadow-md"
                : "text-brand-500 hover:text-brand-800 bg-transparent"
            }`}
          >
            Desainer Template
          </button>
        </div>
      </div>

      {/* Progress overlay (ZIP or PDF) */}
      <AnimatePresence>
        {(zipProgress || pdfProgress) && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-brand-950/70 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl space-y-4 border border-brand-100"
            >
              <RefreshCw className="w-10 h-10 animate-spin mx-auto text-brand-600" />
              {pdfProgress ? (
                <>
                  <h4 className="text-sm font-extrabold text-brand-950">Menyiapkan PDF Gabungan</h4>
                  <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                    Merender dan mengompres seluruh sertifikat ke dalam satu file PDF...
                  </p>
                </>
              ) : (
                <>
                  <h4 className="text-sm font-extrabold text-brand-950">Menyiapkan Berkas ZIP</h4>
                  <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                    Sedang memproses dan merender sertifikat untuk seluruh guru penerima kegiatan ini...
                  </p>
                </>
              )}
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden relative">
                <div 
                  className="bg-brand-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${((pdfProgress?.current || zipProgress?.current || 0) / (pdfProgress?.total || zipProgress?.total || 1)) * 100}%` }}
                />
              </div>
              <span className="text-[10px] font-black text-brand-600 block bg-brand-50 py-1.5 px-3 rounded-xl w-fit mx-auto">
                PROSES: {pdfProgress?.current || zipProgress?.current} / {pdfProgress?.total || zipProgress?.total} GURU
              </span>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* TAB 1: RIWAYAT & TERBITKAN SERTIFIKAT */}
      {activeTab === "riwayat" && (
        <>
          {/* Back button if inside folder */}
          {selectedActivityFolder && (
            <button
              onClick={() => {
                setSelectedActivityFolder(null);
                setSearchQuery("");
              }}
              className="flex items-center gap-2 text-xs font-black text-brand-700 hover:text-brand-950 cursor-pointer bg-transparent border-0 self-start"
            >
              <ArrowLeft className="w-4.5 h-4.5" />
              Kembali ke Daftar Kegiatan
            </button>
          )}

          {/* CONTROLS BAR */}
          <div className="bg-white p-5 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-500/50 w-5 h-5" />
              <input
                type="text"
                placeholder={
                  selectedActivityFolder 
                    ? "Cari nama atau email guru penerima..." 
                    : "Cari berdasarkan nama kegiatan..."
                }
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

          {/* FOLDER VIEW (Tampilan Utama Riwayat) */}
          {!selectedActivityFolder && (
            <div className="space-y-6">
              {loadingKegiatan ? (
                <div className="bg-white rounded-3xl p-16 text-center border border-brand-100 shadow-xl shadow-brand-900/5">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto text-brand-500" />
                  <p className="text-xs font-bold text-brand-400 mt-2">Memuat daftar kegiatan...</p>
                </div>
              ) : filteredGroupedActivities.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-slate-50 p-4 rounded-3xl border border-slate-200/50 gap-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedFolders.length === filteredGroupedActivities.length) {
                            setSelectedFolders([]);
                          } else {
                            setSelectedFolders(filteredGroupedActivities.map(f => f.nama_kegiatan));
                          }
                        }}
                        className="px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-700 text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        {selectedFolders.length === filteredGroupedActivities.length ? "Batal Pilih" : "Pilih Semua"}
                      </button>
                      <span className="text-[11px] font-bold text-slate-500">
                        {selectedFolders.length} Folder Terpilih
                      </span>
                    </div>

                    {selectedFolders.length > 0 && (
                      <button
                        type="button"
                        onClick={async () => {
                          const foldersToDelete = filteredGroupedActivities.filter(f => selectedFolders.includes(f.nama_kegiatan));
                          const totalCerts = foldersToDelete.reduce((acc, f) => acc + f.items.length, 0);
                          if (confirm(`Apakah Anda yakin ingin menghapus ${selectedFolders.length} folder terpilih beserta seluruh ${totalCerts} sertifikat di dalamnya secara permanen?`)) {
                            const idsToDelete = foldersToDelete.flatMap(f => f.items.map(item => item.id));
                            try {
                              await deleteKegiatanGuruBulk(idsToDelete);
                              setSelectedFolders([]);
                              refetchKegiatan();
                              setSuccessToast("Berhasil menghapus folder terpilih!");
                              setTimeout(() => setSuccessToast(""), 3000);
                            } catch (err: any) {
                              alert("Gagal menghapus: " + err.message);
                            }
                          }
                        }}
                        className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all cursor-pointer border-0 flex items-center gap-1.5 shadow-sm"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Hapus Folder Terpilih
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredGroupedActivities.map((folder) => (
                      <div
                        key={folder.nama_kegiatan}
                        className="bg-white rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 p-6 hover:scale-[1.01] hover:shadow-2xl transition-all relative overflow-hidden group flex flex-col justify-between"
                      >
                        {/* Folder Icon Decoration */}
                        <div className="absolute top-0 right-0 w-24 h-24 bg-brand-600/5 rounded-full filter blur-xl translate-x-6 -translate-y-6 group-hover:scale-125 transition-transform" />

                        <div className="space-y-4 relative z-10">
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => {
                                  const isSelected = selectedFolders.includes(folder.nama_kegiatan);
                                  if (isSelected) {
                                    setSelectedFolders(prev => prev.filter(f => f !== folder.nama_kegiatan));
                                  } else {
                                    setSelectedFolders(prev => [...prev, folder.nama_kegiatan]);
                                  }
                                }}
                                className="p-1 text-slate-400 hover:text-brand-600 transition-colors cursor-pointer bg-transparent border-0"
                              >
                                {selectedFolders.includes(folder.nama_kegiatan) ? (
                                  <CheckSquare className="w-5 h-5 text-brand-600" />
                                ) : (
                                  <Square className="w-5 h-5" />
                                )}
                              </button>
                              <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center">
                                <Folder className="w-7 h-7" />
                              </div>
                            </div>
                            <span className="text-[10px] font-black uppercase bg-brand-50 text-brand-700 border border-brand-200 px-2.5 py-1 rounded-xl">
                              {folder.items.length} Guru
                            </span>
                          </div>

                          <div className="space-y-1">
                            <h4 
                              onClick={() => {
                                setSelectedActivityFolder(folder.nama_kegiatan);
                                setSearchQuery("");
                              }}
                              className="font-extrabold text-sm text-brand-950 group-hover:text-brand-600 transition-colors line-clamp-2 leading-snug cursor-pointer"
                            >
                              {folder.nama_kegiatan}
                            </h4>
                            <p className="text-[10px] text-slate-400 font-bold">{folder.penyelenggara}</p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-50">
                            <span className="text-[9px] font-bold text-slate-400">
                              {parseDateSafe(folder.tanggal_kegiatan).toLocaleDateString("id-ID", { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                            {folder.isJp && (
                              <span className="text-[9px] font-black uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-lg">
                                JP ({folder.total_jp} JP)
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="pt-5 mt-4 border-t border-slate-50 flex gap-2">
                          <button
                            onClick={() => {
                              setSelectedActivityFolder(folder.nama_kegiatan);
                              setSearchQuery("");
                            }}
                            className="flex-1 py-3 bg-brand-50 hover:bg-brand-100 border border-brand-100 rounded-2xl text-brand-700 text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <FolderOpen className="w-4 h-4" />
                            Buka Folder
                          </button>
                          <div className="flex-1 relative">
                            <button
                              onClick={() => setBulkDownloadMenu(bulkDownloadMenu === `pdf_${folder.nama_kegiatan}` ? null : `pdf_${folder.nama_kegiatan}`)}
                              disabled={pdfDownloadingId !== null || zipDownloadingId !== null}
                              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md disabled:opacity-50"
                            >
                              {pdfDownloadingId === folder.nama_kegiatan ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                              ) : (
                                <Download className="w-4 h-4" />
                              )}
                              PDF
                            </button>
                            {bulkDownloadMenu === `pdf_${folder.nama_kegiatan}` && (
                              <div className="absolute right-0 bottom-full mb-2 bg-white rounded-2xl border border-brand-100 shadow-2xl z-50 py-2 min-w-[160px]">
                                <button onClick={() => { setBulkDownloadMenu(null); handleDownloadAllAsSinglePdf(folder.nama_kegiatan, folder.items, "front"); }} className="w-full px-4 py-2 text-left text-xs font-bold text-brand-800 hover:bg-brand-50 cursor-pointer bg-transparent border-0">Depan Saja</button>
                                <button onClick={() => { setBulkDownloadMenu(null); handleDownloadAllAsSinglePdf(folder.nama_kegiatan, folder.items, "back"); }} className="w-full px-4 py-2 text-left text-xs font-bold text-brand-800 hover:bg-brand-50 cursor-pointer bg-transparent border-0">Belakang Saja</button>
                                <button onClick={() => { setBulkDownloadMenu(null); handleDownloadAllAsSinglePdf(folder.nama_kegiatan, folder.items, "both"); }} className="w-full px-4 py-2 text-left text-xs font-bold text-brand-800 hover:bg-brand-50 cursor-pointer bg-transparent border-0">Lengkap</button>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 relative">
                            <button
                              onClick={() => setBulkDownloadMenu(bulkDownloadMenu === `zip_${folder.nama_kegiatan}` ? null : `zip_${folder.nama_kegiatan}`)}
                              disabled={zipDownloadingId !== null || pdfDownloadingId !== null}
                              className="w-full py-3 bg-brand-600 hover:bg-brand-750 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md disabled:opacity-50"
                            >
                              {zipDownloadingId === folder.nama_kegiatan ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                              ) : (
                                <Download className="w-4 h-4" />
                              )}
                              ZIP
                            </button>
                            {bulkDownloadMenu === `zip_${folder.nama_kegiatan}` && (
                              <div className="absolute right-0 bottom-full mb-2 bg-white rounded-2xl border border-brand-100 shadow-2xl z-50 py-2 min-w-[160px]">
                                <button onClick={() => { setBulkDownloadMenu(null); handleDownloadAllAsZip(folder.nama_kegiatan, folder.items, "front"); }} className="w-full px-4 py-2 text-left text-xs font-bold text-brand-800 hover:bg-brand-50 cursor-pointer bg-transparent border-0">Depan Saja</button>
                                <button onClick={() => { setBulkDownloadMenu(null); handleDownloadAllAsZip(folder.nama_kegiatan, folder.items, "back"); }} className="w-full px-4 py-2 text-left text-xs font-bold text-brand-800 hover:bg-brand-50 cursor-pointer bg-transparent border-0">Belakang Saja</button>
                                <button onClick={() => { setBulkDownloadMenu(null); handleDownloadAllAsZip(folder.nama_kegiatan, folder.items, "both"); }} className="w-full px-4 py-2 text-left text-xs font-bold text-brand-800 hover:bg-brand-50 cursor-pointer bg-transparent border-0">Lengkap</button>
                              </div>
                            )}
                          </div>
                          <button
                            onClick={async () => {
                              if (confirm(`Apakah Anda yakin ingin menghapus folder "${folder.nama_kegiatan}" beserta seluruh ${folder.items.length} sertifikat di dalamnya secara permanen?`)) {
                                const idsToDelete = folder.items.map(item => item.id);
                                try {
                                  await deleteKegiatanGuruBulk(idsToDelete);
                                  refetchKegiatan();
                                  setSuccessToast("Berhasil menghapus folder!");
                                  setTimeout(() => setSuccessToast(""), 3000);
                                } catch (err: any) {
                                  alert("Gagal menghapus: " + err.message);
                                }
                              }
                            }}
                            className="p-3 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-100 rounded-2xl cursor-pointer transition-all flex items-center justify-center"
                            title="Hapus Folder"
                          >
                            <Trash2 className="w-4.5 h-4.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-3xl p-16 text-center border border-brand-100 shadow-xl shadow-brand-900/5 max-w-md mx-auto space-y-3">
                  <Folder className="w-10 h-10 text-brand-300 mx-auto" />
                  <h4 className="text-xs font-black text-brand-500 uppercase tracking-widest">Folder Kosong</h4>
                  <p className="text-[10px] text-brand-400 font-semibold leading-relaxed">
                    Belum ada data sertifikat diterbitkan.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* DETAIL VIEW INSIDE FOLDER */}
          {selectedActivityFolder && (
            <div className="space-y-6">
              <div className="bg-brand-50 p-6 rounded-3xl border border-brand-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <span className="text-[10px] font-black text-brand-500 uppercase tracking-widest block">Folder Kegiatan</span>
                  <h3 className="text-base font-extrabold text-brand-950 leading-snug mt-1">{selectedActivityFolder}</h3>
                  <p className="text-[10.5px] text-slate-500 font-bold mt-1">
                    Total: {folderItems.length} Guru penerima
                  </p>
                </div>
                <div className="flex gap-2">
                  <div className="relative">
                    <button
                      onClick={() => setBulkDownloadMenu(bulkDownloadMenu === `detail_pdf` ? null : "detail_pdf")}
                      disabled={pdfDownloadingId !== null || zipDownloadingId !== null}
                      className="px-5 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
                    >
                      {pdfDownloadingId === selectedActivityFolder ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4.5 h-4.5" />
                      )}
                      PDF
                    </button>
                    {bulkDownloadMenu === "detail_pdf" && (
                      <div className="absolute right-0 bottom-full mb-2 bg-white rounded-2xl border border-brand-100 shadow-2xl z-50 py-2 min-w-[160px]">
                        <button onClick={() => { setBulkDownloadMenu(null); handleDownloadAllAsSinglePdf(selectedActivityFolder, folderItems, "front"); }} className="w-full px-4 py-2 text-left text-xs font-bold text-brand-800 hover:bg-brand-50 cursor-pointer bg-transparent border-0">Depan Saja</button>
                        <button onClick={() => { setBulkDownloadMenu(null); handleDownloadAllAsSinglePdf(selectedActivityFolder, folderItems, "back"); }} className="w-full px-4 py-2 text-left text-xs font-bold text-brand-800 hover:bg-brand-50 cursor-pointer bg-transparent border-0">Belakang Saja</button>
                        <button onClick={() => { setBulkDownloadMenu(null); handleDownloadAllAsSinglePdf(selectedActivityFolder, folderItems, "both"); }} className="w-full px-4 py-2 text-left text-xs font-bold text-brand-800 hover:bg-brand-50 cursor-pointer bg-transparent border-0">Lengkap</button>
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => setBulkDownloadMenu(bulkDownloadMenu === `detail_zip` ? null : "detail_zip")}
                      disabled={zipDownloadingId !== null || pdfDownloadingId !== null}
                      className="px-5 py-3.5 bg-brand-600 hover:bg-brand-750 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
                    >
                      {zipDownloadingId === selectedActivityFolder ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4.5 h-4.5" />
                      )}
                      ZIP
                    </button>
                    {bulkDownloadMenu === "detail_zip" && (
                      <div className="absolute right-0 bottom-full mb-2 bg-white rounded-2xl border border-brand-100 shadow-2xl z-50 py-2 min-w-[160px]">
                        <button onClick={() => { setBulkDownloadMenu(null); handleDownloadAllAsZip(selectedActivityFolder, folderItems, "front"); }} className="w-full px-4 py-2 text-left text-xs font-bold text-brand-800 hover:bg-brand-50 cursor-pointer bg-transparent border-0">Depan Saja</button>
                        <button onClick={() => { setBulkDownloadMenu(null); handleDownloadAllAsZip(selectedActivityFolder, folderItems, "back"); }} className="w-full px-4 py-2 text-left text-xs font-bold text-brand-800 hover:bg-brand-50 cursor-pointer bg-transparent border-0">Belakang Saja</button>
                        <button onClick={() => { setBulkDownloadMenu(null); handleDownloadAllAsZip(selectedActivityFolder, folderItems, "both"); }} className="w-full px-4 py-2 text-left text-xs font-bold text-brand-800 hover:bg-brand-50 cursor-pointer bg-transparent border-0">Lengkap</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* TABLE OF RECIPIENTS */}
              <div className="bg-white rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-semibold text-brand-950">
                    <thead className="bg-brand-50/60 border-b border-brand-100 text-[10px] font-black uppercase text-brand-400 tracking-wider">
                      <tr>
                        <th className="py-4 px-6">No.</th>
                        <th className="py-4 px-6">Guru / Penerima</th>
                        <th className="py-4 px-6">Nomor Sertifikat</th>
                        <th className="py-4 px-6">Peran</th>
                        <th className="py-4 px-6 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-50">
                      {folderItems.length > 0 ? (
                        folderItems.map((row, idx) => (
                          <tr key={row.id} className="hover:bg-brand-50/30 transition-colors">
                            <td className="py-4 px-6 w-12 text-slate-400 font-bold">{idx + 1}</td>
                            <td className="py-4 px-6">
                              <div className="font-bold text-brand-950">{toSentenceCase(row.user_nama)}</div>
                              <div className="text-[10px] text-slate-400">{row.user_email}</div>
                            </td>
                            <td className="py-4 px-6 font-mono text-[10px] text-slate-500">
                              {row.no_sertifikat || "-"}
                            </td>
                            <td className="py-4 px-6">
                              <span className="inline-block px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-[10px] font-black uppercase">
                                {row.peran}
                              </span>
                            </td>
                            <td className="py-4 px-6 text-right">
                              <div className="relative inline-block">
                                <button
                                  onClick={() => setSingleDownloadMenu(singleDownloadMenu === row.id ? null : row.id)}
                                  className="p-2 text-brand-600 hover:bg-brand-50 rounded-xl transition-colors cursor-pointer border-0 bg-transparent"
                                  title="Unduh Sertifikat"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                                {singleDownloadMenu === row.id && (
                                  <div className="absolute right-0 bottom-full mb-2 bg-white rounded-2xl border border-brand-100 shadow-2xl z-50 py-2 min-w-[150px]">
                                    <button onClick={() => { setSingleDownloadMenu(null); handleDownloadSingle(row, "front"); }} className="w-full px-4 py-2 text-left text-xs font-bold text-brand-800 hover:bg-brand-50 cursor-pointer bg-transparent border-0">Depan Saja</button>
                                    <button onClick={() => { setSingleDownloadMenu(null); handleDownloadSingle(row, "back"); }} className="w-full px-4 py-2 text-left text-xs font-bold text-brand-800 hover:bg-brand-50 cursor-pointer bg-transparent border-0">Belakang Saja</button>
                                    <button onClick={() => { setSingleDownloadMenu(null); handleDownloadSingle(row, "both"); }} className="w-full px-4 py-2 text-left text-xs font-bold text-brand-800 hover:bg-brand-50 cursor-pointer bg-transparent border-0">Lengkap</button>
                                  </div>
                                )}
                              </div>
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
                          <td colSpan={5} className="text-center py-12 text-slate-400 font-semibold">
                            Tidak ada data penerima ditemukan.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      {/* TAB 2: DESAINER TEMPLATE & POSISI ELEMEN */}
      {activeTab === "desainer" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT PANEL: UPLOAD, DESKRIPSI & ELEMENT POSITIONS CONTROL (5 COLS) */}
          <div className="lg:col-span-5 space-y-6 order-last lg:order-first">
            {/* Tab Navigation for Sidebar */}
            <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/60 gap-1 shadow-sm flex-wrap">
              <button
                type="button"
                onClick={() => setSidebarTab("konten")}
                className={`flex-1 min-w-[70px] py-2 rounded-xl text-[10px] sm:text-xs font-black transition-all cursor-pointer border-0 flex items-center justify-center gap-1 ${
                  sidebarTab === "konten" ? "bg-white text-brand-950 shadow-sm" : "bg-transparent text-slate-500 hover:text-slate-900"
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Konten
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab("posisi")}
                className={`flex-1 min-w-[70px] py-2 rounded-xl text-[10px] sm:text-xs font-black transition-all cursor-pointer border-0 flex items-center justify-center gap-1 ${
                  sidebarTab === "posisi" ? "bg-white text-brand-950 shadow-sm" : "bg-transparent text-slate-500 hover:text-slate-900"
                }`}
              >
                <Move className="w-3.5 h-3.5" />
                Posisi
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab("jp")}
                className={`flex-1 min-w-[70px] py-2 rounded-xl text-[10px] sm:text-xs font-black transition-all cursor-pointer border-0 flex items-center justify-center gap-1 ${
                  sidebarTab === "jp" ? "bg-white text-brand-950 shadow-sm" : "bg-transparent text-slate-500 hover:text-slate-900"
                }`}
              >
                <Layout className="w-3.5 h-3.5" />
                Hal JP
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab("presets")}
                className={`flex-1 min-w-[70px] py-2 rounded-xl text-[10px] sm:text-xs font-black transition-all cursor-pointer border-0 flex items-center justify-center gap-1 ${
                  sidebarTab === "presets" ? "bg-white text-brand-950 shadow-sm" : "bg-transparent text-slate-500 hover:text-slate-900"
                }`}
              >
                <Award className="w-3.5 h-3.5" />
                Template
              </button>
            </div>

            {sidebarTab === "konten" && (
              <div className="space-y-6 animate-fade-in">
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

              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">
                  Format Tempat & Tanggal Depan:
                </label>
                <input
                  type="text"
                  value={config.tempatTanggalTemplate || ""}
                  onChange={(e) => setConfig(prev => ({ ...prev, tempatTanggalTemplate: e.target.value }))}
                  placeholder="Bandung, {tanggal}"
                  className="w-full p-3 bg-brand-50/30 rounded-2xl border border-brand-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 text-brand-950"
                />
                <p className="text-[9px] text-slate-400 font-medium mt-0.5">
                  Gunakan <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">&#123;tanggal&#125;</code> untuk tanggal kegiatan dinamis.
                </p>
              </div>

              {/* Teks Judul SERTIFIKAT */}
              <div className="space-y-2 pt-3 border-t border-slate-100">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.showSertifikatText}
                    onChange={(e) => setConfig(prev => ({ ...prev, showSertifikatText: e.target.checked }))}
                    className="w-4 h-4 accent-brand-600 rounded cursor-pointer"
                  />
                  <span>Tampilkan Teks Judul "SERTIFIKAT"</span>
                </label>
                {config.showSertifikatText && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase block">Isi Teks Judul:</label>
                    <input
                      type="text"
                      value={config.sertifikatText || ""}
                      onChange={(e) => setConfig(prev => ({ ...prev, sertifikatText: e.target.value }))}
                      placeholder="SERTIFIKAT"
                      className="w-full p-3 bg-brand-50/30 rounded-2xl border border-brand-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 text-brand-950"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* 2. TEMPLATE & JUMLAH TTD SECTION */}
            <div className="bg-white p-5 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 space-y-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-brand-900 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-brand-600" />
                Upload Template, Logo & Jumlah TTD
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

              {/* Upload Logo Depan */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <label className="text-[10.5px] font-bold text-slate-500 block">
                  Logo Halaman Depan
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/png, image/jpeg"
                    onChange={handleLogoFrontUpload}
                    id="upload-logo-front"
                    className="hidden"
                  />
                  <label
                    htmlFor="upload-logo-front"
                    className="px-4 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-250 rounded-2xl text-slate-700 text-xs font-bold flex items-center gap-2 cursor-pointer transition-all flex-1"
                  >
                    <Upload className="w-4 h-4" />
                    Upload Logo Depan
                  </label>
                  {config.logoFrontImage ? (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2.5 py-1 rounded-xl">Ready</span>
                      <button
                        type="button"
                        onClick={() => setConfig(prev => ({ ...prev, logoFrontImage: null }))}
                        className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg border border-rose-100 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-400 font-bold bg-slate-100 px-2.5 py-1 rounded-xl">Kosong</span>
                  )}
                </div>
              </div>

              {/* Upload Logo Belakang */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <label className="text-[10.5px] font-bold text-slate-500 block">
                  Logo Halaman Belakang (JP)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/png, image/jpeg"
                    onChange={handleLogoBackUpload}
                    id="upload-logo-back"
                    className="hidden"
                  />
                  <label
                    htmlFor="upload-logo-back"
                    className="px-4 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-250 rounded-2xl text-slate-700 text-xs font-bold flex items-center gap-2 cursor-pointer transition-all flex-1"
                  >
                    <Upload className="w-4 h-4" />
                    Upload Logo Belakang
                  </label>
                  {config.logoBackImage ? (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2.5 py-1 rounded-xl">Ready</span>
                      <button
                        type="button"
                        onClick={() => setConfig(prev => ({ ...prev, logoBackImage: null }))}
                        className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg border border-rose-100 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-400 font-bold bg-slate-100 px-2.5 py-1 rounded-xl">Kosong</span>
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
                <div className="space-y-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.showJudulLine}
                        onChange={(e) => setConfig(prev => ({ ...prev, showJudulLine: e.target.checked }))}
                        className="w-4 h-4 accent-brand-600 rounded cursor-pointer"
                      />
                      <span>Garis Bawah Nomor/Judul Sertifikat</span>
                    </label>
                    {config.showJudulLine && (
                      <div className="pl-6 space-y-1">
                        <div className="flex justify-between text-[10px] font-bold text-slate-500">
                          <span>Lebar Garis Judul</span>
                          <span className="font-mono text-brand-600">{config.judulLineWidth || 980}px</span>
                        </div>
                        <input
                          type="range"
                          min="200"
                          max="1800"
                          step="10"
                          value={config.judulLineWidth || 980}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setConfig(prev => ({ ...prev, judulLineWidth: val }));
                          }}
                          className="w-full accent-brand-600 cursor-pointer"
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-slate-200/50">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.showNamaLine}
                        onChange={(e) => setConfig(prev => ({ ...prev, showNamaLine: e.target.checked }))}
                        className="w-4 h-4 accent-brand-600 rounded cursor-pointer"
                      />
                      <span>Garis Bawah Kolom Nama</span>
                    </label>
                    {config.showNamaLine && (
                      <div className="pl-6 space-y-1">
                        <div className="flex justify-between text-[10px] font-bold text-slate-500">
                          <span>Lebar Garis Nama</span>
                          <span className="font-mono text-brand-600">{config.namaLineWidth || 1260}px</span>
                        </div>
                        <input
                          type="range"
                          min="200"
                          max="1800"
                          step="10"
                          value={config.namaLineWidth || 1260}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setConfig(prev => ({ ...prev, namaLineWidth: val }));
                          }}
                          className="w-full accent-brand-600 cursor-pointer"
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-slate-200/50">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.showTtdLines}
                        onChange={(e) => setConfig(prev => ({ ...prev, showTtdLines: e.target.checked }))}
                        className="w-4 h-4 accent-brand-600 rounded cursor-pointer"
                      />
                      <span>Garis Bawah Tanda Tangan (TTD)</span>
                    </label>
                    {config.showTtdLines && (
                      <div className="pl-6 space-y-1">
                        <div className="flex justify-between text-[10px] font-bold text-slate-500">
                          <span>Lebar Garis TTD</span>
                          <span className="font-mono text-brand-600">{config.ttdLineWidth || 390}px</span>
                        </div>
                        <input
                          type="range"
                          min="100"
                          max="800"
                          step="10"
                          value={config.ttdLineWidth || 390}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setConfig(prev => ({ ...prev, ttdLineWidth: val }));
                          }}
                          className="w-full accent-brand-600 cursor-pointer"
                        />
                      </div>
                    )}
                  </div>
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
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2.5 py-1 rounded-xl">TTD Ready</span>
                      <button
                        type="button"
                        onClick={() => setConfig(prev => ({ ...prev, ttd1Image: null }))}
                        className="p-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg border border-rose-100 cursor-pointer"
                        title="Hapus gambar TTD 1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
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
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <input
                    type="text"
                    placeholder="Kolom Tambahan 1 (misal: NIP. ...)"
                    value={config.ttd1SubText1 || ""}
                    onChange={(e) => setConfig(prev => ({ ...prev, ttd1SubText1: e.target.value }))}
                    className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold"
                  />
                  <input
                    type="text"
                    placeholder="Kolom Tambahan 2 (opsional)"
                    value={config.ttd1SubText2 || ""}
                    onChange={(e) => setConfig(prev => ({ ...prev, ttd1SubText2: e.target.value }))}
                    className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold"
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
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2.5 py-1 rounded-xl">TTD Ready</span>
                        <button
                          type="button"
                          onClick={() => setConfig(prev => ({ ...prev, ttd2Image: null }))}
                          className="p-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg border border-rose-100 cursor-pointer"
                          title="Hapus gambar TTD 2"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
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
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <input
                      type="text"
                      placeholder="Kolom Tambahan 1 (misal: NIP. ...)"
                      value={config.ttd2SubText1 || ""}
                      onChange={(e) => setConfig(prev => ({ ...prev, ttd2SubText1: e.target.value }))}
                      className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold"
                    />
                    <input
                      type="text"
                      placeholder="Kolom Tambahan 2 (opsional)"
                      value={config.ttd2SubText2 || ""}
                      onChange={(e) => setConfig(prev => ({ ...prev, ttd2SubText2: e.target.value }))}
                      className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold"
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
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2.5 py-1 rounded-xl">TTD Ready</span>
                        <button
                          type="button"
                          onClick={() => setConfig(prev => ({ ...prev, ttd3Image: null }))}
                          className="p-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg border border-rose-100 cursor-pointer"
                          title="Hapus gambar TTD 3"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
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
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <input
                      type="text"
                      placeholder="Kolom Tambahan 1 (misal: NIP. ...)"
                      value={config.ttd3SubText1 || ""}
                      onChange={(e) => setConfig(prev => ({ ...prev, ttd3SubText1: e.target.value }))}
                      className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold"
                    />
                    <input
                      type="text"
                      placeholder="Kolom Tambahan 2 (opsional)"
                      value={config.ttd3SubText2 || ""}
                      onChange={(e) => setConfig(prev => ({ ...prev, ttd3SubText2: e.target.value }))}
                      className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

          {sidebarTab === "posisi" && (
            <div className="space-y-6 animate-fade-in">
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
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedElement(val);
                    const isJpElement = ["jpHeaderTitlePos", "jpHeaderSubtitlePos", "jpHeaderSub2Pos", "jpTanggalPos", "jpTtd", "jpTtdJabatanPos", "logoBackPos"].includes(val);
                    if (isJpElement) {
                      setDesainerPage(2);
                    } else {
                      setDesainerPage(1);
                    }
                  }}
                  className="w-full p-3 bg-brand-50 rounded-2xl border border-brand-200 text-xs font-bold text-brand-950 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="sertifikatTitlePos">Teks Judul "SERTIFIKAT"</option>
                  <option value="logoFrontPos">Logo Halaman Depan</option>
                  {config.hasJpPage && <option value="logoBackPos">Logo Halaman Belakang (JP)</option>}
                  <option value="namaGuru">Nama Guru / Peserta</option>
                  <option value="prefixNama">Label "Diberikan kepada:"</option>
                  <option value="noSertifikat">Nomor Surat Sertifikat</option>
                  <option value="deskripsi">Deskripsi & Peran Kegiatan</option>
                  <option value="tanggalKegiatan">Halaman Depan: Tempat & Tanggal</option>
                  <option value="ttd1">TTD 1 - Posisi Grup (Gambar & Nama)</option>
                  <option value="ttd1JabatanPos">TTD 1 - Posisi Jabatan</option>
                  {config.jumlahTtd >= 2 && (
                    <>
                      <option value="ttd2">TTD 2 - Posisi Grup (Gambar & Nama)</option>
                      <option value="ttd2JabatanPos">TTD 2 - Posisi Jabatan</option>
                    </>
                  )}
                  {config.jumlahTtd === 3 && (
                    <>
                      <option value="ttd3">TTD 3 - Posisi Grup (Gambar & Nama)</option>
                      <option value="ttd3JabatanPos">TTD 3 - Posisi Jabatan</option>
                    </>
                  )}
                  {config.hasJpPage && (
                    <>
                      <option value="jpHeaderTitlePos">Halaman Belakang: Judul JP</option>
                      <option value="jpHeaderSubtitlePos">Halaman Belakang: Subjudul JP</option>
                      <option value="jpHeaderSub2Pos">Halaman Belakang: Instansi JP</option>
                      <option value="jpTanggalPos">Halaman Belakang: Tempat & Tanggal</option>
                      <option value="jpTtd">Halaman Belakang: TTD Grup (Gambar & Nama)</option>
                      <option value="jpTtdJabatanPos">Halaman Belakang: TTD Posisi Jabatan</option>
                    </>
                  )}
                </select>
              </div>

              {/* Slider Posisi X & Y */}
              {!["ttd1", "ttd2", "ttd3", "jpTtd"].includes(selectedElement) ? (
                (() => {
                  const elemKey = selectedElement as keyof typeof config.positions;
                  const elemPos = (config.positions as any)[elemKey] || (DEFAULT_SERTIFIKAT_CONFIG.positions as any)[elemKey];
                  if (!elemPos) return null;

                  const isLogo = elemKey === "logoFrontPos" || elemKey === "logoBackPos";

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

                      {isLogo ? (
                        /* Ukuran Lebar Gambar Logo */
                        <div>
                          <div className="flex justify-between text-[11px] font-bold text-slate-600">
                            <span>Lebar Gambar Logo (%)</span>
                            <span className="font-mono text-brand-600">{elemPos.widthPercent}%</span>
                          </div>
                          <input
                            type="range"
                            min="2"
                            max="50"
                            step="0.5"
                            value={elemPos.widthPercent}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setConfig(prev => ({
                                ...prev,
                                positions: {
                                  ...prev.positions,
                                  [elemKey]: { ...elemPos, widthPercent: val }
                                }
                              }));
                            }}
                            className="w-full accent-brand-600 cursor-pointer"
                          />
                        </div>
                      ) : (
                        <>
                          {/* Font Family (Gaya Font) Dropdown - Hanya untuk Teks */}
                          <div>
                            <label className="text-[10.5px] font-bold text-slate-500 block mb-1">Gaya Font (Font Family)</label>
                            <select
                              value={elemPos.fontFamily || "sans-serif"}
                              onChange={(e) => {
                                setConfig(prev => ({
                                  ...prev,
                                  positions: {
                                    ...prev.positions,
                                    [elemKey]: { ...elemPos, fontFamily: e.target.value }
                                  }
                                }));
                              }}
                              className="w-full p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-brand-950 focus:outline-none focus:ring-1 focus:ring-brand-500"
                            >
                              <option value="sans-serif">Sans-serif (Standard)</option>
                              <option value="serif">Serif (Standard)</option>
                              <option value="monospace">Monospace (Standard)</option>
                              <option value="'Cinzel', serif">Cinzel (Elegant Classic)</option>
                              <option value="'Playfair Display', serif">Playfair Display (Serif Premium)</option>
                              <option value="'Montserrat', sans-serif">Montserrat (Modern Bold)</option>
                              <option value="'Great Vibes', cursive">Great Vibes (Calligraphy)</option>
                              <option value="'Alex Brush', cursive">Alex Brush (Cursive Handwriting)</option>
                              <option value="'Parisienne', cursive">Parisienne (Cursive Elegant)</option>
                              <option value="'Dancing Script', cursive">Dancing Script (Handwritten)</option>
                              <option value="'Cormorant Garamond', serif">Cormorant Garamond (Formal Serif)</option>
                            </select>
                          </div>

                          {/* Ukuran Font & Warna */}
                          <div className="grid grid-cols-2 gap-3 pt-2">
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 block">Ukuran Font (px)</label>
                              <input
                                type="number"
                                min="10"
                                max="250"
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

                          {/* Jarak Spasi Baris / Line Height & Jarak Spasi Kata */}
                          <div className="pt-2 border-t border-slate-100 space-y-3">
                            <div>
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

                            <div>
                              <div className="flex justify-between text-[11px] font-bold text-slate-600">
                                <span>Jarak Spasi Kata (Word Spacing)</span>
                                <span className="font-mono text-brand-600">{(elemPos.wordSpacingMultiplier || 1.0).toFixed(2)}x</span>
                              </div>
                              <input
                                type="range"
                                min="0.5"
                                max="3.0"
                                step="0.05"
                                value={elemPos.wordSpacingMultiplier || 1.0}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  setConfig(prev => ({
                                    ...prev,
                                    positions: {
                                      ...prev.positions,
                                      [elemKey]: { ...elemPos, wordSpacingMultiplier: val }
                                    }
                                  }));
                                }}
                                className="w-full accent-brand-600 cursor-pointer"
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()
              ) : (
                (() => {
                  const isJpTtd = selectedElement === "jpTtd";
                  const ttdNum = isJpTtd ? "Halaman Belakang (JP)" : (selectedElement === "ttd1" ? "1" : selectedElement === "ttd2" ? "2" : "3");
                  const posKey = isJpTtd ? "jpTtdNamaPos" : `ttd${ttdNum}NamaPos`;
                  const jabKey = isJpTtd ? "jpTtdJabatanPos" : `ttd${ttdNum}JabatanPos`;
                  const s1Key = isJpTtd ? "jpTtdSubText1Pos" : `ttd${ttdNum}SubText1Pos`;
                  const s2Key = isJpTtd ? "jpTtdSubText2Pos" : `ttd${ttdNum}SubText2Pos`;
                  const imgPosKey = isJpTtd ? "jpTtdImagePos" : `ttd${ttdNum}ImagePos`;

                  const elemPos = (config.positions as any)[posKey] || (DEFAULT_SERTIFIKAT_CONFIG.positions as any)[posKey];
                  const imgPos = (config.positions as any)[imgPosKey] || (DEFAULT_SERTIFIKAT_CONFIG.positions as any)[imgPosKey];
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
                                [s1Key]: { ...(prev.positions as any)[s1Key], xPercent: val },
                                [s2Key]: { ...(prev.positions as any)[s2Key], xPercent: val },
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
                                [s1Key]: { ...(prev.positions as any)[s1Key], yPercent: val + 6 },
                                [s2Key]: { ...(prev.positions as any)[s2Key], yPercent: val + 9 },
                                [imgPosKey]: { ...imgPos, yPercent: val - 11.5 }
                              }
                            }));
                          }}
                          className="w-full accent-brand-600 cursor-pointer"
                        />
                      </div>

                      {/* Ukuran Font TTD & Sub-Kolom */}
                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 block">Font Nama TTD (px)</label>
                          <input
                            type="number"
                            min="10"
                            max="60"
                            value={elemPos.fontSize}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 24;
                              setConfig(prev => ({
                                ...prev,
                                positions: {
                                  ...prev.positions,
                                  [posKey]: { ...elemPos, fontSize: val }
                                }
                              }));
                            }}
                            className="w-full p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-center"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-500 block">Font Jabatan TTD (px)</label>
                          <input
                            type="number"
                            min="10"
                            max="60"
                            value={(config.positions as any)[jabKey].fontSize}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 18;
                              setConfig(prev => ({
                                ...prev,
                                positions: {
                                  ...prev.positions,
                                  [jabKey]: { ...(prev.positions as any)[jabKey], fontSize: val }
                                }
                              }));
                            }}
                            className="w-full p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-center"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 block">Font Tambahan 1 (px)</label>
                          <input
                            type="number"
                            min="10"
                            max="60"
                            value={(config.positions as any)[s1Key].fontSize}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 18;
                              setConfig(prev => ({
                                ...prev,
                                positions: {
                                  ...prev.positions,
                                  [s1Key]: { ...(prev.positions as any)[s1Key], fontSize: val }
                                }
                              }));
                            }}
                            className="w-full p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-center"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-500 block">Font Tambahan 2 (px)</label>
                          <input
                            type="number"
                            min="10"
                            max="60"
                            value={(config.positions as any)[s2Key].fontSize}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 18;
                              setConfig(prev => ({
                                ...prev,
                                positions: {
                                  ...prev.positions,
                                  [s2Key]: { ...(prev.positions as any)[s2Key], fontSize: val }
                                }
                              }));
                            }}
                            className="w-full p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-center"
                          />
                        </div>
                      </div>

                      {/* Warna Teks TTD */}
                      <div className="pt-2 border-t border-slate-100">
                        <label className="text-[10px] font-bold text-slate-500 block">Warna Teks TTD</label>
                        <div className="flex items-center gap-2 mt-1">
                          <input
                            type="color"
                            value={elemPos.color || "#1e1b4b"}
                            onChange={(e) => {
                              const val = e.target.value;
                              setConfig(prev => ({
                                ...prev,
                                positions: {
                                  ...prev.positions,
                                  [posKey]: { ...elemPos, color: val },
                                  [jabKey]: { ...(prev.positions as any)[jabKey], color: val },
                                  [s1Key]: { ...(prev.positions as any)[s1Key], color: val },
                                  [s2Key]: { ...(prev.positions as any)[s2Key], color: val }
                                }
                              }));
                            }}
                            className="w-8 h-9 bg-transparent border-0 cursor-pointer rounded"
                          />
                          <span className="text-[11px] font-mono text-slate-600 uppercase font-bold">{elemPos.color || "#1e1b4b"}</span>
                        </div>
                      </div>

                      {/* Image Specific Sizers & Offset positions */}
                      <div className="pt-3 border-t border-slate-100 space-y-3">
                        <label className="text-[10px] font-black uppercase text-brand-600 tracking-wider block">
                          Format Gambar TTD {ttdNum}:
                        </label>
                        <div>
                          <div className="flex justify-between text-[11px] font-bold text-slate-600">
                            <span>Lebar Gambar TTD (%)</span>
                            <span className="font-mono text-brand-600">{imgPos.widthPercent}%</span>
                          </div>
                          <input
                            type="range"
                            min="3"
                            max="30"
                            step="0.5"
                            value={imgPos.widthPercent}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setConfig(prev => ({
                                ...prev,
                                positions: {
                                  ...prev.positions,
                                  [imgPosKey]: { ...imgPos, widthPercent: val }
                                }
                              }));
                            }}
                            className="w-full accent-brand-600 cursor-pointer"
                          />
                        </div>

                        <div>
                          <div className="flex justify-between text-[11px] font-bold text-slate-600">
                            <span>Posisi Vertikal Gambar (Y %)</span>
                            <span className="font-mono text-brand-600">{imgPos.yPercent}%</span>
                          </div>
                          <input
                            type="range"
                            min="40"
                            max="98"
                            step="0.2"
                            value={imgPos.yPercent}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setConfig(prev => ({
                                ...prev,
                                positions: {
                                  ...prev.positions,
                                  [imgPosKey]: { ...imgPos, yPercent: val }
                                }
                              }));
                            }}
                            className="w-full accent-brand-600 cursor-pointer"
                          />
                        </div>

                        <div>
                          <div className="flex justify-between text-[11px] font-bold text-slate-600">
                            <span>Posisi Horizontal Gambar (X %)</span>
                            <span className="font-mono text-brand-600">{imgPos.xPercent}%</span>
                          </div>
                          <input
                            type="range"
                            min="5"
                            max="95"
                            step="0.2"
                            value={imgPos.xPercent}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setConfig(prev => ({
                                ...prev,
                                positions: {
                                  ...prev.positions,
                                  [imgPosKey]: { ...imgPos, xPercent: val }
                                }
                              }));
                            }}
                            className="w-full accent-brand-600 cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        )}

          {sidebarTab === "jp" && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white p-5 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-brand-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-brand-600" />
                  Konfigurasi Halaman Belakang (JP)
                </h3>

                <label className="flex items-center gap-2.5 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.hasJpPage || false}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setConfig(prev => ({ ...prev, hasJpPage: checked }));
                      if (!checked) setDesainerPage(1);
                    }}
                    className="w-4 h-4 accent-brand-600 rounded cursor-pointer"
                  />
                  <span>Aktifkan Halaman Belakang (JP)</span>
                </label>

                {config.hasJpPage && (
                  <div className="space-y-4 bg-slate-50 p-4 rounded-2xl border border-slate-200 animate-fade-in">
                    {/* Input Edit Judul/Teks Atas Halaman 2 */}
                    <div className="space-y-3 pb-2 border-b border-slate-200/50">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase block">Judul Halaman belakang:</label>
                        <input
                          type="text"
                          value={config.jpHeaderTitle || ""}
                          onChange={(e) => setConfig(prev => ({ ...prev, jpHeaderTitle: e.target.value }))}
                          placeholder="STRUKTUR PROGRAM DAN MATERI PELATIHAN"
                          className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-slate-200 text-xs font-semibold text-brand-950 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase block">Subjudul (Baris 2):</label>
                        <input
                          type="text"
                          value={config.jpHeaderSubtitle || ""}
                          onChange={(e) => setConfig(prev => ({ ...prev, jpHeaderSubtitle: e.target.value }))}
                          placeholder="Gunakan {nama_kegiatan} untuk nama kegiatan dinamis"
                          className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-slate-200 text-xs font-semibold text-brand-950 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase block">Keterangan / Instansi (Baris 3):</label>
                        <input
                          type="text"
                          value={config.jpHeaderSub2 || ""}
                          onChange={(e) => setConfig(prev => ({ ...prev, jpHeaderSub2: e.target.value }))}
                          placeholder="Gunakan {penyelenggara} untuk penyelenggara dinamis"
                          className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-slate-200 text-xs font-semibold text-brand-950 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase block">Format Tempat & Tanggal Belakang:</label>
                        <input
                          type="text"
                          value={config.tempatTanggalJpTemplate || ""}
                          onChange={(e) => setConfig(prev => ({ ...prev, tempatTanggalJpTemplate: e.target.value }))}
                          placeholder="Bandung, {tanggal}"
                          className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-slate-200 text-xs font-semibold text-brand-950 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                      </div>
                    </div>

                    {/* Upload Background Halaman Belakang */}
                    <div className="space-y-1.5">
                      <label className="text-[10.5px] font-black text-slate-500 uppercase block">Background Halaman 2 (Kustom):</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="file"
                          accept="image/png, image/jpeg"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              const optimizedUrl = await optimizeImageDataUrl(file, 2000);
                              const newConfig = { ...config, templateJpUrl: optimizedUrl };
                              setConfig(newConfig);
                              await saveSertifikatConfigAsync(newConfig);
                              setSuccessMsg("Background Halaman Belakang berhasil disimpan!");
                              setTimeout(() => setSuccessMsg(null), 3000);
                            } catch (err: any) {
                              alert("Gagal mengunggah background: " + err.message);
                            }
                          }}
                          id="upload-template-jp-bg"
                          className="hidden"
                        />
                        <label
                          htmlFor="upload-template-jp-bg"
                          className="px-4 py-2.5 bg-brand-50 hover:bg-brand-100 border border-brand-100 rounded-xl text-brand-700 text-xs font-bold flex items-center gap-2 cursor-pointer transition-all flex-1"
                        >
                          <Upload className="w-4 h-4" />
                          Ganti Bg Halaman 2
                        </label>
                        {config.templateJpUrl && (
                          <button
                            type="button"
                            onClick={async () => {
                              const newConfig = { ...config, templateJpUrl: null };
                              setConfig(newConfig);
                              await saveSertifikatConfigAsync(newConfig);
                            }}
                            className="p-2.5 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 border border-rose-100 cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Form Input Materi JP */}
                    <div className="space-y-3 pt-2 border-t border-slate-200/50">
                      <div className="flex justify-between items-center">
                        <label className="text-[10.5px] font-black text-slate-500 uppercase">Daftar Materi & Durasi (JP):</label>
                        <button
                          type="button"
                          onClick={() => {
                            const newRows = [...(config.materiJpRows || [])];
                            newRows.push({ materi: "Materi Pelatihan Baru", jp: 4 });
                            setConfig(prev => ({ ...prev, materiJpRows: newRows }));
                          }}
                          className="px-2.5 py-1 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-lg text-[10px] font-black uppercase cursor-pointer border border-brand-150"
                        >
                          + Tambah Baris
                        </button>
                      </div>

                      <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                        {(config.materiJpRows || []).map((row, idx) => (
                          <div key={idx} className="flex gap-2 items-center bg-white p-2 rounded-xl border border-slate-200 shadow-xs">
                            <input
                              type="text"
                              value={row.materi}
                              onChange={(e) => {
                                const newRows = [...(config.materiJpRows || [])];
                                newRows[idx].materi = e.target.value;
                                setConfig(prev => ({ ...prev, materiJpRows: newRows }));
                              }}
                              placeholder="Nama materi/topik..."
                              className="flex-1 px-2.5 py-1.5 bg-slate-50 rounded-lg border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-brand-500 focus:bg-white text-brand-950"
                            />
                            <input
                              type="number"
                              value={row.jp}
                              onChange={(e) => {
                                const newRows = [...(config.materiJpRows || [])];
                                newRows[idx].jp = parseInt(e.target.value) || 0;
                                setConfig(prev => ({ ...prev, materiJpRows: newRows }));
                              }}
                              className="w-16 px-2.5 py-1.5 bg-slate-50 rounded-lg border border-slate-200 text-xs font-bold text-center focus:outline-none focus:ring-1 focus:ring-brand-500 focus:bg-white text-brand-950"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const newRows = (config.materiJpRows || []).filter((_, i) => i !== idx);
                                setConfig(prev => ({ ...prev, materiJpRows: newRows }));
                              }}
                              className="p-1.5 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 border border-transparent cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="bg-brand-50 p-2.5 rounded-xl border border-brand-100 flex justify-between items-center text-xs font-bold text-brand-900">
                        <span>Total Jam Pelajaran:</span>
                        <span className="font-mono bg-white px-2 py-0.5 rounded-lg border border-brand-200">
                          {(config.materiJpRows || []).reduce((acc, curr) => acc + (Number(curr.jp) || 0), 0)} JP
                        </span>
                      </div>
                    </div>

                    {/* Kustomisasi Ukuran & Tata Letak Tabel JP */}
                    <div className="space-y-3 pt-3 border-t border-slate-200/50">
                      <label className="text-[10.5px] font-black text-slate-500 uppercase block">Pengaturan Dimensi & Posisi Tabel:</label>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                            <span>Lebar Tabel (px)</span>
                            <span className="font-mono text-brand-600">{config.jpTableWidth || 1700}px</span>
                          </div>
                          <input
                            type="range"
                            min="400"
                            max="1950"
                            step="10"
                            value={config.jpTableWidth || 1700}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              setConfig(prev => ({ ...prev, jpTableWidth: val }));
                            }}
                            className="w-full accent-brand-600 cursor-pointer"
                          />
                        </div>

                        <div>
                          <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                            <span>Posisi Vertikal Y (px)</span>
                            <span className="font-mono text-brand-600">{config.jpTableY || 270}px</span>
                          </div>
                          <input
                            type="range"
                            min="150"
                            max="700"
                            step="5"
                            value={config.jpTableY || 270}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              setConfig(prev => ({ ...prev, jpTableY: val }));
                            }}
                            className="w-full accent-brand-600 cursor-pointer"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                            <span>Font Tabel (px)</span>
                            <span className="font-mono text-brand-600">{config.jpTableFontSize || 18}px</span>
                          </div>
                          <input
                            type="range"
                            min="8"
                            max="80"
                            step="1"
                            value={config.jpTableFontSize || 18}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              setConfig(prev => ({ ...prev, jpTableFontSize: val }));
                            }}
                            className="w-full accent-brand-600 cursor-pointer"
                          />
                        </div>

                        <div>
                          <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                            <span>Tinggi Baris / Tabel (px)</span>
                            <span className="font-mono text-brand-600">{config.jpTableRowPaddingY || 24}px</span>
                          </div>
                          <input
                            type="range"
                            min="4"
                            max="120"
                            step="2"
                            value={config.jpTableRowPaddingY || 24}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              setConfig(prev => ({ ...prev, jpTableRowPaddingY: val }));
                            }}
                            className="w-full accent-brand-600 cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {sidebarTab === "presets" && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white p-5 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 space-y-4">
                <div>
                  <h3 className="text-xs font-black text-brand-950 uppercase tracking-wider">Template Presets (Maks 10)</h3>
                  <p className="text-[10px] text-slate-400 font-semibold leading-relaxed mt-1">
                    Simpan kreasi desain sertifikat Anda ke salah satu slot di bawah agar dapat digunakan kembali nanti tanpa perlu mengatur ulang posisi dari awal.
                  </p>
                </div>

                <div className="space-y-3">
                  {Array.from({ length: 10 }).map((_, index) => {
                    const presetId = `preset_${index + 1}`;
                    const preset = presets.find(p => p.id === presetId);

                    return (
                      <div
                        key={presetId}
                        className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                          preset
                            ? "bg-brand-50/30 border-brand-100"
                            : "bg-slate-50/50 border-slate-100 border-dashed"
                        }`}
                      >
                        <div className="space-y-1 min-w-0">
                          <span className="text-[9px] font-bold text-slate-400 block">Slot {index + 1}</span>
                          <span className={`text-[11px] font-bold truncate block ${preset ? "text-brand-950" : "text-slate-400 italic"}`}>
                            {preset ? preset.config.templateName : "Slot Kosong"}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {preset ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setConfig(preset.config);
                                  saveSertifikatConfigAsync(preset.config);
                                  setSuccessToast("Berhasil menerapkan template!");
                                  setTimeout(() => setSuccessToast(""), 3000);
                                }}
                                className="px-2.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-[10px] font-black uppercase cursor-pointer transition-all flex items-center gap-1 shadow-sm border-0"
                              >
                                Gunakan
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (confirm(`Apakah Anda yakin ingin menghapus template "${preset.config.templateName}" dari Slot ${index + 1}?`)) {
                                    await deleteSertifikatPresetAsync(presetId);
                                    loadPresets();
                                  }
                                }}
                                className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl cursor-pointer border-0 transition-all flex items-center justify-center"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setPresetSlotToSave(presetId);
                                setPresetNameInput("");
                                setPresetModalOpen(true);
                              }}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase cursor-pointer transition-all border-0 flex items-center gap-1"
                            >
                              <Plus className="w-3 h-3" />
                              Simpan Desain
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* SAVE / RESET BUTTONS */}
          <div className="bg-white p-5 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleResetConfig}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset Default
                </button>

                <button
                  type="button"
                  onClick={handleSaveConfig}
                  className="px-5 py-2.5 brand-gradient text-white rounded-2xl text-xs font-black flex items-center gap-2 cursor-pointer shadow-md transition-all hover:scale-[1.02]"
                >
                  <Save className="w-4 h-4" />
                  Simpan Desain Template
                </button>
              </div>
            </div>

          {/* RIGHT PANEL: LIVE INTERACTIVE CANVAS PREVIEW (7 COLS) */}
          <div className="lg:col-span-7 lg:sticky lg:top-6 lg:self-start bg-slate-950 p-6 rounded-3xl border border-slate-800 shadow-2xl flex flex-col items-center justify-center relative min-h-[450px] order-first lg:order-last">
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

            {config.hasJpPage && (
              <div className="flex gap-2 bg-slate-900/95 p-1.5 rounded-2xl border border-slate-800 shadow-lg mt-14 mb-2 z-10 self-center">
                <button
                  type="button"
                  onClick={() => setDesainerPage(1)}
                  className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer border-0 ${
                    desainerPage === 1 ? "bg-brand-600 text-white shadow-md" : "text-slate-400 hover:text-white bg-transparent"
                  }`}
                >
                  Halaman 1 (Depan)
                </button>
                <button
                  type="button"
                  onClick={() => setDesainerPage(2)}
                  className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer border-0 ${
                    desainerPage === 2 ? "bg-brand-600 text-white shadow-md" : "text-slate-400 hover:text-white bg-transparent"
                  }`}
                >
                  Halaman 2 (Tabel JP)
                </button>
              </div>
            )}

            <div className={`w-full h-full flex items-center justify-center ${config.hasJpPage ? 'pt-2' : 'pt-8'}`}>
              <canvas
                ref={canvasRef}
                onClick={handleCanvasClick}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onTouchStart={handleCanvasTouchStart}
                onTouchMove={handleCanvasTouchMove}
                onTouchEnd={handleCanvasTouchEnd}
                className="w-full h-auto max-h-[65vh] object-contain rounded-2xl shadow-2xl border border-slate-800 cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-brand-500 transition-all select-none touch-none"
                title="Seret/drag elemen langsung untuk mengubah posisinya"
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
                Pilih Penerima Sertifikat *
              </label>
              <span className="text-[10px] font-extrabold bg-brand-600 text-white px-2.5 py-0.5 rounded-xl">
                {selectedTeacherIds.length} / {teachers.length} Terpilih
              </span>
            </div>

            {/* Filter Role Pills */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {([
                { key: "semua", label: "Semua", count: teachers.length },
                { key: "guru", label: "Guru", count: teachers.filter(t => t.role === "guru").length },
                { key: "tata_usaha", label: "Tata Usaha", count: teachers.filter(t => t.role === "tata_usaha").length },
                { key: "murid", label: "Murid", count: teachers.filter(t => t.role === "murid" || t.role === "siswa").length },
              ] as const).map(({ key, label, count }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    // For murid, we filter on both "murid" and "siswa" role values
                    setRoleFilter(key === "murid" ? "murid" : key as any);
                    setTeacherSearchQuery("");
                  }}
                  className={`px-2.5 py-1 rounded-xl text-[10px] font-black border transition-all cursor-pointer ${
                    (key === "murid" ? (roleFilter === "murid" || roleFilter === "siswa") : roleFilter === key)
                      ? "bg-brand-600 text-white border-brand-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-brand-400"
                  }`}
                >
                  {label} ({count})
                </button>
              ))}
            </div>

            {/* Header Checkbox: Pilih Semua (dari filter aktif) */}
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
                <span>Pilih Semua yang Tampil ({filteredTeachersInModal.length})</span>
              </button>
            </div>

            {/* Filter Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
              <input
                type="text"
                placeholder="Cari nama atau email..."
                value={teacherSearchQuery}
                onChange={(e) => setTeacherSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white rounded-xl border border-brand-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            {/* Recipient List Checkboxes */}
            <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100">
              {loadingTeachers ? (
                <p className="text-center py-4 text-xs text-slate-400">Memuat data penerima...</p>
              ) : filteredTeachersInModal.length > 0 ? (
                filteredTeachersInModal.map((t) => {
                  const isChecked = selectedTeacherIds.includes(t.id);
                  const roleLabel = t.role === "guru" ? "Guru"
                    : t.role === "tata_usaha" ? "TU"
                    : "Murid";
                  const roleBg = t.role === "guru" ? "bg-blue-50 text-blue-700 border-blue-100"
                    : t.role === "tata_usaha" ? "bg-amber-50 text-amber-700 border-amber-100"
                    : "bg-emerald-50 text-emerald-700 border-emerald-100";
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
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg border shrink-0 ml-2 ${roleBg}`}>
                        {roleLabel}
                      </span>
                    </label>
                  );
                })
              ) : (
                <p className="text-center py-4 text-xs text-slate-400">Tidak ada penerima ditemukan.</p>
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

          {/* Note informing about JP settings */}
          {config.hasJpPage && (
            <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-2xl text-[10.5px] font-semibold">
              ℹ️ Sertifikat ini otomatis diterbitkan dengan <strong>Halaman Belakang (Detail JP)</strong> yang telah dikonfigurasi di menu desainer template.
            </div>
          )}

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

      {/* MODAL SIMPAN PRESET TEMPLATE */}
      <ModalPortal
        isOpen={presetModalOpen}
        onClose={() => setPresetModalOpen(false)}
        title="Simpan Template Desain"
        icon={Award}
        maxWidth="max-w-md"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!presetNameInput.trim()) {
              alert("Isi nama template terlebih dahulu!");
              return;
            }
            await saveSertifikatPresetAsync(presetSlotToSave, config, presetNameInput);
            setPresetModalOpen(false);
            loadPresets();
            setSuccessToast("Template berhasil disimpan!");
            setTimeout(() => setSuccessToast(""), 3000);
          }}
          className="space-y-4"
        >
          <div className="space-y-1">
            <label className="text-[10px] font-black text-brand-400 uppercase tracking-widest block">
              Nama Template / Desain *
            </label>
            <input
              type="text"
              placeholder="Contoh: Template Kegiatan KBM / Bimtek Merdeka"
              value={presetNameInput}
              onChange={(e) => setPresetNameInput(e.target.value)}
              required
              className="w-full p-3 bg-brand-50/40 rounded-2xl border border-brand-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 text-brand-950"
            />
          </div>

          <div className="pt-4 border-t border-brand-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setPresetModalOpen(false)}
              className="px-4 py-2.5 rounded-2xl hover:bg-brand-200/40 text-brand-600 font-bold text-xs transition-all cursor-pointer bg-transparent border-0"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-2xl brand-gradient text-white font-bold text-xs shadow-md transition-all cursor-pointer border-0"
            >
              Simpan Template
            </button>
          </div>
        </form>
      </ModalPortal>

      {/* Toast Notification */}
      <AnimatePresence>
        {successToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-6 right-6 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 z-[9999] border border-emerald-500/20"
          >
            <Check className="w-4 h-4" />
            <span className="text-xs font-black uppercase tracking-wider">{successToast}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
