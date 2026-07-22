import React, { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Award, Download, Calendar, RefreshCw, FileText, Search, Eye, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { jsPDF } from "jspdf";
import { getKegiatanGuruList } from "../dbStore";
import { UserSession, KegiatanGuru } from "../types";
import { getSertifikatConfigAsync, getSertifikatConfig, SertifikatLayoutConfig } from "../sertifikatConfig";
import { toSentenceCase } from "../formatName";

interface GuruSertifikatViewProps {
  userSession: UserSession;
}

interface FormattedWord {
  text: string;
  isBold: boolean;
  hasSpace: boolean;
}

export function parseMarkdownBoldWords(templateStr: string): FormattedWord[] {
  const words: FormattedWord[] = [];
  const parts = templateStr.split(/(\*\*.*?\*\*)/g);

  for (const part of parts) {
    if (!part) continue;
    const isBold = part.startsWith("**") && part.endsWith("**") && part.length >= 4;
    const cleanText = isBold ? part.slice(2, -2) : part;

    // Split words while preserving bold state
    const partWords = cleanText.split(/(\s+)/);
    for (let i = 0; i < partWords.length; i++) {
      const item = partWords[i];
      if (!item) continue;
      if (/^\s+$/.test(item)) continue; // space separator

      const nextIsSpace = i + 1 < partWords.length && /^\s+$/.test(partWords[i + 1]);
      words.push({ text: item, isBold, hasSpace: nextIsSpace });
    }
  }
  return words;
}

export function drawCertificateOnCanvas(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  templateImg: HTMLImageElement,
  kegiatan: KegiatanGuru,
  nameText: string,
  config: SertifikatLayoutConfig,
  ttd1Img?: HTMLImageElement | null,
  ttd2Img?: HTMLImageElement | null,
  ttd3Img?: HTMLImageElement | null
) {
  // 1. Clear & Draw background template
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.drawImage(templateImg, 0, 0, canvasWidth, canvasHeight);

  const pos = config.positions;

  // Helper for drawing styled text
  const drawStyledText = (text: string, elemPos: any) => {
    if (!text) return;
    const fontStyle = elemPos.fontStyle || "normal";
    const fontWeight = elemPos.fontWeight || "normal";
    const fontSize = elemPos.fontSize || 24;
    const fontFamily = "sans-serif";

    ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.fillStyle = elemPos.color || "#000000";
    ctx.textAlign = elemPos.align || "center";
    ctx.textBaseline = "middle";

    const x = (elemPos.xPercent / 100) * canvasWidth;
    const y = (elemPos.yPercent / 100) * canvasHeight;

    ctx.fillText(text, x, y);
  };

  // Helper for drawing TTD Image
  const drawTtdImg = (img: HTMLImageElement, elemPos: any) => {
    const imgW = (elemPos.widthPercent / 100) * canvasWidth;
    const aspect = img.naturalWidth ? img.naturalHeight / img.naturalWidth : 0.5;
    const imgH = imgW * aspect;
    const imgX = (elemPos.xPercent / 100) * canvasWidth - imgW / 2;
    const imgY = (elemPos.yPercent / 100) * canvasHeight - imgH / 2;
    ctx.drawImage(img, imgX, imgY, imgW, imgH);
  };

  // Helper for drawing auto underlines
  const drawAutoLine = (xCenterPercent: number, yPercent: number, widthPx: number, thicknessPx: number, color: string) => {
    const x = (xCenterPercent / 100) * canvasWidth;
    const y = (yPercent / 100) * canvasHeight;
    ctx.strokeStyle = color;
    ctx.lineWidth = thicknessPx;
    ctx.beginPath();
    ctx.moveTo(x - widthPx / 2, y);
    ctx.lineTo(x + widthPx / 2, y);
    ctx.stroke();
  };

  // 2. No Sertifikat
  const noCertText = kegiatan.no_sertifikat ? `No: ${kegiatan.no_sertifikat}` : "";
  drawStyledText(noCertText, pos.noSertifikat);

  // Draw Title Underline if configured (Below No Sertifikat / Title)
  if (config.showJudulLine) {
    const lineW = config.judulLineWidth !== undefined ? config.judulLineWidth : 980;
    drawAutoLine(50, pos.noSertifikat.yPercent + 2.5, lineW, 4, pos.noSertifikat.color || "#284478");
  }

  // 3. Prefix Nama ("Diberikan kepada:" / "We proudly present to:")
  drawStyledText("Diberikan kepada:", pos.prefixNama);

  // 4. Nama Guru / Peserta (Always Sentence Case)
  const formattedName = toSentenceCase(nameText);
  drawStyledText(formattedName, pos.namaGuru);

  // Draw Name Underline if configured (Below Participant Name)
  if (config.showNamaLine) {
    const lineW = config.namaLineWidth !== undefined ? config.namaLineWidth : 1260;
    drawAutoLine(50, pos.namaGuru.yPercent + 5.5, lineW, 3.5, "#2d5ca8");
  }

  // 5. Deskripsi Kegiatan (Formatted Template & Bold Support)
  let rawDesc = config.deskripsiTemplate || 'Atas partisipasi aktifnya sebagai **{peran}** dalam kegiatan **"{nama_kegiatan}"** yang diselenggarakan oleh **{penyelenggara}**.';
  rawDesc = rawDesc
    .replace(/\{peran\}/gi, kegiatan.peran)
    .replace(/\{nama_kegiatan\}/gi, kegiatan.nama_kegiatan)
    .replace(/\{kegiatan\}/gi, kegiatan.nama_kegiatan)
    .replace(/\{penyelenggara\}/gi, kegiatan.penyelenggara || "SMAN 19 Bandung")
    .replace(/\{nama\}/gi, formattedName)
    .replace(/\{no_sertifikat\}/gi, kegiatan.no_sertifikat || "");

  const parsedWords = parseMarkdownBoldWords(rawDesc);

  const descX = (pos.deskripsi.xPercent / 100) * canvasWidth;
  const descY = (pos.deskripsi.yPercent / 100) * canvasHeight;
  const fontSize = pos.deskripsi.fontSize || 24;
  const baseFontWeight = pos.deskripsi.fontWeight || "normal";
  const baseFontStyle = pos.deskripsi.fontStyle || "normal";
  ctx.fillStyle = pos.deskripsi.color || "#334155";
  ctx.textBaseline = "middle";

  const maxWidth = canvasWidth * 0.75;
  const wordSpacingMultiplier = pos.deskripsi.wordSpacingMultiplier || 1.0;
  const spaceWidth = ctx.measureText(" ").width * wordSpacingMultiplier;

  // Build wrapped lines of words
  interface LineWord {
    text: string;
    isBold: boolean;
    width: number;
  }

  const lines: LineWord[][] = [];
  let currentLine: LineWord[] = [];
  let currentLineWidth = 0;

  for (const w of parsedWords) {
    ctx.font = `${baseFontStyle} ${w.isBold ? "bold" : baseFontWeight} ${fontSize}px sans-serif`;
    const wWidth = ctx.measureText(w.text).width;
    const addSpace = w.hasSpace ? spaceWidth : 0;

    if (currentLineWidth + wWidth + addSpace > maxWidth && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = [{ text: w.text, isBold: w.isBold, width: wWidth }];
      currentLineWidth = wWidth + (w.hasSpace ? spaceWidth : 0);
    } else {
      currentLine.push({ text: w.text, isBold: w.isBold, width: wWidth });
      currentLineWidth += wWidth + addSpace;
    }
  }
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  const lineHeightMultiplier = pos.deskripsi.lineHeightMultiplier || 1.45;
  const lineHeight = fontSize * lineHeightMultiplier;
  const startY = descY - ((lines.length - 1) * lineHeight) / 2;

  lines.forEach((lineWords, lineIdx) => {
    const lineY = startY + lineIdx * lineHeight;

    // Calculate total width of line
    let totalW = 0;
    lineWords.forEach((wordObj, i) => {
      totalW += wordObj.width;
      if (i < lineWords.length - 1) totalW += spaceWidth;
    });

    let drawX = descX - totalW / 2;
    if (pos.deskripsi.align === "left") drawX = descX;
    if (pos.deskripsi.align === "right") drawX = descX - totalW;

    lineWords.forEach((wordObj, i) => {
      ctx.font = `${baseFontStyle} ${wordObj.isBold ? "bold" : baseFontWeight} ${fontSize}px sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(wordObj.text, drawX, lineY);
      drawX += wordObj.width + (i < lineWords.length - 1 ? spaceWidth : 0);
    });
  });

  // 6. TTD Signatures (Support 1, 2, or 3 Signatures)
  const jumlahTtd = config.jumlahTtd || 2;

  // Helper for drawing a signature underline
  const drawTtdUnderline = (namePos: any) => {
    if (config.showTtdLines) {
      const lineW = config.ttdLineWidth !== undefined ? config.ttdLineWidth : 390;
      drawAutoLine(namePos.xPercent, namePos.yPercent - 2.5, lineW, 3, namePos.color || "#284478");
    }
  };

  const drawTtdTextAndSubtext = (
    nameText: string,
    jabatanText: string,
    subText1: string,
    subText2: string,
    namePos: any,
    jabatanPos: any,
    subText1Pos: any,
    subText2Pos: any
  ) => {
    drawTtdUnderline(namePos);
    drawStyledText(toSentenceCase(nameText), namePos);
    drawStyledText(jabatanText, jabatanPos);
    if (subText1) {
      drawStyledText(subText1, subText1Pos);
    }
    if (subText2) {
      drawStyledText(subText2, subText2Pos);
    }
  };

  if (jumlahTtd === 1) {
    // Single TTD (Center / Configured)
    if (ttd1Img) drawTtdImg(ttd1Img, pos.ttd1ImagePos);
    drawTtdTextAndSubtext(
      config.ttd1Nama,
      config.ttd1Jabatan,
      config.ttd1SubText1,
      config.ttd1SubText2,
      pos.ttd1NamaPos,
      pos.ttd1JabatanPos,
      pos.ttd1SubText1Pos,
      pos.ttd1SubText2Pos
    );
  } else if (jumlahTtd === 2) {
    // 2 TTD (Kiri & Kanan)
    if (ttd1Img) drawTtdImg(ttd1Img, pos.ttd1ImagePos);
    drawTtdTextAndSubtext(
      config.ttd1Nama,
      config.ttd1Jabatan,
      config.ttd1SubText1,
      config.ttd1SubText2,
      pos.ttd1NamaPos,
      pos.ttd1JabatanPos,
      pos.ttd1SubText1Pos,
      pos.ttd1SubText2Pos
    );

    if (ttd2Img) drawTtdImg(ttd2Img, pos.ttd2ImagePos);
    drawTtdTextAndSubtext(
      config.ttd2Nama,
      config.ttd2Jabatan,
      config.ttd2SubText1,
      config.ttd2SubText2,
      pos.ttd2NamaPos,
      pos.ttd2JabatanPos,
      pos.ttd2SubText1Pos,
      pos.ttd2SubText2Pos
    );
  } else if (jumlahTtd === 3) {
    // 3 TTD (Kiri, Tengah, Kanan)
    if (ttd1Img) drawTtdImg(ttd1Img, pos.ttd1ImagePos);
    drawTtdTextAndSubtext(
      config.ttd1Nama,
      config.ttd1Jabatan,
      config.ttd1SubText1,
      config.ttd1SubText2,
      pos.ttd1NamaPos,
      pos.ttd1JabatanPos,
      pos.ttd1SubText1Pos,
      pos.ttd1SubText2Pos
    );

    if (ttd3Img) drawTtdImg(ttd3Img, pos.ttd3ImagePos);
    drawTtdTextAndSubtext(
      config.ttd3Nama,
      config.ttd3Jabatan,
      config.ttd3SubText1,
      config.ttd3SubText2,
      pos.ttd3NamaPos,
      pos.ttd3JabatanPos,
      pos.ttd3SubText1Pos,
      pos.ttd3SubText2Pos
    );

    if (ttd2Img) drawTtdImg(ttd2Img, pos.ttd2ImagePos);
    drawTtdTextAndSubtext(
      config.ttd2Nama,
      config.ttd2Jabatan,
      config.ttd2SubText1,
      config.ttd2SubText2,
      pos.ttd2NamaPos,
      pos.ttd2JabatanPos,
      pos.ttd2SubText1Pos,
      pos.ttd2SubText2Pos
    );
  }
}

export function drawJpTablePageOnCanvas(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  kegiatan: KegiatanGuru,
  config: SertifikatLayoutConfig,
  ttd1Img?: HTMLImageElement | null,
  ttd2Img?: HTMLImageElement | null,
  ttd3Img?: HTMLImageElement | null,
  templateJpImg?: HTMLImageElement | null
) {
  // Helper to replace variable placeholders
  const replaceVars = (text: string) => {
    return (text || "")
      .replace(/{nama_kegiatan}/gi, kegiatan.nama_kegiatan)
      .replace(/{penyelenggara}/gi, kegiatan.penyelenggara || "SMAN 19 Bandung")
      .replace(/{peran}/gi, kegiatan.peran);
  };

  // 1. Draw Background
  if (config.templateJpUrl && templateJpImg) {
    ctx.drawImage(templateJpImg, 0, 0, canvasWidth, canvasHeight);
  } else {
    // Clear canvas to white background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Decorative border or header (classic Indonesian certificate style)
    ctx.strokeStyle = "#1e1b4b";
    ctx.lineWidth = 6;
    ctx.strokeRect(30, 30, canvasWidth - 60, canvasHeight - 60);
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 40, canvasWidth - 80, canvasHeight - 80);
  }

  // Smart Detection Layout Adjustments
  let tableFontSize = 18;
  let headerFontSize = 20;
  let titleFontSize = 38;
  let subtitleFontSize = 28;
  let organizerFontSize = 24;
  let tableX = 150;
  let tableWidth = canvasWidth - 300; // 1700px
  let startY = 270;
  let headerHeight = 60;
  let rowPaddingY = 24;
  let sigSpacing = 50;

  // Columns Width
  let col1Width = 100; // No
  let col3Width = 250; // JP
  let col2Width = tableWidth - col1Width - col3Width; // 1350px
  const paddingX = 25;

  // Word Wrapping Helper
  function getWrappedLines(text: string, maxWidth: number, font: string): string[] {
    ctx.font = font;
    const words = (text || "").split(" ");
    const lines: string[] = [];
    let currentLine = "";

    for (let i = 0; i < words.length; i++) {
      const testLine = currentLine ? currentLine + " " + words[i] : words[i];
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = words[i];
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    return lines;
  }

  const rows = kegiatan.materi_jp || [];
  interface PreparedRow {
    materi: string;
    jp: number;
    lines: string[];
    height: number;
  }
  let rowsData: PreparedRow[] = [];

  // Loop Smart Detection (Max 4 iterations) to fit everything in canvasHeight
  let fitIndex = 0;
  const maxFitIterations = 4;
  
  while (fitIndex < maxFitIterations) {
    col2Width = tableWidth - col1Width - col3Width;
    const fontStr = `${tableFontSize}px sans-serif`;
    
    rowsData = rows.map((r) => {
      const lines = getWrappedLines(r.materi, col2Width - paddingX * 2, fontStr);
      const calculatedHeight = Math.max(tableFontSize * 1.5 + 20, lines.length * (tableFontSize + 10) + rowPaddingY);
      return {
        materi: r.materi,
        jp: r.jp,
        lines,
        height: calculatedHeight
      };
    });

    const totalTableRowsHeight = rowsData.reduce((acc, r) => acc + r.height, 0);
    const totalTableHeight = headerHeight + totalTableRowsHeight + 54; // header + rows + total row
    
    // Estimate total page height needed
    // startY + tableHeight + sigSpacing + date line + principal signature height (approx 220px) + bottom margin
    const totalPageHeightNeeded = startY + totalTableHeight + sigSpacing + 30 + 160 + 80;

    if (totalPageHeightNeeded <= canvasHeight - 80) {
      break; // It fits!
    }

    // Shrink layout dynamically
    fitIndex++;
    if (fitIndex === 1) {
      // Step 1: Make table wider (decrease margins) & push startY up
      tableX = 80;
      tableWidth = canvasWidth - 160;
      startY = 240;
    } else if (fitIndex === 2) {
      // Step 2: Decrease table font size & row padding
      tableFontSize = 15;
      headerFontSize = 18;
      rowPaddingY = 16;
      sigSpacing = 35;
      startY = 220;
    } else if (fitIndex === 3) {
      // Step 3: Scale down top titles, decrease header height and shrink spacing to minimum
      tableFontSize = 13;
      headerFontSize = 15;
      titleFontSize = 32;
      subtitleFontSize = 24;
      organizerFontSize = 20;
      rowPaddingY = 12;
      headerHeight = 50;
      sigSpacing = 20;
      startY = 200;
    }
  }

  // Titles Rendering
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#1e1b4b";

  // Main Title
  ctx.font = `bold ${titleFontSize}px sans-serif`;
  const jpTitle = replaceVars(config.jpHeaderTitle || "STRUKTUR PROGRAM DAN MATERI PELATIHAN");
  ctx.fillText(jpTitle.toUpperCase(), canvasWidth / 2, startY - 160);

  // Subtitle (Activity Name)
  ctx.font = `bold ${subtitleFontSize}px sans-serif`;
  const jpSubtitle = replaceVars(config.jpHeaderSubtitle || "{nama_kegiatan}");
  ctx.fillText(jpSubtitle.toUpperCase(), canvasWidth / 2, startY - 105);

  // Organizer / Subtext 2
  ctx.font = `bold ${organizerFontSize}px sans-serif`;
  const jpSub2 = replaceVars(config.jpHeaderSub2 || "{penyelenggara}");
  ctx.fillText(jpSub2.toUpperCase(), canvasWidth / 2, startY - 55);

  // Draw Header background
  ctx.fillStyle = "#284478";
  ctx.fillRect(tableX, startY, tableWidth, headerHeight);

  // Header Texts
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${headerFontSize}px sans-serif`;
  ctx.fillText("No.", tableX + col1Width / 2, startY + headerHeight / 2);
  ctx.fillText("Materi Pelatihan", tableX + col1Width + col2Width / 2, startY + headerHeight / 2);
  ctx.fillText("Jam Pelatihan (JP)", tableX + col1Width + col2Width + col3Width / 2, startY + headerHeight / 2);

  // Draw rows dynamically
  let currentY = startY + headerHeight;

  rowsData.forEach((row, idx) => {
    // Row background alternate color
    if (idx % 2 === 1) {
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(tableX, currentY, tableWidth, row.height);
    }

    // Border lines
    ctx.strokeStyle = "#1e1b4b";
    ctx.lineWidth = 2;
    ctx.strokeRect(tableX, currentY, tableWidth, row.height);

    // Cell Texts
    ctx.fillStyle = "#000000";
    ctx.textAlign = "center";
    ctx.font = `${tableFontSize}px sans-serif`;
    ctx.fillText(`${idx + 1}`, tableX + col1Width / 2, currentY + row.height / 2);
    
    // Wrapped Material Text
    ctx.textAlign = "left";
    const lineSpacing = tableFontSize + 10;
    const lineStartOffset = currentY + (row.height - (row.lines.length * lineSpacing)) / 2 + tableFontSize / 2 + 3;
    row.lines.forEach((line, lineIdx) => {
      ctx.fillText(line, tableX + col1Width + paddingX, lineStartOffset + lineIdx * lineSpacing);
    });

    ctx.textAlign = "center";
    ctx.font = `bold ${tableFontSize}px sans-serif`;
    ctx.fillText(`${row.jp} JP`, tableX + col1Width + col2Width + col3Width / 2, currentY + row.height / 2);

    currentY += row.height;
  });

  // Header Border
  ctx.strokeStyle = "#1e1b4b";
  ctx.strokeRect(tableX, startY, tableWidth, headerHeight);

  // Total JP Row
  const totalRowHeight = 54;
  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(tableX, currentY, tableWidth, totalRowHeight);
  ctx.fillStyle = "#000000";
  ctx.strokeRect(tableX, currentY, tableWidth, totalRowHeight);

  ctx.textAlign = "left";
  ctx.font = `bold ${tableFontSize}px sans-serif`;
  ctx.fillText("Jumlah Jam Pelatihan (JP)", tableX + col1Width + paddingX, currentY + totalRowHeight / 2);

  const totalJp = rows.reduce((acc, curr) => acc + (Number(curr.jp) || 0), 0);
  ctx.textAlign = "center";
  ctx.fillText(`${totalJp} JP`, tableX + col1Width + col2Width + col3Width / 2, currentY + totalRowHeight / 2);

  // Draw Vertical lines for columns inside table
  ctx.beginPath();
  // Col 1 line
  ctx.moveTo(tableX + col1Width, startY);
  ctx.lineTo(tableX + col1Width, currentY + totalRowHeight);
  // Col 2 line
  ctx.moveTo(tableX + col1Width + col2Width, startY);
  ctx.lineTo(tableX + col1Width + col2Width, currentY + totalRowHeight);
  ctx.stroke();

  // 3. Signature & Date Section (Bottom Right)
  const sigAreaX = canvasWidth - 550;
  const sigAreaY = currentY + totalRowHeight + sigSpacing;

  // Format Date (Indonesian style)
  const formattedDateStr = new Date(kegiatan.tanggal_kegiatan).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  ctx.textAlign = "center";
  ctx.font = "18px sans-serif";
  ctx.fillText(`Bandung, ${formattedDateStr}`, sigAreaX, sigAreaY);

  // Get Principal / Rightmost TTD details
  const getPrincipalTtd = () => {
    if (config.jumlahTtd === 3) return { img: ttd3Img, nama: config.ttd3Nama, jabatan: config.ttd3Jabatan, sub1: config.ttd3SubText1, sub2: config.ttd3SubText2 };
    if (config.jumlahTtd === 2) return { img: ttd2Img, nama: config.ttd2Nama, jabatan: config.ttd2Jabatan, sub1: config.ttd2SubText1, sub2: config.ttd2SubText2 };
    return { img: ttd1Img, nama: config.ttd1Nama, jabatan: config.ttd1Jabatan, sub1: config.ttd1SubText1, sub2: config.ttd1SubText2 };
  };

  const pTtd = getPrincipalTtd();

  ctx.fillText(pTtd.jabatan || "Kepala Sekolah", sigAreaX, sigAreaY + 30);

  // TTD Image
  if (pTtd.img) {
    const imgW = 200;
    const aspect = pTtd.img.naturalWidth ? pTtd.img.naturalHeight / pTtd.img.naturalWidth : 0.5;
    const imgH = imgW * aspect;
    ctx.drawImage(pTtd.img, sigAreaX - imgW / 2, sigAreaY + 45, imgW, imgH);
  }

  // Underlined Name
  ctx.font = "bold 20px sans-serif";
  ctx.fillText(toSentenceCase(pTtd.nama), sigAreaX, sigAreaY + 160);
  // draw name line
  const nameWidth = ctx.measureText(toSentenceCase(pTtd.nama)).width;
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sigAreaX - nameWidth / 2, sigAreaY + 172);
  ctx.lineTo(sigAreaX + nameWidth / 2, sigAreaY + 172);
  ctx.stroke();

  // NIP / Subtext
  ctx.font = "16px sans-serif";
  if (pTtd.sub1) {
    ctx.fillText(pTtd.sub1, sigAreaX, sigAreaY + 195);
  }
  if (pTtd.sub2) {
    ctx.fillText(pTtd.sub2, sigAreaX, sigAreaY + 218);
  }
}

export default function GuruSertifikatView({ userSession }: GuruSertifikatViewProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [previewKegiatan, setPreviewKegiatan] = useState<KegiatanGuru | null>(null);
  const [currentConfig, setCurrentConfig] = useState<SertifikatLayoutConfig>(() => getSertifikatConfig());
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load config asynchronously & listen for updates
  useEffect(() => {
    getSertifikatConfigAsync().then(cfg => setCurrentConfig(cfg));

    const handleUpdate = (e: any) => {
      if (e.detail) {
        setCurrentConfig(e.detail);
      } else {
        getSertifikatConfigAsync().then(cfg => setCurrentConfig(cfg));
      }
    };

    window.addEventListener("sertifikat_config_updated", handleUpdate);
    return () => window.removeEventListener("sertifikat_config_updated", handleUpdate);
  }, []);

  // 1. Query teacher activities/certificates
  const { data: list = [], isLoading, refetch } = useQuery({
    queryKey: ["kegiatanGuruList", userSession.id],
    queryFn: () => getKegiatanGuruList(userSession.id),
  });

  // 2. Generate and download certificate using PNG template & dynamic positions
  const handleDownloadCertificate = async (kegiatan: KegiatanGuru) => {
    setDownloadingId(kegiatan.id);
    const config = await getSertifikatConfigAsync();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setDownloadingId(null);
      return;
    }

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

    try {
      await new Promise<void>((resolve, reject) => {
        templateImg.onload = () => resolve();
        templateImg.onerror = () => reject(new Error("Gagal memuat template sertifikat"));
      });

      const ttd1Img = await loadImg(config.ttd1Image);
      const ttd2Img = await loadImg(config.ttd2Image);
      const ttd3Img = await loadImg(config.ttd3Image);
      const templateJpImg = await loadImg(config.templateJpUrl);

      canvas.width = templateImg.naturalWidth || 2000;
      canvas.height = templateImg.naturalHeight || 1414;

      const nameText = userSession.fullName || userSession.email;

      drawCertificateOnCanvas(
        ctx,
        canvas.width,
        canvas.height,
        templateImg,
        kegiatan,
        nameText,
        config,
        ttd1Img,
        ttd2Img,
        ttd3Img
      );

      const hasJp = kegiatan.materi_jp && kegiatan.materi_jp.length > 0;

      if (hasJp) {
        // Halaman 2: Tabel Jam Pelajaran (JP)
        const canvas2 = document.createElement("canvas");
        const ctx2 = canvas2.getContext("2d");
        if (!ctx2) throw new Error("Gagal menginisialisasi canvas untuk halaman belakang");
        canvas2.width = canvas.width;
        canvas2.height = canvas.height;

        drawJpTablePageOnCanvas(
          ctx2,
          canvas2.width,
          canvas2.height,
          kegiatan,
          config,
          ttd1Img,
          ttd2Img,
          ttd3Img,
          templateJpImg
        );

        // Gabungkan ke file PDF 2 halaman
        const pdf = new jsPDF({
          orientation: "landscape",
          unit: "px",
          format: [canvas.width, canvas.height]
        });

        const imgData1 = canvas.toDataURL("image/png");
        pdf.addImage(imgData1, "PNG", 0, 0, canvas.width, canvas.height);

        pdf.addPage();
        const imgData2 = canvas2.toDataURL("image/png");
        pdf.addImage(imgData2, "PNG", 0, 0, canvas.width, canvas.height);

        pdf.save(`SERTIFIKAT_${kegiatan.nama_kegiatan.toUpperCase().replace(/\s+/g, "_")}_${toSentenceCase(nameText).replace(/\s+/g, "_")}.pdf`);
      } else {
        // Hanya 1 halaman: Simpan sebagai gambar PNG
        const dataUrl = canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = `SERTIFIKAT_${kegiatan.nama_kegiatan.toUpperCase().replace(/\s+/g, "_")}_${toSentenceCase(nameText).replace(/\s+/g, "_")}.png`;
        link.click();
      }
    } catch (err: any) {
      alert("Gagal mengunduh sertifikat: " + err.message);
    } finally {
      setDownloadingId(null);
    }
  };

  // State untuk berpindah halaman pada pratinjau
  const [previewPage, setPreviewPage] = useState<1 | 2>(1);

  // Render preview canvas whenever modal opens or page changes
  useEffect(() => {
    if (previewKegiatan && previewCanvasRef.current) {
      const canvas = previewCanvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const templateImg = new Image();
      templateImg.src = currentConfig.templateUrl || "/sertifikat_template.png";

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
        loadImg(currentConfig.ttd1Image),
        loadImg(currentConfig.ttd2Image),
        loadImg(currentConfig.ttd3Image),
        loadImg(currentConfig.templateJpUrl),
      ]).then(([_, ttd1Img, ttd2Img, ttd3Img, templateJpImg]) => {
        canvas.width = templateImg.naturalWidth || 2000;
        canvas.height = templateImg.naturalHeight || 1414;

        const nameText = userSession.fullName || userSession.email;

        const hasJp = previewKegiatan.materi_jp && previewKegiatan.materi_jp.length > 0;

        if (previewPage === 2 && hasJp) {
          drawJpTablePageOnCanvas(
            ctx,
            canvas.width,
            canvas.height,
            previewKegiatan,
            currentConfig,
            ttd1Img,
            ttd2Img,
            ttd3Img,
            templateJpImg
          );
        } else {
          drawCertificateOnCanvas(
            ctx,
            canvas.width,
            canvas.height,
            templateImg,
            previewKegiatan,
            nameText,
            currentConfig,
            ttd1Img,
            ttd2Img,
            ttd3Img
          );
        }
      });
    }
  }, [previewKegiatan, previewPage, userSession, currentConfig]);

  const filteredList = list.filter(k => 
    k.nama_kegiatan.toLowerCase().includes(searchQuery.toLowerCase()) ||
    k.peran.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-12 animate-fade-in font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-brand-950 tracking-tight">
            Sertifikat Kegiatan
          </h2>
          <p className="text-xs text-brand-500 font-semibold mt-1">
            Lihat riwayat keikutsertaan kegiatan sekolah dan unduh sertifikat resmi Anda.
          </p>
        </div>
      </div>

      {/* SEARCH AND CONTROLS BAR */}
      <div className="bg-white p-5 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-500/50 w-5 h-5" />
          <input
            type="text"
            placeholder="Cari berdasarkan nama kegiatan atau peran..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-brand-50/20 rounded-2xl border border-brand-100/50 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all text-brand-950 placeholder-brand-500/30"
          />
        </div>
        <button
          onClick={() => refetch()}
          className="p-3 bg-brand-50 text-brand-600 rounded-2xl hover:bg-brand-100 border border-brand-100/50 transition-colors cursor-pointer w-full sm:w-auto flex justify-center items-center"
        >
          <RefreshCw className="w-4.5 h-4.5" />
        </button>
      </div>

      {/* CERTIFICATES GRID LIST */}
      {isLoading ? (
        <div className="bg-white rounded-3xl p-12 border border-brand-100 shadow-xl text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-brand-500" />
          <p className="text-xs font-bold text-brand-400 mt-2">Memuat sertifikat Anda...</p>
        </div>
      ) : filteredList.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredList.map((kegiatan) => (
            <div
              key={kegiatan.id}
              className="bg-white rounded-3xl p-6 border border-brand-100 shadow-xl shadow-brand-900/5 flex flex-col justify-between hover:scale-[1.01] transition-all relative overflow-hidden group"
            >
              {/* Corner decorative wave */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-brand-600/5 rounded-full filter blur-xl translate-x-6 -translate-y-6 group-hover:scale-125 transition-transform" />

              <div className="space-y-4 relative z-10">
                <div className="flex justify-between items-start">
                  <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold">
                    <Award className="w-5.5 h-5.5" />
                  </div>
                  <span className="text-[10px] font-black uppercase bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-xl">
                    {kegiatan.peran}
                  </span>
                </div>

                <div className="space-y-1">
                  <h4 className="font-extrabold text-sm text-brand-950 group-hover:text-brand-700 transition-colors line-clamp-2 leading-snug">
                    {kegiatan.nama_kegiatan}
                  </h4>
                  {kegiatan.no_sertifikat && (
                    <p className="text-[10px] text-slate-400 font-mono">No: {kegiatan.no_sertifikat}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400 font-semibold pt-1 border-t border-slate-50">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-brand-500" />
                    {new Date(kegiatan.tanggal_kegiatan).toLocaleDateString("id-ID", { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>

              <div className="pt-5 mt-4 relative z-10 grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setPreviewPage(1);
                    setPreviewKegiatan(kegiatan);
                  }}
                  className="py-3 bg-brand-50 hover:bg-brand-100 border border-brand-100 rounded-2xl text-brand-700 text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  Pratinjau
                </button>
                <button
                  onClick={() => handleDownloadCertificate(kegiatan)}
                  disabled={downloadingId !== null}
                  className="py-3 bg-brand-600 hover:bg-brand-750 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-md"
                >
                  {downloadingId === kegiatan.id ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      {kegiatan.materi_jp && kegiatan.materi_jp.length > 0 ? "Unduh PDF" : "Unduh PNG"}
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-16 text-center border border-brand-100 shadow-xl shadow-brand-900/5 max-w-md mx-auto space-y-3">
          <FileText className="w-10 h-10 text-brand-300 mx-auto" />
          <h4 className="text-xs font-black text-brand-500 uppercase tracking-widest">Sertifikat Kosong</h4>
          <p className="text-[10px] text-brand-400 font-semibold leading-relaxed">
            Belum ada data kegiatan yang didaftarkan oleh Admin untuk Anda. Silakan hubungi Admin Sekolah jika ini keliru.
          </p>
        </div>
      )}

      {/* PREVIEW SERTIFIKAT MODAL */}
      <AnimatePresence>
        {previewKegiatan && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-brand-950/70 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden border border-brand-150 flex flex-col max-h-[90vh]"
            >
              <div className="px-6 py-4 bg-brand-50 border-b border-brand-100 flex items-center justify-between flex-shrink-0">
                <div>
                  <h3 className="font-black text-brand-950 text-sm">Pratinjau Sertifikat Resmi</h3>
                  <p className="text-[10.5px] font-bold text-brand-500 mt-0.5">
                    {previewKegiatan.nama_kegiatan}
                  </p>
                </div>
                <button
                  onClick={() => setPreviewKegiatan(null)}
                  className="p-1.5 rounded-xl hover:bg-brand-200/50 text-brand-400 hover:text-brand-800 transition-all cursor-pointer bg-transparent border-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1 flex flex-col items-center justify-center bg-slate-900 gap-4">
                {previewKegiatan.materi_jp && previewKegiatan.materi_jp.length > 0 && (
                  <div className="flex gap-2 bg-slate-800 p-1.5 rounded-2xl border border-slate-700 w-fit">
                    <button
                      onClick={() => setPreviewPage(1)}
                      className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer border-0 ${
                        previewPage === 1 ? "bg-brand-600 text-white shadow-md" : "text-slate-400 hover:text-white bg-transparent"
                      }`}
                    >
                      Halaman 1 (Depan)
                    </button>
                    <button
                      onClick={() => setPreviewPage(2)}
                      className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer border-0 ${
                        previewPage === 2 ? "bg-brand-600 text-white shadow-md" : "text-slate-400 hover:text-white bg-transparent"
                      }`}
                    >
                      Halaman 2 (Tabel JP)
                    </button>
                  </div>
                )}
                
                <canvas
                  ref={previewCanvasRef}
                  className="w-full h-auto max-h-[52vh] object-contain rounded-xl shadow-2xl border border-slate-700"
                />
              </div>

              <div className="px-6 py-4 bg-brand-50/50 border-t border-brand-100 flex items-center justify-end gap-3 flex-shrink-0">
                <button
                  onClick={() => setPreviewKegiatan(null)}
                  className="px-4 py-2.5 rounded-2xl hover:bg-brand-200/40 text-brand-600 font-bold text-sm transition-all cursor-pointer bg-transparent border-0"
                >
                  Tutup
                </button>
                <button
                  onClick={() => handleDownloadCertificate(previewKegiatan)}
                  disabled={downloadingId !== null}
                  className="px-5 py-2.5 rounded-2xl bg-brand-600 hover:bg-brand-750 text-white font-bold text-sm shadow-md transition-all cursor-pointer border-0 flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  {previewKegiatan.materi_jp && previewKegiatan.materi_jp.length > 0 ? "Unduh Sertifikat PDF" : "Unduh Sertifikat PNG"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
