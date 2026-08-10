import React, { useState, useEffect } from 'react';
import { AppState, AttendanceSession, AttendanceRecord, AttendanceStatus } from '../types';
import { compareClassName } from '../constants';
import { Button, Card, ConfirmModal, Modal, Input } from '../components/UI';
import { upsertRecord, deleteSession } from '../services/db';
import { ChevronDown, Calendar, FolderArchive, Users, FileText, Trash2, FileSpreadsheet, Save, Download } from 'lucide-react';
import { REKAP_AKHIR_TEMPLATE_B64, REKAP_PERTEMUAN_TEMPLATE_B64 } from '../assets/templates/embeddedTemplates';
import { motion, AnimatePresence } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid';


const formatExportDate = (d: Date) => {
  // Indonesian date style similar to the Tauri version
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

const saveBlob = async (blob: Blob, filename: string) => {
  const { saveAs } = await import('file-saver');
  saveAs(blob, filename);
};

const downloadXlsx = async (workbook: any, filename: string) => {
  const buf = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  await saveBlob(blob, filename);
};


export interface RecapProps {
  state: AppState;
  refresh: () => any;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

export const Recap: React.FC<RecapProps> = ({ state, refresh, notify }) => {
  const currentSchoolIndex = state.teacher?.currentSchoolIndex ?? 0;
  const schoolClasses = state.classes.filter(c => (c.schoolIndex ?? 0) === currentSchoolIndex);
  const schoolClassIds = new Set(schoolClasses.map(c => c.id));
  
  const [selectedClassId, setSelectedClassId] = useState<string>('all'); // 'all' | classId
  const [tab, setTab] = useState<'siswa' | 'pertemuan'>('siswa');
  const [studentSearch, setStudentSearch] = useState('');
  const [studentPage, setStudentPage] = useState(1);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [editedStatuses, setEditedStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);
  
  // Export Modal State
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportPeriod, setExportPeriod] = useState<'day' | 'week' | 'month' | 'semester' | 'year'>('month');
  const [exportMonth, setExportMonth] = useState(new Date().getMonth());
  const [exportYear, setExportYear] = useState(new Date().getFullYear());
  const [exportDate, setExportDate] = useState(new Date().toISOString().split('T')[0]);
  const [exportFormat, setExportFormat] = useState<'excel' | 'pdf' | 'word'>('excel');
  const [isExporting, setIsExporting] = useState(false);

  // Solid style when active
  const STATUS_CHIP: Record<AttendanceStatus, { border: string; bg: string; text: string; shadow: string }> = {
    Hadir: { border: 'border-emerald-500', bg: 'bg-emerald-500', text: 'text-white', shadow: 'shadow-emerald-200' },
    Terlambat: { border: 'border-orange-500', bg: 'bg-orange-500', text: 'text-white', shadow: 'shadow-orange-200' },
    Sakit: { border: 'border-amber-400', bg: 'bg-amber-400', text: 'text-white', shadow: 'shadow-amber-200' },
    Izin: { border: 'border-blue-500', bg: 'bg-blue-500', text: 'text-white', shadow: 'shadow-blue-200' },
    Alpha: { border: 'border-red-500', bg: 'bg-red-500', text: 'text-white', shadow: 'shadow-red-200' },
  };

  const getStatusChipClass = (status: AttendanceStatus, active: boolean) => {
    if (!active) {
      // outline for non-active
      return 'min-w-[72px] sm:min-w-[84px] px-3 sm:px-4 py-2 rounded-lg text-[11px] sm:text-xs font-semibold border-2 bg-white text-gray-600 border-gray-200 hover:border-gray-300 transition';
    }
    const s = STATUS_CHIP[status];
    return `min-w-[72px] sm:min-w-[84px] px-3 sm:px-4 py-2 rounded-lg text-[11px] sm:text-xs font-semibold border-2 ${s.bg} ${s.text} ${s.border} shadow-md ${s.shadow} transition`;
  };

  const getCountPillClass = (variant: AttendanceStatus, count: number) => {
    // Selalu solid + ukuran seragam supaya sejajar (aman untuk angka puluhan/ratusan)
    const s = STATUS_CHIP[variant];
    const base = `inline-flex items-center justify-center w-20 sm:w-24 md:w-28 lg:w-32 px-2 sm:px-2.5 py-1.5 rounded-lg border-2 text-[11px] sm:text-xs font-semibold whitespace-nowrap`;
    // 0 tetap solid (tanpa pudar)
    return `${base} ${s.border} ${s.bg} ${s.text} shadow-sm`;
  };


  const getMobileStatBoxClass = (variant: AttendanceStatus, _count: number) => {
    // SELALU solid (mobile disamakan dengan desktop) — tidak ada kondisi count
    const s = STATUS_CHIP[variant];
    return `rounded-xl ${s.bg} border ${s.border} px-2 py-2 text-center shadow-sm`;
  };


  const getMobileStatTextClass = (_variant: AttendanceStatus, _count: number) => {
    // Always white text on solid boxes.
    return 'text-white';
  };


  // Reset view ketika pindah kelas
  useEffect(() => {
    if (selectedClassId === 'all') {
      setTab('siswa');
      setSelectedSessionId(null);
      setEditedStatuses({});
    } else {
      setSelectedSessionId(null);
      setEditedStatuses({});
    }
  }, [selectedClassId]);

  // Reset pagination ketika filter berubah
  useEffect(() => {
    setStudentPage(1);
  }, [selectedClassId, studentSearch]);

  const classById = React.useMemo(() => {
    const map = new Map<string, any>();
    schoolClasses.forEach(c => map.set(c.id, c));
    return map;
  }, [schoolClasses]);

  const sortedClasses = React.useMemo(() => {
    return [...schoolClasses].sort((a, b) => compareClassName(a.name, b.name));
  }, [schoolClasses]);

  const sessionsById = React.useMemo(() => {
    const map = new Map<string, AttendanceSession>();
    state.sessions.forEach(s => map.set(s.id, s));
    return map;
  }, [state.sessions]);

  const scopeSessions = React.useMemo(() => {
    const schoolSessions = state.sessions.filter(s => schoolClassIds.has(s.classId));
    if (selectedClassId === 'all') return schoolSessions;
    return schoolSessions.filter(s => s.classId === selectedClassId);
  }, [state.sessions, selectedClassId, schoolClassIds]);

  const scopeSessionIds = React.useMemo(() => new Set(scopeSessions.map(s => s.id)), [scopeSessions]);

  const scopeStudents = React.useMemo(() => {
    const schoolStudents = state.students.filter(st => schoolClassIds.has(st.classId));
    const students = selectedClassId === 'all'
      ? schoolStudents.filter(st => classById.has(st.classId))
      : schoolStudents.filter(st => st.classId === selectedClassId);

    const q = studentSearch.trim().toLowerCase();
    const filtered = q ? students.filter(st => st.name.toLowerCase().includes(q)) : students;

    // Sort:
    // - kalau dropdown "Semua" => urut NAMA A-Z (tanpa grouping kelas)
    // - kelas tertentu => urut nama
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }));
  }, [state.students, classById, selectedClassId, studentSearch]);

  const STUDENTS_PER_PAGE = 10;
  const totalStudentPages = React.useMemo(() => {
    return Math.max(1, Math.ceil(scopeStudents.length / STUDENTS_PER_PAGE));
  }, [scopeStudents.length]);

  const pagedStudents = React.useMemo(() => {
    const safePage = Math.min(Math.max(studentPage, 1), totalStudentPages);
    if (safePage !== studentPage) setStudentPage(safePage);
    const start = (safePage - 1) * STUDENTS_PER_PAGE;
    return scopeStudents.slice(start, start + STUDENTS_PER_PAGE);
  }, [scopeStudents, studentPage, totalStudentPages]);

  const getCountsForStudent = React.useCallback((studentId: string) => {
    let hadir = 0;
    let terlambat = 0;
    let sakit = 0;
    let izin = 0;
    let alpha = 0;

    for (const r of state.records) {
      if (r.studentId !== studentId) continue;
      if (!scopeSessionIds.has(r.sessionId)) continue;

      if (r.status === 'Hadir') hadir++;
      else if (r.status === 'Terlambat') terlambat++;
      else if (r.status === 'Sakit') sakit++;
      else if (r.status === 'Izin') izin++;
      else if (r.status === 'Alpha') alpha++;
    }
    return { hadir, terlambat, sakit, izin, alpha };
  }, [state.records, scopeSessionIds]);

  const getDetailRowsForStudent = React.useCallback((studentId: string) => {
    const rows: Array<{
      session: AttendanceSession;
      record?: AttendanceRecord;
      className: string;
    }> = [];

    for (const s of scopeSessions) {
      const rec = state.records.find(r => r.sessionId === s.id && r.studentId === studentId);
      rows.push({
        session: s,
        record: rec,
        className: classById.get(s.classId)?.name ?? ''
      });
    }

    // Sort per tanggal, lalu meeting
    rows.sort((a, b) => {
      if (a.session.dateISO !== b.session.dateISO) return a.session.dateISO.localeCompare(b.session.dateISO);
      return (a.session.meetingNumber ?? 0) - (b.session.meetingNumber ?? 0);
    });

    return rows;
  }, [scopeSessions, state.records, classById]);

  const exportStudentData = async (studentId: string, format: 'excel' | 'pdf' | 'word') => {
    const student = state.students.find(s => s.id === studentId);
    if (!student) return;

    const className = classById.get(student.classId)?.name ?? '-';
    const schoolYear = state.teacher?.schoolYear ?? '-';
    const rows = getDetailRowsForStudent(studentId);
    const filenameBase = `rekap-individu-${student.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;

    try {
      if (format === 'excel') {
        const ExcelJS = (await import('exceljs')).default;
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Rekap');

        ws.addRow(['REKAP KEHADIRAN INDIVIDU']);
        ws.addRow(['Nama', student.name]);
        ws.addRow(['Kelas', className]);
        ws.addRow(['Tahun Ajaran', schoolYear]);
        ws.addRow([]);
        ws.addRow(['Tanggal', 'Hari', 'Pertemuan', 'Kelas', 'Status', 'Waktu']);

        for (const row of rows) {
          ws.addRow([
            row.session.dateLabel ?? row.session.dateISO,
            row.session.dayName ?? '-',
            row.session.meetingNumber ?? '-',
            row.className,
            row.record?.status ?? '-',
            row.record?.timeHHMMSS ?? '-'
          ]);
        }
        
        ws.getRow(1).font = { bold: true, size: 14 };
        ws.getRow(6).font = { bold: true };
        
        const buf = await wb.xlsx.writeBuffer();
        await saveBlob(new Blob([buf]), `${filenameBase}.xlsx`);
      } 
      else if (format === 'pdf') {
        const { jsPDF } = await import('jspdf');
        const autoTable = (await import('jspdf-autotable')).default;
        const doc = new jsPDF();

        doc.setFontSize(16);
        doc.text('REKAP KEHADIRAN INDIVIDU', 105, 15, { align: 'center' });
        doc.setFontSize(10);
        doc.text(`Nama: ${student.name}`, 20, 25);
        doc.text(`Kelas: ${className}`, 20, 30);
        doc.text(`Tahun Ajaran: ${schoolYear}`, 20, 35);

        const tableBody = rows.map(r => [
          r.session.dateLabel ?? r.session.dateISO,
          r.session.dayName ?? '-',
          r.session.meetingNumber ?? '-',
          r.record?.status ?? '-',
          r.record?.timeHHMMSS ?? '-'
        ]);

        if (typeof autoTable === 'function') {
          autoTable(doc, {
            startY: 40,
            head: [['Tanggal', 'Hari', 'Ke', 'Status', 'Waktu']],
            body: tableBody,
            headStyles: { fillColor: [16, 185, 129] }
          });
        }
        doc.save(`${filenameBase}.pdf`);
      }
      else if (format === 'word') {
        const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, WidthType, HeadingLevel } = await import('docx');
        
        const tableRows = [
          new TableRow({
            children: ['Tanggal', 'Hari', 'Status', 'Waktu'].map(h => new TableCell({
              shading: { fill: 'E0E0E0' },
              children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })], alignment: AlignmentType.CENTER })]
            }))
          })
        ];

        rows.forEach(r => {
          tableRows.push(new TableRow({
            children: [
              r.session.dateISO,
              r.session.dayName ?? '-',
              r.record?.status ?? '-',
              r.record?.timeHHMMSS ?? '-'
            ].map(t => new TableCell({
              children: [new Paragraph({ text: t, alignment: AlignmentType.CENTER })]
            }))
          }));
        });

        const doc = new Document({
          sections: [{
            children: [
              new Paragraph({ text: 'REKAP KEHADIRAN INDIVIDU', heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
              new Paragraph({ text: `Nama: ${student.name}` }),
              new Paragraph({ text: `Kelas: ${className}` }),
              new Paragraph({ text: `Tahun Ajaran: ${schoolYear}` }),
              new Paragraph({ text: '' }),
              new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows })
            ]
          }]
        });
        const buf = await Packer.toBlob(doc);
        await saveBlob(buf, `${filenameBase}.docx`);
      }
      notify(`Berhasil mengunduh rekap ${format}.`);
    } catch (err) {
      console.error(err);
      notify('Gagal mengunduh rekap.', 'error');
    }
  };


  const base64ToUint8Array = (b64: string) => {
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  };

  const loadWorkbookFromTemplateB64 = async (b64: string) => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const bytes = base64ToUint8Array(b64);
    await wb.xlsx.load(bytes.buffer as ArrayBuffer);
    return wb;
  };

  const copyRowStyle = (ws: any, fromRowNum: number, toRowNum: number, colCount: number) => {
    const fromRow = ws.getRow(fromRowNum);
    const toRow = ws.getRow(toRowNum);
    toRow.height = fromRow.height;
    for (let c = 1; c <= colCount; c++) {
      const fromCell = fromRow.getCell(c);
      const toCell = toRow.getCell(c);
      // deep-ish copy style
      toCell.style = JSON.parse(JSON.stringify(fromCell.style || {}));
      toCell.numFmt = fromCell.numFmt;
      toCell.alignment = fromCell.alignment;
      toCell.font = fromCell.font;
      toCell.border = fromCell.border;
      toCell.fill = fromCell.fill;
    }
    toRow.commit();
  };

  const exportClassRecapExcel = async (classId: string) => {
    if (classId === 'all') return;
    const classInfo = schoolClasses.find(c => c.id === classId);
    if (!classInfo) return;

    const students = state.students
      .filter(st => st.classId === classId)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }));

    // pakai template agar style/border/warna ikut
    const wb = await loadWorkbookFromTemplateB64(REKAP_AKHIR_TEMPLATE_B64);
    const ws = wb.worksheets[0];

    // Header (template default)
    // A1/B1 biasanya judul. Kita update judul + tahun ajaran + tanggal.
    const title = `REKAPITULASI KEHADIRAN KELAS ${classInfo.name}`;
    // Template menaruh judul di B1 (kadang merge). Set di B1 dan A1 untuk aman.
    ws.getCell('A1').value = title;
    ws.getCell('B1').value = title;

    const schoolYear = state.teacher?.schoolYear ?? '-';
    ws.getCell('A2').value = `TAHUN AJARAN ${schoolYear}`;
    ws.getCell('B2').value = `TAHUN AJARAN ${schoolYear}`;

    const now = new Date();
    const dateStr = now.toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).toUpperCase();
    ws.getCell('A3').value = dateStr;
    ws.getCell('B3').value = dateStr;

    const startRow = 8;
    const colCount = 7; // A-G
    const templateRowNum = startRow; // row pertama data di template punya style lengkap

    // pastikan row cukup
    for (let i = 0; i < students.length; i++) {
      const rowNum = startRow + i;
      if (!ws.getRow(rowNum) || ws.getRow(rowNum).cellCount === 0) {
        ws.insertRow(rowNum, []);
        copyRowStyle(ws, templateRowNum, rowNum, colCount);
      } else if (rowNum > templateRowNum && ws.getRow(rowNum).cellCount === 0) {
        copyRowStyle(ws, templateRowNum, rowNum, colCount);
      }
    }

    // tulis data
    students.forEach((st, i) => {
      const rowNum = startRow + i;
      const c = getCountsForStudent(st.id);
      const row = ws.getRow(rowNum);

      row.getCell(1).value = i + 1;          // No (A)
      row.getCell(2).value = st.name;        // Nama (B)
      row.getCell(3).value = c.hadir;        // Hadir (C)
      row.getCell(4).value = c.sakit;        // Sakit (D)
      row.getCell(5).value = c.izin;         // Izin (E)
      row.getCell(6).value = c.alpha;        // Alpha (F)
      row.getCell(7).value = c.terlambat;    // Terlambat (G)

      row.commit();
    });

    // bersihkan sisa contoh di bawah (kalau template punya sample lebih banyak)
    const maxTemplateRows = Math.max(ws.rowCount, startRow + students.length + 10);
    for (let r = startRow + students.length; r <= maxTemplateRows; r++) {
      const row = ws.getRow(r);
      if (!row) continue;
      // kalau baris ini masih berisi nama contoh, kosongkan nilai tanpa menghapus style
      const nameVal = row.getCell(2).value;
      if (nameVal) {
        for (let c = 1; c <= colCount; c++) row.getCell(c).value = null;
        row.commit();
      }
    }

    const buf = await wb.xlsx.writeBuffer();
    const safeClass = classInfo.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const fileName = `rekap-kelas-${safeClass}-${formatExportDate(new Date())}.xlsx`;
    await saveBlob(new Blob([buf]), fileName);
    notify('Berhasil mengunduh rekap kelas.');
  };

  const exportRecapByPeriod = async () => {
    if (selectedClassId === 'all') return;
    setIsExporting(true);
    
    try {
      const classInfo = schoolClasses.find(c => c.id === selectedClassId);
      if (!classInfo) throw new Error('Kelas tidak ditemukan');

      const students = state.students
        .filter(st => st.classId === selectedClassId)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }));

      const schoolYear = state.teacher?.schoolYear ?? '-';
      
      let periodLabel = "";
      let periodTypeLabel = ""; // Harian, Mingguan, dll
      let filenamePrefix = "rekap";
      
      let filteredSessions: AttendanceSession[] = [];

      if (exportPeriod === 'day') {
        periodTypeLabel = "HARIAN";
        const dateObj = new Date(exportDate);
        periodLabel = dateObj.toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
        filteredSessions = state.sessions.filter(s => s.classId === selectedClassId && s.dateISO === exportDate);
        filenamePrefix = `rekap-harian-${exportDate}`;
      } 
      else if (exportPeriod === 'week') {
        periodTypeLabel = "MINGGUAN";
        const d = new Date(exportDate);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const mon = new Date(new Date(exportDate).setDate(diff));
        const sun = new Date(new Date(mon).setDate(mon.getDate() + 6));
        
        const monISO = mon.toISOString().split('T')[0];
        const sunISO = sun.toISOString().split('T')[0];
        
        periodLabel = `${mon.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })} - ${sun.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}`;
        filteredSessions = state.sessions.filter(s => s.classId === selectedClassId && s.dateISO >= monISO && s.dateISO <= sunISO);
        filenamePrefix = `rekap-mingguan-${monISO}`;
      }
      else if (exportPeriod === 'month') {
        periodTypeLabel = "BULANAN";
        const monthName = new Date(exportYear, exportMonth).toLocaleDateString('id-ID', { month: 'long' });
        periodLabel = `${monthName} ${exportYear}`;
        filteredSessions = state.sessions.filter(s => {
          if (s.classId !== selectedClassId) return false;
          const d = new Date(s.dateISO);
          return d.getFullYear() === exportYear && d.getMonth() === exportMonth;
        });
        filenamePrefix = `rekap-bulanan-${exportYear}-${exportMonth + 1}`;
      } 
      else if (exportPeriod === 'semester') {
        periodTypeLabel = "SEMESTER";
        const isGenap = exportMonth >= 6;
        const semName = isGenap ? 'Genap' : 'Ganjil';
        periodLabel = `${semName} ${exportYear}`;
        
        const startM = isGenap ? 6 : 0;
        const endM = isGenap ? 11 : 5;
        
        filteredSessions = state.sessions.filter(s => {
          if (s.classId !== selectedClassId) return false;
          const d = new Date(s.dateISO);
          return d.getFullYear() === exportYear && d.getMonth() >= startM && d.getMonth() <= endM;
        });
        filenamePrefix = `rekap-semester-${semName.toLowerCase()}-${exportYear}`;
      } 
      else {
        periodTypeLabel = "TAHUNAN";
        periodLabel = `Tahun ${exportYear}`;
        filteredSessions = state.sessions.filter(s => {
          if (s.classId !== selectedClassId) return false;
          const d = new Date(s.dateISO);
          return d.getFullYear() === exportYear;
        });
        filenamePrefix = `rekap-tahunan-${exportYear}`;
      }

      const sessionIds = new Set(filteredSessions.map(s => s.id));
      const records = state.records.filter(r => sessionIds.has(r.sessionId));

      const countByStudent = new Map<string, Record<AttendanceStatus, number>>();
      for (const st of students) {
        countByStudent.set(st.id, { Hadir: 0, Izin: 0, Sakit: 0, Alpha: 0, Terlambat: 0 });
      }
      for (const r of records) {
        const counts = countByStudent.get(r.studentId);
        if (counts) {
          const status = r.status as AttendanceStatus;
          if (status in counts) counts[status]++;
        }
      }

      const fullTitle = `REKAPITULASI ${periodTypeLabel} KEHADIRAN KELAS ${classInfo.name}`;
      const safeClass = classInfo.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      const finalFilename = `${filenamePrefix}-${safeClass}`;

      if (exportFormat === 'excel') {
        const ExcelJS = (await import('exceljs')).default;
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Rekap');

        ws.mergeCells('A1:F1');
        ws.getCell('A1').value = fullTitle;
        ws.getCell('A1').font = { bold: true, size: 14 };
        ws.getCell('A1').alignment = { horizontal: 'center' };

        ws.mergeCells('A2:F2');
        ws.getCell('A2').value = `TAHUN AJARAN ${schoolYear}`;
        ws.getCell('A2').font = { size: 11 };
        ws.getCell('A2').alignment = { horizontal: 'center' };

        ws.mergeCells('A3:F3');
        ws.getCell('A3').value = `PERIODE: ${periodLabel}`;
        ws.getCell('A3').font = { size: 11 };
        ws.getCell('A3').alignment = { horizontal: 'center' };

        const headerRow = ws.addRow(['No', 'Nama Siswa', 'Hadir', 'Izin', 'Sakit', 'Alpha']);
        headerRow.eachCell(cell => {
          cell.font = { bold: true };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
          cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
          cell.alignment = { horizontal: 'center' };
        });

        let no = 1;
        for (const st of students) {
          const counts = countByStudent.get(st.id) || { Hadir: 0, Izin: 0, Sakit: 0, Alpha: 0, Terlambat: 0 };
          const row = ws.addRow([no++, st.name, counts.Hadir, counts.Izin, counts.Sakit, counts.Alpha]);
          row.getCell(2).alignment = { horizontal: 'left' };
          for (let c = 3; c <= 6; c++) row.getCell(c).alignment = { horizontal: 'center' };
        }

        ws.getColumn(2).width = 30;
        const buf = await wb.xlsx.writeBuffer();
        await saveBlob(new Blob([buf]), `${finalFilename}.xlsx`);
      } 
      else if (exportFormat === 'pdf') {
        const { jsPDF } = await import('jspdf');
        const autoTable = (await import('jspdf-autotable')).default;
        
        const doc = new jsPDF();
        doc.setFontSize(14);
        doc.text(fullTitle, 105, 15, { align: 'center' });
        doc.setFontSize(10);
        doc.text(`TAHUN AJARAN ${schoolYear}`, 105, 22, { align: 'center' });
        doc.text(`PERIODE: ${periodLabel}`, 105, 27, { align: 'center' });
        
        const tableData = students.map((st, i) => {
          const c = countByStudent.get(st.id) || { Hadir: 0, Izin: 0, Sakit: 0, Alpha: 0, Terlambat: 0 };
          return [i + 1, st.name, c.Hadir, c.Izin, c.Sakit, c.Alpha];
        });

        if (typeof autoTable === 'function') {
          autoTable(doc, {
            startY: 35,
            head: [['No', 'Nama Siswa', 'Hadir', 'Izin', 'Sakit', 'Alpha']],
            body: tableData,
            headStyles: { fillColor: [16, 185, 129] }, // Emerald-500
            styles: { fontSize: 9 }
          });
        }

        doc.save(`${finalFilename}.pdf`);
      }
      else if (exportFormat === 'word') {
        const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel } = await import('docx');
        
        const tableRows = [
          new TableRow({
            children: ['No', 'Nama Siswa', 'Hadir', 'Izin', 'Sakit', 'Alpha'].map(h => 
              new TableCell({
                shading: { fill: "E0E0E0" },
                children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })], alignment: AlignmentType.CENTER })]
              })
            )
          })
        ];

        students.forEach((st, i) => {
          const c = countByStudent.get(st.id) || { Hadir: 0, Izin: 0, Sakit: 0, Alpha: 0, Terlambat: 0 };
          tableRows.push(new TableRow({
            children: [
              (i + 1).toString(),
              st.name,
              c.Hadir.toString(),
              c.Izin.toString(),
              c.Sakit.toString(),
              c.Alpha.toString()
            ].map((text, idx) => new TableCell({
              children: [new Paragraph({ children: [new TextRun(text)], alignment: idx === 1 ? AlignmentType.LEFT : AlignmentType.CENTER })]
            }))
          }));
        });

        const doc = new Document({
          sections: [{
            children: [
              new Paragraph({ text: fullTitle, heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
              new Paragraph({ text: `TAHUN AJARAN ${schoolYear}`, alignment: AlignmentType.CENTER }),
              new Paragraph({ text: `PERIODE: ${periodLabel}`, alignment: AlignmentType.CENTER }),
              new Paragraph({ text: "" }), // spacing
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: tableRows
              })
            ]
          }]
        });

        const buf = await Packer.toBlob(doc);
        await saveBlob(buf, `${finalFilename}.docx`);
      }

      setIsExportModalOpen(false);
      notify('Berhasil mengunduh rekap.');
    } catch (err) {
      console.error(err);
      notify('Gagal mengunduh rekap.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const exportSessionExcel = async (sessionId: string) => {
    const session = state.sessions.find(s => s.id === sessionId);
    if (!session) return;

    // jika ada perubahan draft, minta simpan dulu agar export sesuai
    if (Object.keys(editedStatuses).length > 0) {
    notify('Simpan perubahan dulu agar hasil export sesuai.');
    return;
  }

  const classInfo = schoolClasses.find(c => c.id === session.classId);
  const students = state.students
    .filter(st => st.classId === session.classId && schoolClassIds.has(st.classId))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }));

  const records = state.records.filter(r => r.sessionId === sessionId);
  const recordByStudent = new Map<string, AttendanceRecord>(records.map(r => [r.studentId, r]));

  const wb = await loadWorkbookFromTemplateB64(REKAP_PERTEMUAN_TEMPLATE_B64);
  const ws = wb.worksheets[0];

  // Header template: B3 (Pertemuan), B4 (Materi), B5 (Tanggal)
  const pertemuanLabel = session.meetingNumber ? `PERTEMUAN ${session.meetingNumber}` : 'PERTEMUAN';
  ws.getCell('B3').value = pertemuanLabel;

  const materi = classInfo?.subject ? `MATERI : ${classInfo.subject}` : 'MATERI : -';
  ws.getCell('B4').value = materi;

  const d = new Date(session.dateISO);
  const dateStr = d.toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).toUpperCase();
  ws.getCell('B5').value = dateStr;

  const startRow = 8; // data mulai dari baris 8
  const colCount = 4; // A-D
  const templateRowNum = startRow;

  // pastikan row cukup
  for (let i = 0; i < students.length; i++) {
    const rowNum = startRow + i;
    if (!ws.getRow(rowNum) || ws.getRow(rowNum).cellCount === 0) {
      ws.insertRow(rowNum, []);
      copyRowStyle(ws, templateRowNum, rowNum, colCount);
    } else if (rowNum > templateRowNum && ws.getRow(rowNum).cellCount === 0) {
      copyRowStyle(ws, templateRowNum, rowNum, colCount);
    }
  }

  students.forEach((st, i) => {
    const rowNum = startRow + i;
    const rec = recordByStudent.get(st.id);
    const status = (rec?.status ?? 'alpha').toUpperCase();
    const time = rec?.timeISO ? new Date(rec.timeISO) : null;

    const row = ws.getRow(rowNum);
    row.getCell(1).value = i + 1; // No
    row.getCell(2).value = st.name; // Nama
    row.getCell(3).value = status; // Absensi
    row.getCell(4).value = time ? time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null; // Waktu
    row.commit();
  });

  // bersihkan sisa contoh
  const maxTemplateRows = Math.max(ws.rowCount, startRow + students.length + 10);
  for (let r = startRow + students.length; r <= maxTemplateRows; r++) {
    const row = ws.getRow(r);
    if (!row) continue;
    const nameVal = row.getCell(2).value;
    if (nameVal) {
      for (let c = 1; c <= colCount; c++) row.getCell(c).value = null;
      row.commit();
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const safeClass = (classInfo?.name ?? 'kelas').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const meet = session.meetingNumber ?? 'x';
  const fileName = `rekap-pertemuan-${safeClass}-p${meet}-${formatExportDate(new Date())}.xlsx`;
  await saveBlob(new Blob([buf]), fileName);
  notify('Berhasil mengunduh rekap pertemuan.');
};

const saveSessionChanges = async (sessionId: string) => {
  const updates = Object.entries(editedStatuses);
  if (updates.length === 0) return;

  const now = new Date();
  for (const [studentId, status] of updates) {
    const existing = state.records.find(r => r.sessionId === sessionId && r.studentId === studentId);

    const record: AttendanceRecord = {
      id: existing ? existing.id : uuidv4(),
      sessionId,
      studentId,
      status: status as AttendanceStatus,
      timeISO: existing ? existing.timeISO : now.toISOString(),
      timeHHMMSS: existing
        ? existing.timeHHMMSS
        : now
            .toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false
            })
            .replace(/\./g, ':'),
      note: 'Diedit Manual'
    };
    await upsertRecord(record);
  }

  await refresh();
  setEditedStatuses({});
  notify('Perubahan data absensi berhasil disimpan');
};



  const handleChangeStatus = (studentId: string, newStatus: AttendanceStatus) => {
    setEditedStatuses(prev => ({ ...prev, [studentId]: newStatus }));
  };

  const activeClass = selectedClassId === 'all' ? null : schoolClasses.find(c => c.id === selectedClassId);
  const meetingsForClass = React.useMemo(() => {
    if (!activeClass) return [];
    return [...state.sessions.filter(s => s.classId === activeClass.id)].sort((a, b) => {
      // Terbaru di atas
      if (a.dateISO !== b.dateISO) return b.dateISO.localeCompare(a.dateISO);
      return (b.meetingNumber ?? 0) - (a.meetingNumber ?? 0);
    });
  }, [state.sessions, activeClass]);

  const selectedSession = selectedSessionId ? sessionsById.get(selectedSessionId) : null;
  const studentsInSelectedSessionClass = React.useMemo(() => {
    if (!selectedSession) return [];
    const students = state.students.filter(s => s.classId === selectedSession.classId);
    return [...students].sort((a, b) => a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }));
  }, [selectedSession, state.students]);

  // --- RENDER ---
  return (
    <div className="p-6 pb-28">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FolderArchive className="w-6 h-6 text-emerald-500" />
            Rekapitulasi
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Rekap hadir & terlambat per siswa. Pilih kelas untuk melihat pertemuan.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <div className="w-full sm:w-64">
            <label className="text-xs text-gray-500">Kelas</label>
            <div className="relative mt-1">
              <select
                className="w-full px-4 py-2.5 pr-12 border border-gray-200 rounded-xl bg-white shadow-sm
                           focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-300
                           appearance-none text-sm font-semibold text-gray-900"
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
              >
                <option value="all">Semua</option>
                {sortedClasses.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.subject})</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            </div>
          </div>

          <div className="w-full sm:w-72">
            <label className="text-xs text-gray-500">Cari siswa</label>
            <Input
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="Cari nama siswa..."
            />
          </div>

          <div className="w-full sm:w-auto sm:self-end flex gap-2">
            <Button 
              variant="primary" 
              onClick={() => setIsExportModalOpen(true)}
              className="w-full sm:w-auto shadow-md"
            >
              <FileText className="w-4 h-4" /> Laporan & Rekapitulasi
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs (muncul hanya saat kelas dipilih) */}
      {selectedClassId !== 'all' && (
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant={tab === 'siswa' ? 'primary' : 'secondary'}
            onClick={() => { setTab('siswa'); setSelectedSessionId(null); }}
          >
            <Users className="w-4 h-4" /> Siswa
          </Button>
          <Button
            variant={tab === 'pertemuan' ? 'primary' : 'secondary'}
            onClick={() => { setTab('pertemuan'); setSelectedSessionId(null); setEditedStatuses({}); }}
          >
            <Calendar className="w-4 h-4" /> Pertemuan
          </Button>
        </div>
      )}

      {/* TAB: SISWA */}
      {(selectedClassId === 'all' || tab === 'siswa') && (
        <div
          className={`${selectedClassId === 'all' ? 'mt-10' : 'mt-6'} space-y-2 max-w-6xl w-full mr-auto`}
        >
          {scopeStudents.length === 0 ? (
            <div className="text-gray-500 text-sm">Tidak ada siswa yang cocok.</div>
          ) : (
            pagedStudents.map((st, idx) => {
              const counts = getCountsForStudent(st.id);
              const rowNum = (studentPage - 1) * STUDENTS_PER_PAGE + idx + 1;
              const className = classById.get(st.classId)?.name ?? '-';
              return (
                <Card
                  key={st.id}
                  onClick={() => setSelectedStudentId(st.id)}
                  className="px-4 py-3.5 sm:py-2.5 rounded-xl border border-gray-200 hover:border-emerald-200 hover:shadow-sm transition cursor-pointer"
                >
                  {/* Desktop */}
                  <div className="hidden sm:flex items-center justify-between gap-4">
                    <div className="min-w-0 flex items-center gap-3">
                      <div className="w-8 text-center text-xs font-semibold text-gray-500">{rowNum}.</div>
                      <div className="text-[13px] font-semibold text-gray-900 truncate">{st.name}</div>
                      <div className="text-[11px] text-gray-500 truncate">{className}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <div className={getCountPillClass('Hadir', counts.hadir)}>Hadir: {counts.hadir}</div>
                        <div className={getCountPillClass('Terlambat', counts.terlambat)}>Terlambat: {counts.terlambat}</div>
                        <div className={getCountPillClass('Sakit', counts.sakit)}>Sakit: {counts.sakit}</div>
                        <div className={getCountPillClass('Izin', counts.izin)}>Izin: {counts.izin}</div>
                        <div className={getCountPillClass('Alpha', counts.alpha)}>Alpha: {counts.alpha}</div>
                      </div>
</div>
                  </div>

                  {/* Mobile (mirip Statistik Beranda) */}
                  <div className="sm:hidden">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex items-start gap-3">
                        <div className="w-7 text-center text-xs font-semibold text-gray-500">{rowNum}.</div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-gray-900 truncate">{st.name}</div>
                          <div className="text-xs text-gray-500 mt-0.5 truncate">{className}</div>
                        </div>
                      </div>
</div>

                    <div className="mt-3 grid grid-cols-5 gap-2">
                      <div className={getMobileStatBoxClass('Hadir', counts.hadir)}>
                        <div className={`text-[10px] font-medium ${getMobileStatTextClass('Hadir', counts.hadir)}`}>Hadir</div>
                        <div className={`text-sm font-bold leading-tight ${getMobileStatTextClass('Hadir', counts.hadir)}`}>{counts.hadir}</div>
                      </div>
                      <div className={getMobileStatBoxClass('Sakit', counts.sakit)}>
                        <div className={`text-[10px] font-medium ${getMobileStatTextClass('Sakit', counts.sakit)}`}>Sakit</div>
                        <div className={`text-sm font-bold leading-tight ${getMobileStatTextClass('Sakit', counts.sakit)}`}>{counts.sakit}</div>
                      </div>
                      <div className={getMobileStatBoxClass('Izin', counts.izin)}>
                        <div className={`text-[10px] font-medium ${getMobileStatTextClass('Izin', counts.izin)}`}>Izin</div>
                        <div className={`text-sm font-bold leading-tight ${getMobileStatTextClass('Izin', counts.izin)}`}>{counts.izin}</div>
                      </div>
                      <div className={getMobileStatBoxClass('Terlambat', counts.terlambat)}>
                        <div className={`text-[10px] font-medium ${getMobileStatTextClass('Terlambat', counts.terlambat)}`}>Terlambat</div>
                        <div className={`text-sm font-bold leading-tight ${getMobileStatTextClass('Terlambat', counts.terlambat)}`}>{counts.terlambat}</div>
                      </div>
                      <div className={getMobileStatBoxClass('Alpha', counts.alpha)}>
                        <div className={`text-[10px] font-medium ${getMobileStatTextClass('Alpha', counts.alpha)}`}>Alpha</div>
                        <div className={`text-sm font-bold leading-tight ${getMobileStatTextClass('Alpha', counts.alpha)}`}>{counts.alpha}</div>
                      </div>
                    </div>
                  </div>
</Card>
              );
            })
          )}

          {/* Pagination */}
          {scopeStudents.length > 0 && totalStudentPages > 1 && (
            <div className="pt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="text-xs text-gray-500">
                Menampilkan <span className="font-semibold">{pagedStudents.length}</span> dari{' '}
                <span className="font-semibold">{scopeStudents.length}</span> siswa • Halaman{' '}
                <span className="font-semibold">{studentPage}</span>/{totalStudentPages}
              </div>

              <div className="flex items-center gap-2 justify-start sm:justify-end overflow-x-auto whitespace-nowrap pb-1">
                <button
                  className="shrink-0 px-3 py-1.5 text-xs rounded-lg border border-gray-200 hover:border-emerald-200 hover:bg-emerald-50 disabled:opacity-40 disabled:hover:bg-transparent"
                  onClick={() => setStudentPage(p => Math.max(1, p - 1))}
                  disabled={studentPage <= 1}
                >
                  Sebelumnya
                </button>

                {(() => {
                  const pages: number[] = [];
                  const start = Math.max(1, studentPage - 2);
                  const end = Math.min(totalStudentPages, studentPage + 2);
                  for (let i = start; i <= end; i++) pages.push(i);

                  // Ensure first/last presence for large page counts
                  const showFirst = start > 1;
                  const showLast = end < totalStudentPages;

                  return (
                    <>
                      {showFirst && (
                        <>
                          <button
                            className={`w-9 h-9 text-xs rounded-lg border ${studentPage === 1 ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 hover:border-emerald-200 hover:bg-emerald-50'}`}
                            onClick={() => setStudentPage(1)}
                          >
                            1
                          </button>
                          {start > 2 && <span className="px-1 text-gray-400">…</span>}
                        </>
                      )}

                      {pages.map(p => (
                        <button
                          key={p}
                          className={`w-9 h-9 text-xs rounded-lg border ${studentPage === p ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 hover:border-emerald-200 hover:bg-emerald-50'}`}
                          onClick={() => setStudentPage(p)}
                        >
                          {p}
                        </button>
                      ))}

                      {showLast && (
                        <>
                          {end < totalStudentPages - 1 && <span className="px-1 text-gray-400">…</span>}
                          <button
                            className={`w-9 h-9 text-xs rounded-lg border ${studentPage === totalStudentPages ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 hover:border-emerald-200 hover:bg-emerald-50'}`}
                            onClick={() => setStudentPage(totalStudentPages)}
                          >
                            {totalStudentPages}
                          </button>
                        </>
                      )}
                    </>
                  );
                })()}

                <button
                  className="shrink-0 px-3 py-1.5 text-xs rounded-lg border border-gray-200 hover:border-emerald-200 hover:bg-emerald-50 disabled:opacity-40 disabled:hover:bg-transparent"
                  onClick={() => setStudentPage(p => Math.min(totalStudentPages, p + 1))}
                  disabled={studentPage >= totalStudentPages}
                >
                  Berikutnya
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: PERTEMUAN */}
{selectedClassId !== 'all' && tab === 'pertemuan' && (
  <div className="mt-6 space-y-4 max-w-6xl w-full mr-auto">
    {meetingsForClass.length === 0 ? (
      <div className="text-gray-500 text-sm">Belum ada pertemuan untuk kelas ini.</div>
    ) : (
      meetingsForClass.map(sess => {
        const isSelected = selectedSessionId === sess.id;
        const records = state.records.filter(r => r.sessionId === sess.id);
        const presentCount = records.filter(r => r.status === 'Hadir').length;
        const lateCount = records.filter(r => r.status === 'Terlambat').length;
        const sickCount = records.filter(r => r.status === 'Sakit').length;
        const izinCount = records.filter(r => r.status === 'Izin').length;
        const alphaCount = records.filter(r => r.status === 'Alpha').length;

        const sessionStudentList = state.students
          .filter(st => st.classId === sess.classId)
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }));

        // Untuk memudahkan: recordsByStudentId
        const recordByStudentId = new Map<string, AttendanceRecord>(records.map(r => [r.studentId, r]));

        const hasAnyDraft = Object.keys(editedStatuses).length > 0;

        return (
          <Card
            key={sess.id}
            className={`overflow-hidden transition-all duration-300 ${
              isSelected ? 'ring-2 ring-emerald-500 shadow-md' : 'hover:border-emerald-200'
            }`}
          >
            {/* ROW HEADER */}
            <div
              onClick={() => {
                if (isSelected) {
                  setSelectedSessionId(null);
                  setEditedStatuses({});
                } else {
                  setSelectedSessionId(sess.id);
                  setEditedStatuses({});
                }
              }}
              className={`p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer ${
                isSelected ? 'bg-emerald-50/50' : 'bg-white'
              }`}
            >
              <div className="flex gap-4 items-center min-w-0">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 transition-colors ${
                    isSelected
                      ? 'bg-emerald-500 text-white shadow-emerald-200 shadow-md'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  P{sess.meetingNumber ?? '-'}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-gray-900 text-base truncate">
                    Pertemuan {sess.meetingNumber ?? '-'}
                  </h3>
                  <div className="flex flex-wrap items-center text-xs text-gray-500 mt-1 gap-3">
                    <span className="flex items-center">
                      <Calendar className="w-3.5 h-3.5 mr-1 text-gray-400" /> {sess.dateLabel ?? sess.dateISO}
                    </span>
                    <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={getCountPillClass('Hadir', presentCount)}>Hadir: {presentCount}</span>
                      <span className={getCountPillClass('Terlambat', lateCount)}>Terlambat: {lateCount}</span>
                      <span className={getCountPillClass('Sakit', sickCount)}>Sakit: {sickCount}</span>
                      <span className={getCountPillClass('Izin', izinCount)}>Izin: {izinCount}</span>
                      <span className={getCountPillClass('Alpha', alphaCount)}>Alpha: {alphaCount}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end md:self-auto">
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    await exportSessionExcel(sess.id);
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 rounded-xl transition-colors border border-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={hasAnyDraft ? 'Simpan perubahan dulu agar export sesuai' : 'Ekspor Excel pertemuan ini'}
                  disabled={hasAnyDraft}
                >
                  <FileSpreadsheet className="w-4 h-4" /> <span className="hidden sm:inline">Excel</span>
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteId(sess.id);
                  }}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                  title="Hapus Pertemuan"
                >
                  <Trash2 className="w-5 h-5" />
                </button>

                <div
                  className={`p-1 rounded-full transition-transform duration-300 ${
                    isSelected ? 'rotate-180 bg-emerald-200/50 text-emerald-700' : 'text-gray-300'
                  }`}
                >
                  <ChevronDown className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* DROPDOWN BODY */}
            <AnimatePresence initial={false}>
              {isSelected && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                  className="overflow-hidden bg-white border-t border-gray-100"
                >
                  <div className="p-4 md:p-5">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 text-blue-700 px-4 py-3 rounded-xl text-xs font-bold">
                        <FileText className="w-4 h-4" />
                        <span>KLIK STATUS DI BAWAH UNTUK MENGUBAH/EDIT KEHADIRAN</span>
                      </div>

                      <Button
                        onClick={() => saveSessionChanges(sess.id)}
                        disabled={Object.keys(editedStatuses).length === 0}
                        className="w-full md:w-auto"
                      >
                        <Save className="w-4 h-4" /> Simpan Perubahan
                      </Button>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-gray-100">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left font-semibold text-gray-600 p-3 w-1/3">Nama Siswa</th>
                            <th className="text-left font-semibold text-gray-600 p-3">Status Kehadiran (Klik untuk Edit)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sessionStudentList.map(st => {
                            const rec = recordByStudentId.get(st.id);
                            const current = editedStatuses[st.id] ?? (rec?.status ?? 'Alpha');
                            const time = rec?.timeHHMMSS;

                            const setStatus = (status: AttendanceStatus) => {
                              if (!rec) return;
                              setEditedStatuses(prev => ({ ...prev, [st.id]: status }));
                            };

                            const statuses: AttendanceStatus[] = ['Hadir', 'Sakit', 'Izin', 'Alpha', 'Terlambat'];

                            return (
                              <tr key={st.id} className="border-t border-gray-100">
                                <td className="p-3">
                                  <div className="font-medium text-gray-900">{st.name}</div>
                                </td>
                                <td className="p-3">
                                  <div className="flex flex-wrap gap-2">
                                    {statuses.map(sv => {
                                      const active = sv === current;
                                      return (
                                        <button
                                          key={sv}
                                          onClick={() => setStatus(sv)}
                                          disabled={false}
                                          className={getStatusChipClass(sv, active)}
                                        >
                                          {sv}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  {time && (
                                    <div className="text-xs text-gray-400 mt-2 italic">Tercatat: {time}</div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        );
      })
    )}
  </div>
)}

      {/* Detail Individu */}
      <Modal
        isOpen={!!selectedStudentId}
        onClose={() => setSelectedStudentId(null)}
        title="Detail Kehadiran Siswa"
      >
        {selectedStudentId && (() => {
          const student = state.students.find(s => s.id === selectedStudentId);
          if (!student) return <div className="text-sm text-gray-500">Data siswa tidak ditemukan.</div>;

          const className = classById.get(student.classId)?.name ?? '-';
          const rows = getDetailRowsForStudent(student.id);
          const counts = getCountsForStudent(student.id);

          return (
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-lg font-bold text-gray-900">{student.name}</div>
                  <div className="text-sm text-gray-500">{className}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => exportStudentData(student.id, 'excel')} className="flex-1 text-[10px] px-2">
                    <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                  </Button>
                  <Button variant="secondary" onClick={() => exportStudentData(student.id, 'pdf')} className="flex-1 text-[10px] px-2 text-red-600">
                    <FileText className="w-3.5 h-3.5" /> PDF
                  </Button>
                  <Button variant="secondary" onClick={() => exportStudentData(student.id, 'word')} className="flex-1 text-[10px] px-2 text-blue-600">
                    <FileText className="w-3.5 h-3.5" /> Word
                  </Button>
                </div>
              </div>

              <div className="flex gap-2 mt-3">
                <div className={getCountPillClass('Hadir', counts.hadir)}>
                  Hadir: {counts.hadir}
                </div>
                <div className={getCountPillClass('Terlambat', counts.terlambat)}>
                  Terlambat: {counts.terlambat}
                </div>
              </div>

              <div className="mt-4 max-h-80 overflow-auto border border-gray-100 rounded-xl">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white border-b">
                    <tr className="text-left">
                      <th className="p-3">Tanggal</th>
                      <th className="p-3">Pertemuan</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Waktu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.session.id} className="border-b last:border-b-0">
                        <td className="p-3">
                          <div className="font-medium text-gray-900">{r.session.dateLabel ?? r.session.dateISO}</div>
                          <div className="text-xs text-gray-500">{r.session.dayName}</div>
                        </td>
                        <td className="p-3">{r.session.meetingNumber ?? '-'}</td>
                        <td className="p-3">{r.record?.status ?? '-'}</td>
                        <td className="p-3">{r.record?.timeHHMMSS ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
      </Modal>

      <ConfirmModal
        isOpen={!!deleteId}
        title="Hapus Pertemuan"
        description="Apakah kamu yakin ingin menghapus pertemuan ini? Data absensi pada pertemuan ini juga akan ikut terhapus."
        confirmText="Hapus"
        cancelText="Batal"
        onConfirm={async () => {
          if (!deleteId) return;
          await deleteSession(deleteId);
          setDeleteId(null);
          setSelectedSessionId(null);
          setEditedStatuses({});
          await refresh();
          notify('Pertemuan berhasil dihapus.');
        }}
        onClose={() => setDeleteId(null)}
      />

      {/* Export Modal */}
      <Modal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        title="Unduh Rekapitulasi"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Periode</label>
            <div className="grid grid-cols-5 gap-2">
              {[
                { id: 'day', label: 'Harian' },
                { id: 'week', label: 'Mingguan' },
                { id: 'month', label: 'Bulanan' },
                { id: 'semester', label: 'Semester' },
                { id: 'year', label: 'Tahunan' },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setExportPeriod(p.id as any)}
                  className={`py-2 px-1 rounded-lg text-[10px] sm:text-xs font-medium border-2 transition-colors ${
                    exportPeriod === p.id 
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700' 
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Format File</label>
            <div className="flex gap-2">
              {[
                { id: 'excel', label: 'Excel', icon: <FileSpreadsheet className="w-4 h-4" /> },
                { id: 'pdf', label: 'PDF', icon: <FileText className="w-4 h-4 text-red-500" /> },
                { id: 'word', label: 'Word', icon: <FileText className="w-4 h-4 text-blue-500" /> },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setExportFormat(f.id as any)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium border-2 transition-colors ${
                    exportFormat === f.id 
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700' 
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {f.icon} {f.label}
                </button>
              ))}
            </div>
          </div>

          {(exportPeriod === 'day' || exportPeriod === 'week') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Pilih Tanggal {exportPeriod === 'week' && '(Kapanpun dalam minggu tsb)'}
              </label>
              <Input
                type="date"
                value={exportDate}
                onChange={(e) => setExportDate(e.target.value)}
              />
            </div>
          )}

          {exportPeriod === 'month' && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">Bulan</label>
                <select
                  value={exportMonth}
                  onChange={(e) => setExportMonth(Number(e.target.value))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i} value={i}>
                      {new Date(2000, i).toLocaleDateString('id-ID', { month: 'long' })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">Tahun</label>
                <select
                  value={exportYear}
                  onChange={(e) => setExportYear(Number(e.target.value))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {[2023, 2024, 2025, 2026].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {(exportPeriod === 'year' || exportPeriod === 'semester') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tahun</label>
              <select
                value={exportYear}
                onChange={(e) => setExportYear(Number(e.target.value))}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {[2023, 2024, 2025, 2026].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          )}

          {exportPeriod === 'semester' && (
            <div className="flex gap-2">
              <button
                onClick={() => setExportMonth(0)}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border-2 transition-colors ${
                  exportMonth === 0 
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700' 
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                Ganjil (Jan-Jun)
              </button>
              <button
                onClick={() => setExportMonth(6)}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border-2 transition-colors ${
                  exportMonth === 6 
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700' 
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                Genap (Jul-Des)
              </button>
            </div>
          )}

          <div className="pt-4 flex gap-3">
            <Button variant="secondary" onClick={() => setIsExportModalOpen(false)} className="flex-1">
              Batal
            </Button>
            <Button onClick={exportRecapByPeriod} isLoading={isExporting} className="flex-1">
              <Download className="w-4 h-4" /> Unduh
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
