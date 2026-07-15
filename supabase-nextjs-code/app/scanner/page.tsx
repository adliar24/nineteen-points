import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '../../utils/supabase/server';
import ScannerClient from './ScannerClient';

export default async function ScannerPage() {
  const supabase = createClient();

  // 1. Ambil session guru secara aman di Server-Side
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Pre-fetch master poin untuk dropdown opsi pencatatan sanksi/prestasi
  const { data: masterPoin } = await supabase
    .from('master_poin')
    .select('*')
    .order('nilai_poin', { ascending: false });

  return (
    <ScannerClient
      userEmail={user.email || 'guru@sma19.sch.id'}
      masterPoin={masterPoin || []}
    />
  );
}
