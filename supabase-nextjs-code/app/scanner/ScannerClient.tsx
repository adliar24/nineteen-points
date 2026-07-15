'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { createClient } from '../../utils/supabase/client';
import { Camera, AlertCircle, Check, Award, X, ShieldCheck } from 'lucide-react';

interface MasterPoin {
  id: string;
  nama_poin: string;
  nilai_poin: number;
}

interface Siswa {
  id: string;
  nis: string;
  nama: string;
  kelas: string;
  total_poin: number;
}

interface ScannerClientProps {
  userEmail: string;
  masterPoin: MasterPoin[];
}

export default function ScannerClient({ userEmail, masterPoin }: ScannerClientProps) {
  const supabase = createClient();
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  const [scannedSiswa, setScannedSiswa] = useState<Siswa | null>(null);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);

  // Form states
  const [selectedPoinId, setSelectedPoinId] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (cameraActive) {
      setScannerError(null);
      const timer = setTimeout(() => {
        try {
          const scanner = new Html5QrcodeScanner(
            'reader-nextjs',
            { fps: 10, qrbox: { width: 250, height: 250 } },
            /* verbose= */ false
          );

          scanner.render(onScanSuccess, onScanFailure);
          scannerRef.current = scanner;
        } catch (err) {
          setScannerError('Gagal mengakses kamera. Mohon berikan izin kamera.');
          setCameraActive(false);
        }
      }, 300);

      return () => {
        clearTimeout(timer);
        if (scannerRef.current) {
          scannerRef.current.clear().catch((e) => console.log(e));
          scannerRef.current = null;
        }
      };
    }
  }, [cameraActive]);

  async function onScanSuccess(decodedText: string) {
    const trimmedNis = decodedText.trim();

    // Query Supabase to find student by NIS
    const { data: student, error } = await supabase
      .from('siswa')
      .select('*')
      .eq('nis', trimmedNis)
      .single();

    if (student) {
      setScannedSiswa(student);
      // Turn off camera
      if (scannerRef.current) {
        scannerRef.current.clear().catch((e) => console.log(e));
        scannerRef.current = null;
        setCameraActive(false);
      }
    } else {
      setScannerError(`QR NIS: "${trimmedNis}" terbaca, namun tidak terdaftar di database SMAN 19.`);
    }
  }

  function onScanFailure() {
    // Standard frame failures are ignored
  }

  const handleApplyPoint = async () => {
    if (!scannedSiswa) return;

    const p = masterPoin.find((item) => item.id === selectedPoinId);
    if (!p) {
      alert('Silakan pilih aturan.');
      return;
    }

    setIsLoading(true);

    try {
      const newScore = scannedSiswa.total_poin + p.nilai_poin;

      // Update student points in Supabase
      const { error: studentErr } = await supabase
        .from('siswa')
        .update({ total_poin: newScore })
        .eq('id', scannedSiswa.id);

      if (studentErr) throw studentErr;

      // Log to history
      const { error: logErr } = await supabase.from('riwayat_poin').insert({
        siswa_id: scannedSiswa.id,
        nilai_diberikan: p.nilai_poin,
        nama_poin: p.nama_poin,
        guru_email: userEmail,
      });

      if (logErr) throw logErr;

      setSuccessMsg(
        `Sukses! ${scannedSiswa.nama} mendapatkan ${p.nilai_poin} poin untuk "${p.nama_poin}".`
      );

      // Locally increment score
      setScannedSiswa({
        ...scannedSiswa,
        total_poin: newScore,
      });
    } catch (err: any) {
      alert(`Gagal: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setScannedSiswa(null);
    setScannerError(null);
    setSuccessMsg('');
    setSelectedPoinId('');
  };

  return (
    <div className="max-w-xl mx-auto bg-white rounded-2xl border border-slate-100 p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Scanner Poin Guru SMAN 19</h1>
        <p className="text-xs text-slate-500 mt-1">
          Tempelkan kartu QR siswa ke kamera untuk melakukan scanning cepat.
        </p>
      </div>

      <div className="bg-emerald-50 text-emerald-800 p-3 rounded-xl text-xs flex justify-between items-center">
        <span>Petugas Aktif: <strong>{userEmail}</strong></span>
        <span className="font-bold bg-emerald-600 text-white px-2 py-0.5 rounded text-[10px]">AKTIF</span>
      </div>

      {!scannedSiswa ? (
        <div className="space-y-4">
          {cameraActive ? (
            <div className="border-2 border-emerald-500 rounded-2xl overflow-hidden aspect-square relative bg-black">
              <div id="reader-nextjs" className="w-full h-full"></div>
              <button
                onClick={() => setCameraActive(false)}
                className="absolute bottom-4 right-4 bg-red-600 text-white text-xs px-4 py-2 rounded-xl"
              >
                Matikan Kamera
              </button>
            </div>
          ) : (
            <div className="border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center flex flex-col items-center">
              <Camera className="w-12 h-12 text-slate-400 mb-3 animate-pulse" />
              <button
                onClick={() => setCameraActive(true)}
                className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl text-sm"
              >
                Aktifkan Kamera QR Scanner
              </button>
            </div>
          )}

          {scannerError && (
            <div className="p-3 bg-amber-50 text-amber-800 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>{scannerError}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-slate-50 p-6 rounded-xl border space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-lg font-bold text-slate-900">{scannedSiswa.nama}</h2>
              <p className="text-xs text-slate-500">NIS: {scannedSiswa.nis} | Kelas: {scannedSiswa.kelas}</p>
            </div>
            <button onClick={handleReset} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="bg-white p-4 rounded-xl flex justify-between items-center">
            <span className="text-xs font-bold text-slate-400 uppercase">Poin Saat Ini</span>
            <span className="text-2xl font-black">{scannedSiswa.total_poin} pts</span>
          </div>

          {successMsg ? (
            <div className="p-3.5 bg-emerald-500 text-white rounded-xl text-xs flex items-center gap-2">
              <Check className="w-4 h-4 bg-emerald-700 rounded-full p-0.5" />
              <span>{successMsg}</span>
            </div>
          ) : (
            <div className="space-y-4 border-t pt-4">
              <label className="text-xs font-bold text-slate-700 uppercase">Input Sanksi / Prestasi</label>
              <select
                value={selectedPoinId}
                onChange={(e) => setSelectedPoinId(e.target.value)}
                className="w-full border p-3 rounded-xl bg-white text-sm focus:ring-1 focus:ring-emerald-500 outline-none"
              >
                <option value="">-- Pilih Aturan Baku --</option>
                {masterPoin.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.nilai_poin}] {p.nama_poin}
                  </option>
                ))}
              </select>

              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 border rounded-xl text-sm hover:bg-slate-100"
                >
                  Scan Lagi
                </button>
                <button
                  onClick={handleApplyPoint}
                  disabled={isLoading}
                  className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold disabled:opacity-50"
                >
                  {isLoading ? 'Menyimpan...' : 'Terapkan Poin'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
