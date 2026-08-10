import React, { Suspense, useRef, useState, lazy } from 'react';
import { AppState, Student, ClassEntity, getCurrentSchoolName } from '../types';
import { compareClassName } from '../constants';
import { Button, Card, Input, Modal, MultiSelect, ConfirmModal } from '../components/UI';
import { addStudent, importStudents, deleteStudent, addClass, deleteClassCascade, setActiveClassId } from '../services/db';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Upload, Trash2, QrCode, Search, User, Download, FileSpreadsheet, FileDown, IdCard, Loader2, BookOpen, ArrowLeft, ScanFace, ImagePlus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { processImageFile, deleteFaceEmbedding } from '../services/face';

const FaceEnrollment = lazy(() => import('../components/face/FaceEnrollment').then(m => ({ default: m.default })));

const LazyQRCodeCanvas = lazy(() => 
  import('qrcode.react').then((module) => ({ default: module.QRCodeCanvas }))
);

const saveBlob = async (blob: Blob, filename: string) => {
  const { saveAs } = await import('file-saver');
  saveAs(blob, filename);
};

const downloadXlsx = async (workbook: { xlsx: { writeBuffer: () => Promise<ArrayBuffer | Uint8Array> } }, filename: string) => {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  await saveBlob(blob, filename);
};

const readXlsxToJson = async (file: File) => {
  const ExcelJS = (await import('exceljs')).default;
  const buf = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell: any, colNumber: number) => {
    const v = (cell.value ?? '').toString().trim();
    headers[colNumber - 1] = v;
  });

  const rows: any[] = [];
  ws.eachRow((row: any, rowNumber: number) => {
    if (rowNumber === 1) return;
    const rowData: any = {};
    row.eachCell((cell: any, colNumber: number) => {
      rowData[headers[colNumber - 1]] = cell.value;
    });
    rows.push(rowData);
  });

  return rows;
};

const hasFaceEmbeddingLocal = (studentId: string): boolean => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(`face_embedding_${studentId}`) !== null;
};

interface Props {
  state: AppState;
  refresh: () => void;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

export const Students: React.FC<Props> = ({ state, refresh, notify }) => {
  const currentSchoolIndex = state.teacher?.currentSchoolIndex ?? 0;
  const schoolClasses = state.classes.filter(c => (c.schoolIndex ?? 0) === currentSchoolIndex);
  const sortedClasses = [...schoolClasses].sort((a, b) => compareClassName(a.name, b.name));
  // Global Active Class - only from current school
  const activeClass = schoolClasses.find(c => c.id === state.activeClassId);

  // --- STATE FOR CLASS MANAGEMENT (Used when activeClass is null) ---
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassSubject, setNewClassSubject] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // --- STATE FOR STUDENT MANAGEMENT (Used when activeClass is present) ---
  const [activeTab, setActiveTab] = useState<'list' | 'add'>('list');
  const [newName, setNewName] = useState('');
  const [search, setSearch] = useState('');
  const [selectedQR, setSelectedQR] = useState<Student | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Delete State
  const [deleteTarget, setDeleteTarget] = useState<{id: string, type: 'class'|'student', name?: string} | null>(null);
  const [faceDeleteTarget, setFaceDeleteTarget] = useState<Student | null>(null);

  // Face Registration State
  const [faceEnrollmentStudent, setFaceEnrollmentStudent] = useState<Student | null>(null);
  const [showFaceEnrollment, setShowFaceEnrollment] = useState(false);
  const [uploadingFace, setUploadingFace] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');

  // Student Detail Popup
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [showStudentPopup, setShowStudentPopup] = useState(false);

  // Handle individual photo upload for face enrollment
  const handlePhotoUpload = async (student: Student, file: File) => {
    if (!file.type.startsWith('image/')) {
      notify('File harus berupa gambar', 'error');
      return;
    }

    setUploadingFace(true);
    setUploadProgress('Memproses foto...');

    try {
      setUploadProgress('Mendeteksi wajah...');
      const descriptor = await processImageFile(file);

      if (!descriptor) {
        notify('Wajah tidak terdeteksi. Pastikan: 1) Wajah terlihat jelas, 2) Ukuran wajah cukup besar (minimal 1/4 foto), 3) Hindari foto dari WhatsApp (akan diperkecil).', 'error');
        setUploadingFace(false);
        setUploadProgress('');
        return;
      }

      setUploadProgress('Menyimpan data wajah...');
      const embeddingStr = Array.from(descriptor).join(',');
      
      const { getSupabaseClient } = await import('../services/supabase');
      const supabase = getSupabaseClient();
      
      const { error } = await supabase
        .from('students')
        .update({ face_embedding: embeddingStr })
        .eq('id', student.id);

      if (error) throw error;

      notify(`Wajah ${student.name} berhasil didaftarkan!`, 'success');
      refresh();
    } catch (error: any) {
      console.error('Error uploading face:', error);
      notify('Gagal menyimpan wajah: ' + (error?.message || 'Unknown error'), 'error');
    } finally {
      setUploadingFace(false);
      setUploadProgress('');
    }
  };

  // Handle delete face data
  const handleDeleteFace = async (student: Student) => {
    setFaceDeleteTarget(student);
  };

  const handleConfirmDeleteFace = async () => {
    if (!faceDeleteTarget) return;
    
    const result = await deleteFaceEmbedding(faceDeleteTarget.id);
    setFaceDeleteTarget(null);
    if (result.success) {
      notify('Data wajah dihapus', 'success');
      refresh();
    } else {
      notify(result.message, 'error');
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filtered Students for Active Class
  const students = state.students.filter(s => s.classId === state.activeClassId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const filteredStudents = students.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

  // Combine subjects for Class Creation
  const availableSubjects = state.teacher ? [...state.teacher.subjects, ...state.teacher.customSubjects] : [];
  const uniqueSubjects = Array.from(new Set(availableSubjects));

  // --- CLASS ACTIONS ---

  const handleAddClass = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newClassName.trim() || newClassSubject.length === 0) return;
    setLoading(true);
    const cls: ClassEntity = {
      id: uuidv4(),
      name: newClassName,
      subject: newClassSubject[0],
      schoolIndex: state.teacher?.currentSchoolIndex ?? 0,
      createdAt: new Date().toISOString()
    };
    await addClass(cls);
    setNewClassName('');
    setNewClassSubject([]);
    setIsClassModalOpen(false);
    setLoading(false);
    refresh();
    notify("Kelas berhasil dibuat");
  };

  const handleConfirmDelete = async () => {
      if (!deleteTarget) return;

      if (deleteTarget.type === 'class') {
          await deleteClassCascade(deleteTarget.id);
          notify("Kelas dan seluruh datanya berhasil dihapus");
      } else {
          await deleteStudent(deleteTarget.id);
          notify("Siswa berhasil dihapus");
      }
      refresh();
      setDeleteTarget(null);
  };

  const handleSelectClass = (id: string) => {
    setActiveClassId(id);
    refresh();
  };

  const handleBackToClasses = () => {
      setActiveClassId(null);
      refresh();
  }

  const handleOpenFaceEnrollment = (student: Student) => {
    setFaceEnrollmentStudent(student);
    setShowFaceEnrollment(true);
  };

  const handleStudentClick = (student: Student) => {
    setSelectedStudent(student);
    setShowStudentPopup(true);
  };

  const handleFaceEnrollSuccess = (studentId: string) => {
    setShowFaceEnrollment(false);
    setFaceEnrollmentStudent(null);
    // Trigger refresh to get updated face data
    refresh();
    notify('Wajah berhasil didaftarkan!');
  };

  // --- STUDENT ACTIONS ---

  const handleAdd = async (e?: React.FormEvent) => {
    if(e) e.preventDefault();
    if (!activeClass || !newName.trim()) return;
    await addStudent({
      id: uuidv4(),
      classId: activeClass.id,
      name: newName.trim(),
      createdAt: new Date().toISOString()
    });
    setNewName('');
    refresh();
    notify("Siswa ditambahkan");
  };

  const processImportData = async (data: any[]) => {
      const newStudents: Student[] = [];
      let successCount = 0;
      let failCount = 0;

      data.forEach((row: any) => {
          const normalizedRow: any = {};
          Object.keys(row).forEach(key => {
              normalizedRow[key.toLowerCase().trim()] = row[key];
          });

          const name = normalizedRow['nama'] || 
                       normalizedRow['nama siswa'] || 
                       normalizedRow['nama lengkap'] || 
                       normalizedRow['name'] ||
                       normalizedRow['student name'];

          if (name && typeof name === 'string' && name.trim().length > 0) {
              if (!newStudents.find(s => s.name.toLowerCase() === name.trim().toLowerCase())) {
                  newStudents.push({
                      id: uuidv4(),
                      classId: activeClass!.id,
                      name: name.trim(),
                      createdAt: new Date().toISOString()
                  });
                  successCount++;
              }
          } else {
              if (Object.keys(row).length > 0) failCount++; 
          }
      });

      if (newStudents.length > 0) {
          await importStudents(newStudents);
          refresh();
          notify(`Berhasil impor ${successCount} siswa.`);
      } else {
          notify('Tidak ada data valid yang ditemukan.', 'error');
      }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeClass) return;

    const fileExt = file.name.split('.').pop()?.toLowerCase();

    if (fileExt === 'xlsx') {
      readXlsxToJson(file)
        .then((jsonData) => processImportData(jsonData))
        .catch((err) => {
          console.error(err);
          notify("Gagal membaca file Excel.", "error");
        });
  }
  else if (fileExt === 'xls') {
      notify("Format .xls tidak didukung. Silakan simpan ulang sebagai .xlsx.", "error");
  }
else if (fileExt === 'csv') {
        const Papa = (await import('papaparse')).default;
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: async (results: any) => {
             await processImportData(results.data);
          }
        });
    } else {
        notify("Format file tidak didukung.", "error");
    }
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDownloadTemplate = async () => {
    if (!activeClass) return;
    const ExcelJS = (await import('exceljs')).default;
    const data = [
      { 'No': 1, 'Nama Lengkap': 'Budi Santoso', 'NIS/NISN': '12345 (Opsional)', 'L/P': 'L' },
      { 'No': 2, 'Nama Lengkap': 'Siti Aminah', 'NIS/NISN': '12346', 'L/P': 'P' },
      { 'No': 3, 'Nama Lengkap': 'Masukkan Nama Disini...', 'NIS/NISN': '', 'L/P': '' }
    ];
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Template Siswa");

    ws.columns = [
      { header: 'No', key: 'No', width: 5 },
      { header: 'Nama Lengkap', key: 'Nama Lengkap', width: 30 },
      { header: 'NIS/NISN', key: 'NIS/NISN', width: 15 },
      { header: 'L/P', key: 'L/P', width: 5 }
    ];

    data.forEach((r) => ws.addRow(r));
    ws.getRow(1).font = { bold: true };

    const fileName = `Template_Import_Siswa_${activeClass.name.replace(/\s+/g, '_')}.xlsx`;
    await downloadXlsx(wb, fileName);
  };

  const downloadQR = () => {
    const canvas = document.getElementById('qr-canvas') as HTMLCanvasElement;
    if(canvas && selectedQR) {
      const pngUrl = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.href = pngUrl;
      downloadLink.download = `QR_${selectedQR.name}.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      notify("QR Code berhasil diunduh");
    }
  };

  // --- HELPER: Draw Rounded Rect ---
  const drawRoundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  // --- CARD GENERATION LOGIC (PORTRAIT & AESTHETIC) ---
  const generateStudentCardCanvas = async (student: Student): Promise<HTMLCanvasElement> => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx || !activeClass) throw new Error("Canvas Error");

    const width = 640; 
    const height = 1011; 
    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    const grd = ctx.createLinearGradient(0, 0, width, 0);
    grd.addColorStop(0, "#059669"); // Emerald 600
    grd.addColorStop(1, "#10b981"); // Emerald 500
    
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(width, 0);
    ctx.lineTo(width, 280);
    ctx.bezierCurveTo(width, 280, width / 2, 360, 0, 280); 
    ctx.lineTo(0, 0);
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    for(let i=0; i<width; i+=40) {
        for(let j=0; j<300; j+=40) {
            ctx.beginPath();
            ctx.arc(i, j, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    ctx.font = "bold 18px 'Plus Jakarta Sans', sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.fillText("KARTU ABSENSI SISWA", 30, 60);

    const mapelText = activeClass.subject;
    ctx.font = "bold 20px 'Plus Jakarta Sans', sans-serif";
    const mapelMetrics = ctx.measureText(mapelText);
    const mapelW = mapelMetrics.width + 40; 
    const mapelH = 44;
    const mapelX = width - mapelW - 30; // 30px from right
    const mapelY = 30; // 30px from top

    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    drawRoundedRect(ctx, mapelX, mapelY, mapelW, mapelH, 22);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(mapelText, mapelX + (mapelW/2), mapelY + 29);

    const schoolName = getCurrentSchoolName(state.teacher) || "SEKOLAH";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "bold 32px 'Plus Jakarta Sans', sans-serif";
    ctx.fillText(schoolName.toUpperCase(), width / 2, 135);

    const qrBoxSize = 360;
    const qrBoxX = (width - qrBoxSize) / 2;
    const qrBoxY = 180; 

    ctx.shadowColor = "rgba(0, 0, 0, 0.15)";
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 15;
    
    ctx.fillStyle = "#ffffff";
    drawRoundedRect(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 40);
    ctx.fill();
    
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    try {
        const QRCode = (await import('qrcode')).default;
        const qrSize = 280;
        const qrPadding = (qrBoxSize - qrSize) / 2;
        
        const qrDataUrl = await QRCode.toDataURL(`ABSEN:${student.id}`, { 
            width: qrSize, 
            margin: 0,
            color: {
                dark: '#1f2937', 
                light: '#ffffff'
            }
        });
        const qrImg = new Image();
        qrImg.src = qrDataUrl;
        await new Promise(r => qrImg.onload = r);
        
        ctx.drawImage(qrImg, qrBoxX + qrPadding, qrBoxY + qrPadding, qrSize, qrSize);
    } catch (e) {
        console.error("QR Gen Error", e);
    }

    const textStartY = qrBoxY + qrBoxSize + 80;
    
    ctx.fillStyle = "#111827"; 
    ctx.font = "bold 44px 'Plus Jakarta Sans', sans-serif";
    
    let fontSize = 44;
    let nameWidth = ctx.measureText(student.name).width;
    const maxTextWidth = width - 100; 
    
    while (nameWidth > maxTextWidth && fontSize > 20) {
        fontSize -= 2;
        ctx.font = `bold ${fontSize}px 'Plus Jakarta Sans', sans-serif`;
        nameWidth = ctx.measureText(student.name).width;
    }
    
    ctx.fillText(student.name, width / 2, textStartY);

    const classText = activeClass.name;
    ctx.font = "bold 24px 'Plus Jakarta Sans', sans-serif";
    const classWidth = ctx.measureText(classText).width + 60;
    
    ctx.fillStyle = "#ecfdf5"; 
    const badgeH = 50;
    drawRoundedRect(ctx, (width - classWidth)/2, textStartY + 30, classWidth, badgeH, 25);
    ctx.fill();
    
    ctx.strokeStyle = "#10b981"; 
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#059669"; 
    ctx.fillText(classText, width / 2, textStartY + 63);

    ctx.strokeStyle = "#f3f4f6"; 
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(80, height - 120);
    ctx.lineTo(width - 80, height - 120);
    ctx.stroke();

    const year = state.teacher?.schoolYear || "";
    const shortId = student.id.split('-')[0].toUpperCase();

    ctx.textAlign = "center";
    ctx.fillStyle = "#9ca3af"; 
    ctx.font = "500 16px 'Plus Jakarta Sans', sans-serif";
    
    ctx.fillText("ID SISWA", width / 2 - 120, height - 80);
    ctx.fillText("TAHUN AJARAN", width / 2 + 120, height - 80);

    ctx.fillStyle = "#374151"; 
    ctx.font = "bold 20px 'Plus Jakarta Sans', sans-serif";
    
    ctx.fillText(shortId, width / 2 - 120, height - 50);
    ctx.fillText(year, width / 2 + 120, height - 50);

    ctx.fillStyle = "#10b981";
    ctx.fillRect(0, height - 15, width, 15);

    return canvas;
  };

  const handleDownloadSingleCard = async (student: Student) => {
    setIsGenerating(true);
    try {
        const canvas = await generateStudentCardCanvas(student);
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `KARTU_${student.name.replace(/\s+/g, '_')}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        notify(`Kartu ${student.name} berhasil diunduh`);
    } catch (e) {
        notify("Gagal membuat kartu siswa.", "error");
    } finally {
        setIsGenerating(false);
    }
  };

  const handleDownloadBulkCards = async () => {
    if (students.length === 0) return;
    if (!confirm(`Generate kartu untuk ${students.length} siswa? Proses mungkin memakan waktu.`)) return;
    
    setIsGenerating(true);
    try {
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();
        const folder = zip.folder(`KARTU_${activeClass?.name}`);

        for (const student of students) {
            const canvas = await generateStudentCardCanvas(student);
            const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
            if (blob && folder) {
                folder.file(`${student.name.replace(/\s+/g, '_')}.png`, blob);
            }
        }

        const content = await zip.generateAsync({ type: "blob" });
        const objectUrl = URL.createObjectURL(content);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = `KARTU_KELAS_${activeClass?.name}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);
        notify("Kartu massal berhasil diunduh (ZIP)");
    } catch (e) {
        console.error(e);
        notify("Gagal generate kartu massal.", "error");
    } finally {
        setIsGenerating(false);
    }
  };

  // === VIEW 1: CLASS LIST (When NO Class is Active) ===
  if (!activeClass) {
      return (
          <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">Manajemen Kelas</h1>
                    <p className="text-gray-500 text-sm mt-1">Pilih kelas untuk mengelola data siswa</p>
                  </div>
                  <Button onClick={() => setIsClassModalOpen(true)} className="!px-5 !py-2.5 rounded-xl shadow-lg shadow-emerald-200/50">
                    <Plus className="w-5 h-5 mr-2" /> Kelas Baru
                  </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                <AnimatePresence>
                {sortedClasses.length === 0 && (
                  <motion.div initial={{opacity: 0}} animate={{opacity: 1}} className="col-span-full text-center py-16 text-gray-400 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
                    <div className="mb-2 font-medium">Belum ada kelas di sekolah ini.</div>
                    <Button variant="ghost" onClick={() => setIsClassModalOpen(true)}>+ Tambah Sekarang</Button>
                  </motion.div>
                )}
                {sortedClasses.map(c => {
                  const studentCount = state.students.filter(s => s.classId === c.id).length;
                  return (
                    <Card key={c.id} onClick={() => handleSelectClass(c.id)} className="relative group cursor-pointer hover:shadow-lg transition-all h-full border-gray-100 hover:border-emerald-300">
                      <div className="p-6 flex flex-col justify-between h-full min-h-[160px]">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                              <BookOpen className="w-6 h-6" />
                            </div>
                            <div>
                              <h3 className="font-bold text-gray-900 text-xl leading-tight line-clamp-1">{c.name}</h3>
                              <p className="text-sm text-gray-500 mt-1 line-clamp-1 font-medium">{c.subject}</p>
                            </div>
                          </div>
                        </div>
                        
                        <div className="mt-6 flex items-center justify-between">
                          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-lg">
                            {studentCount} Siswa
                          </span>
                          <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget({ id: c.id, type: 'class', name: c.name });
                            }}
                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors z-10"
                            title="Hapus Kelas"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
                </AnimatePresence>
              </div>

              {/* CREATE CLASS MODAL */}
              <Modal isOpen={isClassModalOpen} onClose={() => setIsClassModalOpen(false)} title="Buat Kelas Baru">
                <form onSubmit={handleAddClass} className="flex flex-col gap-6">
                  <Input 
                    label="Nama Kelas" 
                    placeholder="Contoh: X IPA 1" 
                    value={newClassName}
                    onChange={e => setNewClassName(e.target.value)}
                    autoFocus
                  />
                  <MultiSelect 
                    label="Mata Pelajaran"
                    options={uniqueSubjects}
                    selected={newClassSubject}
                    onChange={setNewClassSubject}
                    single={true}
                    placeholder="Pilih mapel..."
                  />
                  <Button type="submit" isLoading={loading} disabled={!newClassName || newClassSubject.length === 0}>
                    Simpan Kelas
                  </Button>
                </form>
              </Modal>

              <ConfirmModal 
                  isOpen={!!deleteTarget && deleteTarget.type === 'class'}
                  onClose={() => setDeleteTarget(null)}
                  onConfirm={handleConfirmDelete}
                  title={`Hapus Kelas ${deleteTarget?.name}?`}
                  description="SEMUA DATA SISWA & ABSENSI PADA KELAS INI AKAN HILANG PERMANEN. Tindakan ini tidak dapat dibatalkan."
              />
          </div>
      );
  }

  // === VIEW 2: STUDENT LIST (When Class IS Active) ===
  return (
    <div className="p-6">
      {/* Header Info - Responsive Style */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
         <div className="flex flex-col gap-2">
            <button 
                onClick={handleBackToClasses}
                className="flex items-center text-gray-400 hover:text-emerald-600 text-xs font-bold uppercase tracking-wider transition-colors w-fit"
            >
                <ArrowLeft className="w-4 h-4 mr-1" /> Kembali ke Daftar Kelas
            </button>
            <div className="bg-emerald-600 p-6 rounded-3xl text-white shadow-lg w-full md:w-auto md:min-w-[300px] relative overflow-hidden">
                <div className="relative z-10">
                <div className="opacity-80 text-sm font-medium mb-1">{state.teacher?.schoolYear}</div>
                <h1 className="text-3xl font-bold">{activeClass.name}</h1>
                <p className="opacity-90 mt-1">{activeClass.subject}</p>
                </div>
                <div className="absolute right-0 top-0 w-32 h-32 bg-white opacity-10 rounded-full -mr-10 -mt-10" />
            </div>
         </div>
         
         <div className="flex md:flex-col gap-2 md:items-end">
            <div className="bg-white px-5 py-3 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-3">
                <div className="bg-emerald-50 p-2 rounded-lg text-emerald-600">
                    <User className="w-5 h-5" />
                </div>
                <div>
                   <span className="block text-xs text-gray-400 font-bold uppercase">Total Siswa</span>
                   <span className="block font-bold text-xl text-gray-900 leading-none">{students.length}</span>
                </div>
            </div>
            {/* BULK DOWNLOAD BUTTON */}
            {students.length > 0 && (activeTab === 'list' || window.innerWidth >= 1024) && (
                <Button 
                    onClick={handleDownloadBulkCards} 
                    disabled={isGenerating}
                    variant="secondary"
                    className="!px-4 !py-2.5 !text-xs !rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200 font-bold"
                >
                    {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <IdCard className="w-4 h-4 mr-2" />}
                    Unduh Semua Kartu (ZIP)
                </Button>
            )}
         </div>
      </div>

      {/* MOBILE TABS (Hidden on Desktop) */}
      <div className="flex lg:hidden gap-2 mb-6 bg-gray-100 p-1 rounded-2xl max-w-md md:max-w-xs">
        <button 
          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${activeTab === 'list' ? 'bg-white shadow text-emerald-600' : 'text-gray-500'}`}
          onClick={() => setActiveTab('list')}
        >
          Daftar Siswa
        </button>
        <button 
          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${activeTab === 'add' ? 'bg-white shadow text-emerald-600' : 'text-gray-500'}`}
          onClick={() => setActiveTab('add')}
        >
          Input / Impor
        </button>
      </div>

      {/* CONTENT AREA */}
      <div className="flex flex-col lg:flex-row gap-8">
        
        {/* LEFT COLUMN: LIST (Always visible on Desktop) */}
        <div className={`flex-1 flex flex-col gap-4 ${(activeTab === 'list' || window.innerWidth >= 1024) ? 'block' : 'hidden'}`}>
            <div className="relative w-full">
                <Search className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
                <Input 
                    placeholder="Cari nama siswa..." 
                    className="!pl-12 !py-3 w-full"
                    value={search} 
                    onChange={e => setSearch(e.target.value)} 
                />
            </div>

            {/* MOBILE VIEW: CARDS */}
            <div className="md:hidden grid grid-cols-1 gap-3">
                {filteredStudents.length === 0 && <div className="text-center text-gray-400 py-10">Tidak ada siswa.</div>}
                {filteredStudents.map(s => (
                <motion.div layout key={s.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between cursor-pointer" onClick={() => handleStudentClick(s)}>
                    <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 shrink-0">
                        <User className="w-5 h-5" />
                    </div>
                    <span className="font-semibold text-gray-800 line-clamp-1">{s.name}</span>
                    {(s.face_embedding || hasFaceEmbeddingLocal(s.id)) && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Wajah</span>
                    )}
                    </div>
                </motion.div>
                ))}
            </div>

            {/* DESKTOP VIEW: TABLE */}
            <div className="hidden md:block bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden flex-1">
                <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 text-gray-500 text-sm font-medium border-b border-gray-200">
                    <tr>
                    <th className="p-5 font-semibold w-20 text-center">No</th>
                    <th className="p-5 font-semibold">Nama Siswa</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {filteredStudents.length === 0 && (
                    <tr>
                        <td colSpan={2} className="p-10 text-center text-gray-400">Tidak ada data siswa.</td>
                    </tr>
                    )}
                    {filteredStudents.map((s, idx) => (
                    <tr key={s.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => handleStudentClick(s)}>
                        <td className="p-5 text-center text-gray-400 text-sm font-medium">{idx + 1}</td>
                        <td className="p-5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-800 text-base">{s.name}</span>
                            {(s.face_embedding || hasFaceEmbeddingLocal(s.id)) && (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Wajah</span>
                            )}
                          </div>
                        </td>
                    </tr>
                    ))}
                </tbody>
                </table>
            </div>
        </div>

        {/* RIGHT COLUMN: ADD/IMPORT (Visible on Desktop as Sticky Panel) */}
        <div className={`w-full lg:w-[350px] shrink-0 ${(activeTab === 'add' || window.innerWidth >= 1024) ? 'block' : 'hidden'}`}>
             <div className="lg:sticky lg:top-8">
                <div className="flex flex-col gap-6">
                   <Card className="p-6 md:p-6 bg-white border border-gray-100 shadow-sm">
                      <h3 className="font-bold text-gray-900 mb-4 text-lg">Input Manual</h3>
                      <form onSubmit={handleAdd} className="flex flex-col gap-3">
                         <Input 
                           placeholder="Nama Siswa Lengkap" 
                           value={newName} 
                           onChange={e => setNewName(e.target.value)} 
                           className="w-full"
                         />
                         <Button type="submit" disabled={!newName} className="w-full justify-center"><Plus className="w-5 h-5 mr-2" /> Tambah Siswa</Button>
                      </form>
                   </Card>

                   <div className="flex items-center gap-4 py-2">
                     <div className="h-px bg-gray-200 flex-1" />
                     <span className="text-gray-400 text-xs font-bold tracking-widest">ATAU IMPOR</span>
                     <div className="h-px bg-gray-200 flex-1" />
                   </div>

                   <Card className="p-6 md:p-6 border-dashed border-2 border-emerald-100 shadow-none hover:bg-emerald-50/30 transition-colors bg-white">
                     <div className="flex flex-col gap-4 items-center text-center">
                        <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
                           <FileSpreadsheet className="w-7 h-7" />
                        </div>
                        <div>
                           <h3 className="font-bold text-gray-900 mb-1">Impor Excel / CSV</h3>
                           <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                             Gunakan file Excel (.xlsx) dengan kolom header <strong>"Nama Lengkap"</strong>.
                           </p>
                           
                           <div className="flex flex-col gap-2 w-full">
                              <Button variant="outline" onClick={handleDownloadTemplate} className="text-xs !py-2 w-full justify-center">
                                 <FileDown className="w-4 h-4 mr-2" /> Download Template
                              </Button>
                              
                              <input 
                                type="file" 
                                accept=".xlsx, .csv" 
                                ref={fileInputRef} 
                                onChange={handleImport} 
                                className="hidden" 
                              />
                              <Button onClick={() => fileInputRef.current?.click()} className="text-xs !py-2 w-full justify-center">
                                 <Upload className="w-4 h-4 mr-2" /> Pilih File Excel
                              </Button>
                           </div>
                        </div>
                     </div>
                   </Card>
              </div>
             </div>
        </div>

      </div>

      {/* QR MODAL */}
      <Modal isOpen={!!selectedQR} onClose={() => setSelectedQR(null)} title="QR Code Siswa">
        {selectedQR && (
          <div className="flex flex-col items-center gap-6 p-4">
            <div className="bg-white p-6 rounded-3xl shadow-lg border border-gray-100">
              <Suspense fallback={<div className="w-[220px] h-[220px] animate-pulse rounded-2xl bg-gray-100" />}>
                <LazyQRCodeCanvas 
                  id="qr-canvas"
                  value={`ABSEN:${selectedQR.id}`} 
                  size={220} 
                  level="H" 
                  includeMargin={true}
                />
              </Suspense>
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900">{selectedQR.name}</h2>
              <p className="text-emerald-600 font-medium mt-1">{activeClass.name}</p>
              <p className="text-gray-400 text-xs mt-2 font-mono">ID: {selectedQR.id}</p>
            </div>
            <div className="flex gap-3 w-full">
              <Button variant="secondary" onClick={() => handleDownloadSingleCard(selectedQR)} className="flex-1">
                 <IdCard className="w-5 h-5 mr-2" /> Kartu
              </Button>
              <Button onClick={downloadQR} className="flex-1">
                <Download className="w-5 h-5 mr-2" /> QR PNG
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal 
        isOpen={!!deleteTarget && deleteTarget.type === 'student'}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title={`Hapus Siswa ${deleteTarget?.name}?`}
        description="Data absensi siswa ini akan ikut terhapus. Lanjutkan?"
      />

      <ConfirmModal 
        isOpen={!!faceDeleteTarget}
        onClose={() => setFaceDeleteTarget(null)}
        onConfirm={handleConfirmDeleteFace}
        title={`Hapus Data Wajah ${faceDeleteTarget?.name}?`}
        description="Siswa perlu daftar wajah ulang untuk absensi. Lanjutkan?"
        confirmText="Hapus"
        variant="danger"
      />

      {/* Face Enrollment Modal */}
      <Modal 
        isOpen={showFaceEnrollment} 
        onClose={() => {
          setShowFaceEnrollment(false);
          setFaceEnrollmentStudent(null);
        }}
        title=""
      >
        {faceEnrollmentStudent && (
          <FaceEnrollment
            studentId={faceEnrollmentStudent.id}
            studentName={faceEnrollmentStudent.name}
            hasFaceData={!!faceEnrollmentStudent.face_embedding}
            onEnrollSuccess={handleFaceEnrollSuccess}
            onCancel={() => {
              setShowFaceEnrollment(false);
              setFaceEnrollmentStudent(null);
            }}
          />
        )}
      </Modal>

      {/* STUDENT POPUP MODAL */}
      <Modal isOpen={showStudentPopup} onClose={() => setShowStudentPopup(false)} title={selectedStudent?.name || 'Detail Siswa'} size="md">
        {selectedStudent && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                <User className="w-8 h-8" />
              </div>
              <div>
                <h3 className="font-bold text-xl text-gray-900">{selectedStudent.name}</h3>
                <p className="text-sm text-gray-500 font-mono">{selectedStudent.id}</p>
                {(selectedStudent.face_embedding || hasFaceEmbeddingLocal(selectedStudent.id)) && (
                  <span className="inline-block mt-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✅ Data Wajah Tersedia</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Face Actions */}
              <button
                onClick={() => {
                  setShowStudentPopup(false);
                  setTimeout(() => handleOpenFaceEnrollment(selectedStudent), 100);
                }}
                className="p-4 bg-purple-50 text-purple-600 rounded-xl hover:bg-purple-100 flex flex-col items-center gap-2 transition-colors"
              >
                <ScanFace className="w-6 h-6" />
                <span className="text-sm font-medium">Daftar Wajah</span>
              </button>
              
              {(selectedStudent.face_embedding || hasFaceEmbeddingLocal(selectedStudent.id)) && (
                <button
                  onClick={() => {
                    setShowStudentPopup(false);
                    setTimeout(() => handleDeleteFace(selectedStudent), 100);
                  }}
                  className="p-4 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 flex flex-col items-center gap-2 transition-colors"
                >
                  <X className="w-6 h-6" />
                  <span className="text-sm font-medium">Hapus Wajah</span>
                </button>
              )}

              {/* QR Code */}
              <button
                onClick={() => {
                  setShowStudentPopup(false);
                  setSelectedQR(selectedStudent);
                }}
                className="p-4 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 flex flex-col items-center gap-2 transition-colors"
              >
                <QrCode className="w-6 h-6" />
                <span className="text-sm font-medium">Lihat QR</span>
              </button>

              {/* Download Card */}
              <button
                onClick={() => {
                  setShowStudentPopup(false);
                  handleDownloadSingleCard(selectedStudent);
                }}
                className="p-4 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 flex flex-col items-center gap-2 transition-colors"
              >
                <IdCard className="w-6 h-6" />
                <span className="text-sm font-medium">Kartu Siswa</span>
              </button>

              {/* Delete */}
              <button
                onClick={() => {
                  setShowStudentPopup(false);
                  setDeleteTarget({ id: selectedStudent.id, type: 'student', name: selectedStudent.name });
                }}
                className="col-span-2 p-4 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 flex items-center justify-center gap-2 transition-colors"
              >
                <Trash2 className="w-6 h-6" />
                <span className="text-sm font-medium">Hapus Siswa</span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
