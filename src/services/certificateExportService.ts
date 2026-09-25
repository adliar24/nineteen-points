import { jsPDF } from "jspdf";
import JSZip from "jszip";
import { KegiatanGuru } from "../types";
import { SertifikatLayoutConfig } from "../sertifikatConfig";
import { toSentenceCase } from "../formatName";
import { drawCertificateOnCanvas, drawJpTablePageOnCanvas } from "../components/GuruSertifikatView";

export interface CertificateAssets {
  templateImg: HTMLImageElement;
  ttd1Img: HTMLImageElement | null;
  ttd2Img: HTMLImageElement | null;
  ttd3Img: HTMLImageElement | null;
  ttdBack1Img: HTMLImageElement | null;
  ttdBack2Img: HTMLImageElement | null;
  ttdBack3Img: HTMLImageElement | null;
  templateJpImg: HTMLImageElement | null;
  logoFrontImg: HTMLImageElement | null;
  logoBackImg: HTMLImageElement | null;
  canvasWidth: number;
  canvasHeight: number;
}

export type PaperSizeOption = "standard" | "a4_2in1";
export type FileFormatOption = "pdf" | "png";
export type SingleLayout2in1Option = "duplicate" | "front_back";
export type PageSelectionOption = "both" | "front" | "back";

export interface SingleExportOptions {
  kegiatan: KegiatanGuru;
  userNameOverride?: string;
  config: SertifikatLayoutConfig;
  paperSize: PaperSizeOption;
  fileFormat: FileFormatOption;
  layout2in1?: SingleLayout2in1Option;
  pageOption?: PageSelectionOption;
  withCuttingLine?: boolean;
}

export interface BatchExportOptions {
  folderName: string;
  items: KegiatanGuru[];
  config: SertifikatLayoutConfig;
  paperSize: PaperSizeOption;
  fileFormat: FileFormatOption;
  pageOption: PageSelectionOption;
  withCuttingLine?: boolean;
  onProgress?: (current: number, total: number, statusText: string) => void;
}

/**
 * Load all image assets and calculate canvas dimensions
 */
export async function loadCertificateAssets(config: SertifikatLayoutConfig): Promise<CertificateAssets> {
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

  await document.fonts.ready;
  const templateImg = new Image();
  templateImg.crossOrigin = "anonymous";
  templateImg.src = config.templateUrl || "/sertifikat_template.png";
  await templateImg.decode();

  const [
    ttd1Img,
    ttd2Img,
    ttd3Img,
    ttdBack1Img,
    ttdBack2Img,
    ttdBack3Img,
    templateJpImg,
    logoFrontImg,
    logoBackImg
  ] = await Promise.all([
    loadImg(config.ttd1Image),
    loadImg(config.ttd2Image),
    loadImg(config.ttd3Image),
    loadImg(config.ttdBack1Image),
    loadImg(config.ttdBack2Image),
    loadImg(config.ttdBack3Image),
    loadImg(config.templateJpUrl),
    loadImg(config.logoFrontImage),
    loadImg(config.logoBackImage)
  ]);

  const canvasWidth = templateImg.naturalWidth || 2000;
  const canvasHeight = templateImg.naturalHeight || 1414;

  return {
    templateImg,
    ttd1Img,
    ttd2Img,
    ttd3Img,
    ttdBack1Img,
    ttdBack2Img,
    ttdBack3Img,
    templateJpImg,
    logoFrontImg,
    logoBackImg,
    canvasWidth,
    canvasHeight
  };
}

/**
 * Render a single certificate page (front or back JP table) to an off-screen canvas
 */
export function renderCertificatePageToCanvas(
  kegiatan: KegiatanGuru,
  nameText: string,
  page: "front" | "back",
  config: SertifikatLayoutConfig,
  assets: CertificateAssets
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = assets.canvasWidth;
  canvas.height = assets.canvasHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Gagal membuat konteks canvas 2D");

  if (page === "back") {
    drawJpTablePageOnCanvas(
      ctx,
      assets.canvasWidth,
      assets.canvasHeight,
      kegiatan,
      config,
      assets.ttd1Img,
      assets.ttd2Img,
      assets.ttd3Img,
      assets.templateJpImg,
      assets.logoBackImg,
      assets.ttdBack1Img,
      assets.ttdBack2Img,
      assets.ttdBack3Img
    );
  } else {
    drawCertificateOnCanvas(
      ctx,
      assets.canvasWidth,
      assets.canvasHeight,
      assets.templateImg,
      kegiatan,
      nameText,
      config,
      assets.ttd1Img,
      assets.ttd2Img,
      assets.ttd3Img,
      assets.logoFrontImg
    );
  }

  return canvas;
}

/**
 * Draw a clean dashed cutting line with scissor icons across the center of an A4 canvas
 */
export function drawCanvasCuttingLine(ctx: CanvasRenderingContext2D, width: number, y: number) {
  ctx.save();
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = Math.max(2, Math.round(width * 0.001));
  ctx.setLineDash([16, 12]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(width, y);
  ctx.stroke();

  // Subtle guides
  const fontSize = Math.max(14, Math.round(width * 0.011));
  ctx.font = `600 ${fontSize}px sans-serif`;
  ctx.fillStyle = "#64748b";
  ctx.textBaseline = "middle";

  ctx.textAlign = "left";
  ctx.fillText(" ✂ Potong di sini (Ukuran A5)", 20, y - fontSize * 0.8);

  ctx.textAlign = "right";
  ctx.fillText("Garis Panduan A5 ✂ ", width - 20, y - fontSize * 0.8);

  ctx.restore();
}

/**
 * Combine two A5 landscape canvases into a single A4 portrait canvas (2-in-1 layout)
 */
export function createA4TwoInOneCanvas(
  topCanvas: HTMLCanvasElement,
  bottomCanvas: HTMLCanvasElement | null,
  withCuttingLine: boolean = true
): HTMLCanvasElement {
  const a4Canvas = document.createElement("canvas");
  const a4Width = topCanvas.width;
  const a5Height = topCanvas.height;
  const a4Height = a5Height * 2;

  a4Canvas.width = a4Width;
  a4Canvas.height = a4Height;

  const ctx = a4Canvas.getContext("2d");
  if (!ctx) throw new Error("Gagal membuat canvas A4");

  // Solid white background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, a4Width, a4Height);

  // Top A5
  ctx.drawImage(topCanvas, 0, 0, a4Width, a5Height);

  // Bottom A5
  if (bottomCanvas) {
    ctx.drawImage(bottomCanvas, 0, a5Height, a4Width, a5Height);
  } else {
    // Empty placeholder for odd number of recipients
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, a5Height, a4Width, a5Height);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "bold 28px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("(Halaman Kosong)", a4Width / 2, a5Height + a5Height / 2);
  }

  // Cutting guide line in the middle
  if (withCuttingLine) {
    drawCanvasCuttingLine(ctx, a4Width, a5Height);
  }

  return a4Canvas;
}

/**
 * Add an A4 2-in-1 page (2x A5) to a jsPDF instance in portrait orientation
 */
export function addA4TwoInOnePageToPdf(
  pdf: jsPDF,
  topImgData: string,
  bottomImgData: string | null,
  options: {
    withCuttingLine?: boolean;
    isFirstPage?: boolean;
  }
) {
  if (!options.isFirstPage) {
    pdf.addPage([210, 297], "portrait");
  }

  const pageW = 210;
  const halfH = 148.5;

  // Draw Top A5 (0 to 148.5 mm)
  pdf.addImage(topImgData, "JPEG", 0, 0, pageW, halfH, undefined, "FAST");

  // Draw Bottom A5 (148.5 to 297 mm)
  if (bottomImgData) {
    pdf.addImage(bottomImgData, "JPEG", 0, halfH, pageW, halfH, undefined, "FAST");
  }

  // Cutting line in the middle
  if (options.withCuttingLine !== false) {
    pdf.saveGraphicsState();
    pdf.setDrawColor(148, 163, 184);
    pdf.setLineWidth(0.25);
    pdf.setLineDashPattern([2, 1.5], 0);
    pdf.line(0, halfH, pageW, halfH);

    pdf.setFontSize(6.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text("✂ Potong di sini (Ukuran A5)", 5, halfH - 1.2);
    pdf.text("Garis Panduan A5 ✂", pageW - 5, halfH - 1.2, { align: "right" });
    pdf.restoreGraphicsState();
  }
}

/**
 * Helper to trigger browser file download
 */
export function triggerFileDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Export a single certificate with support for standard or A4 2-in-1, and PDF or PNG format
 */
export async function exportSingleCertificate(options: SingleExportOptions): Promise<void> {
  const {
    kegiatan,
    userNameOverride,
    config,
    paperSize,
    fileFormat,
    layout2in1 = "duplicate",
    pageOption = "both",
    withCuttingLine = true
  } = options;

  const assets = await loadCertificateAssets(config);
  const recipientName = userNameOverride || kegiatan.user_nama || "Penerima SMAN 19";
  const formattedName = toSentenceCase(recipientName);
  const safeName = formattedName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");
  const activityName = (kegiatan.nama_kegiatan || "KEGIATAN").toUpperCase().replace(/\s+/g, "_");
  const hasJp = config.hasJpPage && (config.materiJpRows?.length > 0 || (kegiatan.materi_jp && kegiatan.materi_jp.length > 0));

  // --- CASE 1: A4 2-IN-1 (2 SERTIFIKAT A5 DALAM 1 KERTAS A4) ---
  if (paperSize === "a4_2in1") {
    let topCanvas: HTMLCanvasElement;
    let bottomCanvas: HTMLCanvasElement;

    if (layout2in1 === "front_back" && hasJp) {
      // Top = Front, Bottom = Back (JP)
      topCanvas = renderCertificatePageToCanvas(kegiatan, recipientName, "front", config, assets);
      bottomCanvas = renderCertificatePageToCanvas(kegiatan, recipientName, "back", config, assets);
    } else {
      // Duplicate 2 rangkap identik (Top = Front, Bottom = Front)
      const targetPage = pageOption === "back" && hasJp ? "back" : "front";
      topCanvas = renderCertificatePageToCanvas(kegiatan, recipientName, targetPage, config, assets);
      bottomCanvas = renderCertificatePageToCanvas(kegiatan, recipientName, targetPage, config, assets);
    }

    if (fileFormat === "png") {
      const a4Canvas = createA4TwoInOneCanvas(topCanvas, bottomCanvas, withCuttingLine);
      const blob = await new Promise<Blob | null>((resolve) => a4Canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Gagal membuat gambar PNG");
      const modeLabel = layout2in1 === "front_back" ? "Depan_Belakang" : "2Rangkap";
      triggerFileDownload(blob, `SERTIFIKAT_A4_2in1_${activityName}_${safeName}_${modeLabel}.png`);
    } else {
      // PDF format
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      const topImg = topCanvas.toDataURL("image/jpeg", 0.95);
      const btmImg = bottomCanvas.toDataURL("image/jpeg", 0.95);
      addA4TwoInOnePageToPdf(pdf, topImg, btmImg, { withCuttingLine, isFirstPage: true });

      const modeLabel = layout2in1 === "front_back" ? "Depan_Belakang" : "2Rangkap";
      const blob = pdf.output("blob");
      triggerFileDownload(blob, `SERTIFIKAT_A4_2in1_${activityName}_${safeName}_${modeLabel}.pdf`);
    }
    return;
  }

  // --- CASE 2: STANDARD (1 SERTIFIKAT PER LEMBAR) ---
  if (fileFormat === "png") {
    if (pageOption === "back" && hasJp) {
      const canvas = renderCertificatePageToCanvas(kegiatan, recipientName, "back", config, assets);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Gagal membuat PNG");
      triggerFileDownload(blob, `SERTIFIKAT_${activityName}_${safeName}_Belakang.png`);
    } else if (pageOption === "front" || !hasJp) {
      const canvas = renderCertificatePageToCanvas(kegiatan, recipientName, "front", config, assets);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Gagal membuat PNG");
      triggerFileDownload(blob, `SERTIFIKAT_${activityName}_${safeName}_Depan.png`);
    } else {
      // Both pages: package both PNGs into a zip
      const zip = new JSZip();
      const frontCanvas = renderCertificatePageToCanvas(kegiatan, recipientName, "front", config, assets);
      const backCanvas = renderCertificatePageToCanvas(kegiatan, recipientName, "back", config, assets);

      const [frontBlob, backBlob] = await Promise.all([
        new Promise<Blob | null>((resolve) => frontCanvas.toBlob(resolve, "image/png")),
        new Promise<Blob | null>((resolve) => backCanvas.toBlob(resolve, "image/png"))
      ]);

      if (frontBlob) zip.file(`SERTIFIKAT_${safeName}_Depan.png`, frontBlob);
      if (backBlob) zip.file(`SERTIFIKAT_${safeName}_Belakang.png`, backBlob);

      const zipBlob = await zip.generateAsync({ type: "blob" });
      triggerFileDownload(zipBlob, `SERTIFIKAT_${activityName}_${safeName}_PNG.zip`);
    }
    return;
  }

  // Standard PDF format
  const canvasWidth = assets.canvasWidth;
  const canvasHeight = assets.canvasHeight;

  if (pageOption === "back" && hasJp) {
    const canvas = renderCertificatePageToCanvas(kegiatan, recipientName, "back", config, assets);
    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [canvasWidth, canvasHeight], compress: true });
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, canvasWidth, canvasHeight);
    triggerFileDownload(pdf.output("blob"), `SERTIFIKAT_${activityName}_${safeName}_Belakang.pdf`);
  } else if (pageOption === "both" && hasJp) {
    const frontCanvas = renderCertificatePageToCanvas(kegiatan, recipientName, "front", config, assets);
    const backCanvas = renderCertificatePageToCanvas(kegiatan, recipientName, "back", config, assets);

    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [canvasWidth, canvasHeight], compress: true });
    pdf.addImage(frontCanvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, canvasWidth, canvasHeight);
    pdf.addPage([canvasWidth, canvasHeight], "landscape");
    pdf.addImage(backCanvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, canvasWidth, canvasHeight);
    triggerFileDownload(pdf.output("blob"), `SERTIFIKAT_${activityName}_${safeName}.pdf`);
  } else {
    const frontCanvas = renderCertificatePageToCanvas(kegiatan, recipientName, "front", config, assets);
    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [canvasWidth, canvasHeight], compress: true });
    pdf.addImage(frontCanvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, canvasWidth, canvasHeight);
    triggerFileDownload(pdf.output("blob"), `SERTIFIKAT_${activityName}_${safeName}_Depan.pdf`);
  }
}

/**
 * Export all certificates in a folder (batch) with support for standard or A4 2-in-1, and PDF or PNG format
 */
export async function exportBatchCertificates(options: BatchExportOptions): Promise<void> {
  const {
    folderName,
    items,
    config,
    paperSize,
    fileFormat,
    pageOption,
    withCuttingLine = true,
    onProgress
  } = options;

  if (!items || items.length === 0) {
    throw new Error("Tidak ada data penerima sertifikat untuk diekspor");
  }

  const assets = await loadCertificateAssets(config);
  const safeFolder = folderName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");
  const hasJp = config.hasJpPage && (config.materiJpRows?.length > 0 || items.some((i) => i.materi_jp && i.materi_jp.length > 0));

  // --- BATCH CASE 1: A4 2-IN-1 (2 PENERIMA PER LEMBAR A4) ---
  if (paperSize === "a4_2in1") {
    // Total A4 pages needed = Math.ceil(items.length / 2)
    const totalPairs = Math.ceil(items.length / 2);

    if (fileFormat === "pdf") {
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      let pageCount = 0;

      for (let p = 0; p < totalPairs; p++) {
        const item1 = items[p * 2];
        const item2 = items[p * 2 + 1] || null;

        onProgress?.(p * 2 + 1, items.length, `Memproses lembar A4 ${p + 1} dari ${totalPairs}...`);

        const name1 = item1.user_nama || "Penerima SMAN 19";
        const name2 = item2 ? item2.user_nama || "Penerima SMAN 19" : null;

        if (pageOption === "back" && hasJp) {
          // Both are back pages
          const topC = renderCertificatePageToCanvas(item1, name1, "back", config, assets);
          const btmC = item2 ? renderCertificatePageToCanvas(item2, name2!, "back", config, assets) : null;
          const topImg = topC.toDataURL("image/jpeg", 0.95);
          const btmImg = btmC ? btmC.toDataURL("image/jpeg", 0.95) : null;

          addA4TwoInOnePageToPdf(pdf, topImg, btmImg, { withCuttingLine, isFirstPage: pageCount === 0 });
          pageCount++;
        } else if (pageOption === "both" && hasJp) {
          // DUPLEX-READY:
          // Page A (Depan): Top = Item 1 Depan, Bottom = Item 2 Depan
          // Page B (Belakang): Top = Item 1 Belakang, Bottom = Item 2 Belakang
          const topFront = renderCertificatePageToCanvas(item1, name1, "front", config, assets);
          const btmFront = item2 ? renderCertificatePageToCanvas(item2, name2!, "front", config, assets) : null;
          addA4TwoInOnePageToPdf(
            pdf,
            topFront.toDataURL("image/jpeg", 0.95),
            btmFront ? btmFront.toDataURL("image/jpeg", 0.95) : null,
            { withCuttingLine, isFirstPage: pageCount === 0 }
          );
          pageCount++;

          const topBack = renderCertificatePageToCanvas(item1, name1, "back", config, assets);
          const btmBack = item2 ? renderCertificatePageToCanvas(item2, name2!, "back", config, assets) : null;
          addA4TwoInOnePageToPdf(
            pdf,
            topBack.toDataURL("image/jpeg", 0.95),
            btmBack ? btmBack.toDataURL("image/jpeg", 0.95) : null,
            { withCuttingLine, isFirstPage: false }
          );
          pageCount++;
        } else {
          // Front only
          const topC = renderCertificatePageToCanvas(item1, name1, "front", config, assets);
          const btmC = item2 ? renderCertificatePageToCanvas(item2, name2!, "front", config, assets) : null;
          const topImg = topC.toDataURL("image/jpeg", 0.95);
          const btmImg = btmC ? btmC.toDataURL("image/jpeg", 0.95) : null;

          addA4TwoInOnePageToPdf(pdf, topImg, btmImg, { withCuttingLine, isFirstPage: pageCount === 0 });
          pageCount++;
        }
      }

      onProgress?.(items.length, items.length, "Menyiapkan unduhan PDF...");
      const blob = pdf.output("blob");
      triggerFileDownload(blob, `SERTIFIKAT_A4_2in1_${safeFolder}_Semua_Penerima.pdf`);
      return;
    }

    // PNG batch for 2-in-1: download as ZIP of A4 PNG images
    const zip = new JSZip();

    for (let p = 0; p < totalPairs; p++) {
      const item1 = items[p * 2];
      const item2 = items[p * 2 + 1] || null;

      onProgress?.(p * 2 + 1, items.length, `Membuat gambar A4 ke-${p + 1} dari ${totalPairs}...`);

      const name1 = item1.user_nama || "Penerima SMAN 19";
      const name2 = item2 ? item2.user_nama || "Penerima SMAN 19" : null;
      const safe1 = toSentenceCase(name1).replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");
      const safe2 = item2 ? toSentenceCase(name2!).replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_") : "Kosong";

      if (pageOption === "back" && hasJp) {
        const topC = renderCertificatePageToCanvas(item1, name1, "back", config, assets);
        const btmC = item2 ? renderCertificatePageToCanvas(item2, name2!, "back", config, assets) : null;
        const a4Canvas = createA4TwoInOneCanvas(topC, btmC, withCuttingLine);
        const blob = await new Promise<Blob | null>((resolve) => a4Canvas.toBlob(resolve, "image/png"));
        if (blob) zip.file(`Lembar_A4_${p + 1}_Belakang_${safe1}_${safe2}.png`, blob);
      } else if (pageOption === "both" && hasJp) {
        const topFront = renderCertificatePageToCanvas(item1, name1, "front", config, assets);
        const btmFront = item2 ? renderCertificatePageToCanvas(item2, name2!, "front", config, assets) : null;
        const a4Front = createA4TwoInOneCanvas(topFront, btmFront, withCuttingLine);
        const frontBlob = await new Promise<Blob | null>((resolve) => a4Front.toBlob(resolve, "image/png"));
        if (frontBlob) zip.file(`Lembar_A4_${p + 1}_Halaman_1_Depan_${safe1}_${safe2}.png`, frontBlob);

        const topBack = renderCertificatePageToCanvas(item1, name1, "back", config, assets);
        const btmBack = item2 ? renderCertificatePageToCanvas(item2, name2!, "back", config, assets) : null;
        const a4Back = createA4TwoInOneCanvas(topBack, btmBack, withCuttingLine);
        const backBlob = await new Promise<Blob | null>((resolve) => a4Back.toBlob(resolve, "image/png"));
        if (backBlob) zip.file(`Lembar_A4_${p + 1}_Halaman_2_Belakang_${safe1}_${safe2}.png`, backBlob);
      } else {
        const topC = renderCertificatePageToCanvas(item1, name1, "front", config, assets);
        const btmC = item2 ? renderCertificatePageToCanvas(item2, name2!, "front", config, assets) : null;
        const a4Canvas = createA4TwoInOneCanvas(topC, btmC, withCuttingLine);
        const blob = await new Promise<Blob | null>((resolve) => a4Canvas.toBlob(resolve, "image/png"));
        if (blob) zip.file(`Lembar_A4_${p + 1}_Depan_${safe1}_${safe2}.png`, blob);
      }
    }

    onProgress?.(items.length, items.length, "Mengompresi berkas ZIP...");
    const zipBlob = await zip.generateAsync({ type: "blob" });
    triggerFileDownload(zipBlob, `Sertifikat_A4_2in1_${safeFolder}_PNG.zip`);
    return;
  }

  // --- BATCH CASE 2: STANDARD (1 SERTIFIKAT PER LEMBAR) ---
  const canvasWidth = assets.canvasWidth;
  const canvasHeight = assets.canvasHeight;

  if (fileFormat === "pdf") {
    let pdf: jsPDF | null = null;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      onProgress?.(i + 1, items.length, `Menambahkan halaman ${i + 1} dari ${items.length}...`);

      const nameText = item.user_nama || "Penerima SMAN 19";
      const itemHasJp = config.hasJpPage && (config.materiJpRows?.length > 0 || (item.materi_jp && item.materi_jp.length > 0));

      if (pageOption === "back" && itemHasJp) {
        const c = renderCertificatePageToCanvas(item, nameText, "back", config, assets);
        const imgData = c.toDataURL("image/jpeg", 0.95);
        if (!pdf) {
          pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [canvasWidth, canvasHeight], compress: true });
        } else {
          pdf.addPage([canvasWidth, canvasHeight], "landscape");
        }
        pdf.addImage(imgData, "JPEG", 0, 0, canvasWidth, canvasHeight);
      } else if (pageOption === "back" && !itemHasJp) {
        continue;
      } else {
        const c = renderCertificatePageToCanvas(item, nameText, "front", config, assets);
        const imgData = c.toDataURL("image/jpeg", 0.95);
        if (!pdf) {
          pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [canvasWidth, canvasHeight], compress: true });
        } else {
          pdf.addPage([canvasWidth, canvasHeight], "landscape");
        }
        pdf.addImage(imgData, "JPEG", 0, 0, canvasWidth, canvasHeight);

        if (itemHasJp && pageOption === "both") {
          const c2 = renderCertificatePageToCanvas(item, nameText, "back", config, assets);
          const imgData2 = c2.toDataURL("image/jpeg", 0.95);
          pdf.addPage([canvasWidth, canvasHeight], "landscape");
          pdf.addImage(imgData2, "JPEG", 0, 0, canvasWidth, canvasHeight);
        }
      }
    }

    if (pdf) {
      onProgress?.(items.length, items.length, "Menyiapkan file PDF...");
      triggerFileDownload(pdf.output("blob"), `Sertifikat_${safeFolder}_Semua_Penerima.pdf`);
    }
    return;
  }

  // Standard PNG: ZIP of individual PNG files
  const zip = new JSZip();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress?.(i + 1, items.length, `Memproses gambar ${i + 1} dari ${items.length}...`);

    const nameText = item.user_nama || "Penerima SMAN 19";
    const safeName = toSentenceCase(nameText).replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");
    const itemHasJp = config.hasJpPage && (config.materiJpRows?.length > 0 || (item.materi_jp && item.materi_jp.length > 0));

    if (pageOption === "back" && itemHasJp) {
      const c = renderCertificatePageToCanvas(item, nameText, "back", config, assets);
      const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/png"));
      if (blob) zip.file(`SERTIFIKAT_${safeName}_Belakang.png`, blob);
    } else if (pageOption === "back" && !itemHasJp) {
      continue;
    } else {
      const c = renderCertificatePageToCanvas(item, nameText, "front", config, assets);
      const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/png"));
      if (blob) zip.file(`SERTIFIKAT_${safeName}_Depan.png`, blob);

      if (itemHasJp && pageOption === "both") {
        const c2 = renderCertificatePageToCanvas(item, nameText, "back", config, assets);
        const blob2 = await new Promise<Blob | null>((resolve) => c2.toBlob(resolve, "image/png"));
        if (blob2) zip.file(`SERTIFIKAT_${safeName}_Belakang.png`, blob2);
      }
    }
  }

  onProgress?.(items.length, items.length, "Mengompresi berkas ZIP...");
  const zipBlob = await zip.generateAsync({ type: "blob" });
  triggerFileDownload(zipBlob, `Sertifikat_${safeFolder}_PNG.zip`);
}
