export function compressImage(file: File, maxWidth = 300, maxHeight = 400, quality = 0.75): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error(`File "${file.name}" bukan file gambar (tipe: ${file.type || "tidak diketahui"})`));
      return;
    }

    const objectUrl = URL.createObjectURL(file);

    const cleanupAndReject = (msg: string) => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(msg));
    };

    const img = new window.Image();
    img.onload = () => {
      try {
        const targetRatio = maxWidth / maxHeight;
        const canvas = document.createElement("canvas");
        canvas.width = maxWidth;
        canvas.height = maxHeight;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          cleanupAndReject("Gagal membuat context canvas");
          return;
        }

        const sourceWidth = img.naturalWidth;
        const sourceHeight = img.naturalHeight;

        if (sourceWidth === 0 || sourceHeight === 0) {
          cleanupAndReject(`Gambar memiliki dimensi 0x0. File "${file.name}" mungkin korup.`);
          return;
        }

        let sWidth = sourceWidth;
        let sHeight = sourceHeight;
        let sx = 0;
        let sy = 0;

        if (sourceWidth / sourceHeight > targetRatio) {
          sWidth = sourceHeight * targetRatio;
          sx = (sourceWidth - sWidth) / 2;
        } else {
          sHeight = sourceWidth / targetRatio;
          sy = (sourceHeight - sHeight) / 2;
        }

        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, maxWidth, maxHeight);
        URL.revokeObjectURL(objectUrl);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Gagal mengompresi gambar ke JPEG"));
            }
          },
          "image/jpeg",
          quality
        );
      } catch (drawErr: any) {
        cleanupAndReject("Gagal memproses gambar: " + drawErr.message);
      }
    };
    img.onerror = () => {
      cleanupAndReject(`Gagal membaca file gambar "${file.name}". Pastikan format file valid (JPG/PNG/WebP) dan bukan HEIC/HEIF.`);
    };
    img.src = objectUrl;
  });
}
