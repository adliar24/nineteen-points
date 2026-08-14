import fs from "fs";
import path from "path";

const jsonPath = path.resolve("./kumpulan_data_qr_murid.json");
const rawData = fs.readFileSync(jsonPath, "utf-8");
const students = JSON.parse(rawData);

// Collect unique classes
const classesSet = new Set(students.map((s) => s.kelas));
const classes = Array.from(classesSet).sort();

const htmlContent = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kumpulan Data QR Code Murid SMAN 19 Bandung</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
    body { font-family: 'Plus Jakarta Sans', sans-serif; }
    @media print {
      .no-print { display: none !important; }
      .print-grid { display: grid !important; grid-template-columns: repeat(3, 1fr) !important; gap: 1rem !important; }
      .qr-card { break-inside: avoid; page-break-inside: avoid; border: 1px solid #cbd5e1 !important; shadow: none !important; }
    }
  </style>
</head>
<body class="bg-slate-900 text-slate-100 min-h-screen pb-12">

  <!-- HEADER -->
  <header class="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 font-bold text-lg">
            QR
          </div>
          <div>
            <h1 class="text-xl font-bold text-white tracking-tight">Kumpulan Data QR Murid</h1>
            <p class="text-xs text-slate-400">Total ${students.length} Siswa Terdaftar • Standardized Payload: <code class="text-purple-300 bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-800/50">NIS</code></p>
          </div>
        </div>
      </div>

      <!-- ACTIONS -->
      <div class="flex flex-wrap items-center gap-2 no-print">
        <button onclick="window.print()" class="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-purple-600/20 transition flex items-center gap-2 cursor-pointer">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
          Cetak / Download PDF
        </button>
        <a href="./kumpulan_data_qr_murid.json" download class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 transition flex items-center gap-2">
          Download JSON
        </a>
        <a href="./kumpulan_data_qr_murid.csv" download class="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-xs rounded-xl shadow-lg shadow-emerald-700/20 transition flex items-center gap-2">
          Download CSV
        </a>
      </div>
    </div>
  </header>

  <!-- SUMMARY INFO BOX -->
  <main class="max-w-7xl mx-auto px-4 mt-6">
    <div class="bg-gradient-to-r from-purple-900/40 to-slate-900 border border-purple-500/30 rounded-2xl p-5 mb-6 no-print">
      <h2 class="text-base font-bold text-purple-300 mb-2 flex items-center gap-2">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        Spesifikasi Format QR Code Murid (Universal Integration)
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-300 mt-3">
        <div class="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
          <span class="text-slate-400 block mb-1 font-semibold">QR Payload Format</span>
          <span class="font-mono text-purple-400 font-bold text-sm">Plain Text (NIS)</span>
          <p class="text-[11px] text-slate-400 mt-1">Contoh: <code class="text-white">262710001</code>. Tidak memakai prefix khusus atau enkripsi.</p>
        </div>
        <div class="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
          <span class="text-slate-400 block mb-1 font-semibold">Kunci Pencarian Di DB</span>
          <span class="font-mono text-emerald-400 font-bold text-sm">nis atau id</span>
          <p class="text-[11px] text-slate-400 mt-1">Saat scanner membaca QR, sistem cukup query kolom <code class="text-white">nis</code> untuk mengidentifikasi murid.</p>
        </div>
        <div class="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
          <span class="text-slate-400 block mb-1 font-semibold">Kesesuaian Aplikasi Lain</span>
          <span class="font-mono text-amber-400 font-bold text-sm">100% Compatible</span>
          <p class="text-[11px] text-slate-400 mt-1">Aplikasi lain tinggal encode string NIS yang sama ke QR Code.</p>
        </div>
      </div>
    </div>

    <!-- FILTER BAR -->
    <div class="flex flex-col md:flex-row items-center justify-between gap-4 mb-6 no-print">
      <div class="flex flex-wrap items-center gap-3 w-full md:w-auto">
        <div class="relative flex-1 md:w-80">
          <input type="text" id="searchInput" placeholder="Cari nama, NIS, atau kelas..." oninput="filterData()"
            class="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition">
        </div>
        <select id="classFilter" onchange="filterData()"
          class="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition">
          <option value="Semua">Semua Kelas (${classes.length} Kelas)</option>
          ${classes.map((c) => `<option value="${c}">Kelas ${c}</option>`).join("")}
        </select>
      </div>

      <div class="text-xs text-slate-400">
        Menampilkan <span id="countDisplay" class="font-bold text-white">${students.length}</span> dari ${students.length} siswa
      </div>
    </div>

    <!-- GRID DISPLAY -->
    <div id="studentGrid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 print-grid">
    </div>
  </main>

  <script>
    const allStudents = ${JSON.stringify(students)};
    let renderedCount = 0;
    const itemsPerBatch = 60;
    let filteredStudents = [...allStudents];

    function renderCards(reset = true) {
      const container = document.getElementById('studentGrid');
      if (reset) {
        container.innerHTML = '';
        renderedCount = 0;
      }

      const batch = filteredStudents.slice(renderedCount, renderedCount + itemsPerBatch);
      
      batch.forEach(student => {
        const card = document.createElement('div');
        card.className = 'qr-card bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4 flex flex-col items-center justify-between shadow-lg relative hover:border-purple-500/50 transition';
        card.innerHTML = \`
          <div class="w-full flex items-center justify-between mb-3 text-xs">
            <span class="bg-purple-950/80 text-purple-300 font-bold px-2 py-0.5 rounded border border-purple-800/50">
              \${student.kelas}
            </span>
            <span class="text-slate-400 font-mono text-[11px]">No. \${student.no}</span>
          </div>

          <div class="bg-white p-2.5 rounded-xl mb-3 border-2 border-purple-900 shadow-inner flex items-center justify-center">
            <div id="qr-\${student.id}"></div>
          </div>

          <div class="text-center w-full">
            <h3 class="font-bold text-sm text-white truncate px-1" title="\${student.nama}">\${student.nama}</h3>
            <p class="text-xs text-purple-400 font-mono font-semibold mt-0.5">NIS: \${student.nis}</p>
          </div>
        \`;
        container.appendChild(card);

        // Render QR
        new QRCode(document.getElementById(\`qr-\${student.id}\`), {
          text: student.nis,
          width: 110,
          height: 110,
          colorDark: "#3b0764",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.M
        });
      });

      renderedCount += batch.length;

      // Lazy load remaining when scrolling near bottom if there are more
      if (renderedCount < filteredStudents.length && !window.hasScrollListener) {
        window.hasScrollListener = true;
        window.addEventListener('scroll', () => {
          if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
            if (renderedCount < filteredStudents.length) {
              renderCards(false);
            }
          }
        });
      }
    }

    function filterData() {
      const search = document.getElementById('searchInput').value.toLowerCase();
      const selectedClass = document.getElementById('classFilter').value;

      filteredStudents = allStudents.filter(s => {
        const matchesSearch = s.nama.toLowerCase().includes(search) || 
                              s.nis.includes(search) || 
                              s.kelas.toLowerCase().includes(search);
        const matchesClass = selectedClass === 'Semua' || s.kelas === selectedClass;
        return matchesSearch && matchesClass;
      });

      document.getElementById('countDisplay').textContent = filteredStudents.length;
      renderCards(true);
    }

    // Initial render
    renderCards(true);
  </script>
</body>
</html>`;

const htmlPath = path.resolve("./kumpulan_data_qr_murid.html");
fs.writeFileSync(htmlPath, htmlContent, "utf-8");
console.log(`Saved HTML: ${htmlPath}`);
