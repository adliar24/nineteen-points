# Panduan Implementasi Next.js (App Router) & Supabase SSR - NineTeen Points

Direktori ini berisi kode-kode produksi (production-ready) untuk di-copy dan dikonfigurasi pada proyek **Next.js (App Router) dengan Supabase SSR**.

## 1. Persiapan Database Supabase

Masuk ke panel SQL Editor di dashboard Supabase Anda, lalu jalankan script SQL berikut untuk membuat tabel-tabel sesuai dengan skema NineTeen Points:

```sql
-- 1. Tabel Siswa
CREATE TABLE siswa (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nis TEXT UNIQUE NOT NULL,
  nama TEXT NOT NULL,
  kelas TEXT NOT NULL,
  total_poin INT DEFAULT 100 NOT NULL
);

-- 2. Tabel Master Bobot Poin (Aturan Baku)
CREATE TABLE master_poin (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nama_poin TEXT NOT NULL,
  nilai_poin INT NOT NULL
);

-- 3. Tabel Riwayat Poin Siswa (Audit Logs)
CREATE TABLE riwayat_poin (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  siswa_id UUID REFERENCES siswa(id) ON DELETE CASCADE NOT NULL,
  nilai_diberikan INT NOT NULL,
  nama_poin TEXT NOT NULL,
  guru_email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Mengaktifkan Row Level Security (RLS) demi keamanan
ALTER TABLE siswa ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_poin ENABLE ROW LEVEL SECURITY;
ALTER TABLE riwayat_poin ENABLE ROW LEVEL SECURITY;

-- Policy sederhana: Semua guru yang terautentikasi (authenticated) punya akses penuh
CREATE POLICY "Akses penuh guru terautentikasi" ON siswa
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Akses penuh guru terautentikasi" ON master_poin
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Akses penuh guru terautentikasi" ON riwayat_poin
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

---

## 2. Struktur File Proyek Next.js Anda

Salin file-file dari folder ini ke struktur proyek Next.js Anda sebagai berikut:

```text
/ (root)
├── middleware.ts                 <-- middleware.ts (Proteksi Rute Server)
├── app/
│   ├── layout.tsx
│   ├── login/
│   │   └── page.tsx              <-- login/page.tsx (Halaman Login Guru)
│   └── dashboard/
│       ├── page.tsx              <-- dashboard/page.tsx (Dashboard Utama Roster)
│       └── scanner/
│           └── page.tsx          <-- scanner/page.tsx (QR Scanner Kamera & Integrasi)
└── utils/
    └── supabase/
        ├── client.ts             <-- Supabase Client Component Creator
        └── server.ts             <-- Supabase Server Component Creator
```

---

## 3. Instalasi Dependensi Next.js

Pastikan Anda telah menginstal modul-modul berikut di proyek Next.js Anda:

```bash
npm install @supabase/ssr @supabase/supabase-js lucide-react html5-qrcode qrcode.react jspdf html2canvas
```

## 4. Konfigurasi Client & Server Supabase (SSR Best Practices)

Gunakan pembungkus SSR bawaan Supabase untuk Next.js App Router:

### File: `/utils/supabase/server.ts`
```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component context error handling
          }
        },
      },
    }
  );
}
```

### File: `/utils/supabase/client.ts`
```typescript
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```
