import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '../../utils/supabase/server';
import DashboardClient from './DashboardClient';

export const revalidate = 0; // Disable caching to ensure real-time points represent current state

export default async function DashboardPage() {
  const supabase = createClient();

  // 1. Ambil data user yang sedang aktif secara aman di Server-Side
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 2. Proteksi rute server: Jika tidak ada session, redirect ke login
  if (!user) {
    redirect('/login');
  }

  // 3. Ambil data awal siswa dari database Supabase PostgreSQL
  const { data: initialSiswa, error: siswaError } = await supabase
    .from('siswa')
    .select('*')
    .order('nama', { ascending: true });

  if (siswaError) {
    console.error('Error fetching students:', siswaError);
  }

  // 4. Ambil master bobot poin baku dari Supabase PostgreSQL
  const { data: initialMasterPoin, error: masterError } = await supabase
    .from('master_poin')
    .select('*')
    .order('nilai_poin', { ascending: false });

  if (masterError) {
    console.error('Error fetching master points:', masterError);
  }

  return (
    <DashboardClient
      userEmail={user.email || 'guru@sma19.sch.id'}
      initialSiswa={initialSiswa || []}
      initialMasterPoin={initialMasterPoin || []}
    />
  );
}
