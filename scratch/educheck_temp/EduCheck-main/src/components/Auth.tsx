import React, { useState } from 'react';
import { getSupabaseClient } from '../services/supabase';
import { Button, Input } from './UI';
import { Mail, Lock, LogIn, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface Props {
  onSuccess: (user: any) => Promise<void>;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

export const Auth: React.FC<Props> = ({ onSuccess, notify }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      notify("Berhasil masuk ke akun EduCheck", "success");
      // Tunggu sampai App.tsx selesai tarik data cloud
      await onSuccess(data.user);
    } catch (err: any) {
      console.error(err);
      notify(err.message || "Terjadi kesalahan pada layanan autentikasi", "error");
      setLoading(false);
    }
    // Catatan: setLoading(false) tidak dipanggil di finally jika berhasil, 
    // karena halaman akan berpindah/unmount. 
    // Kita panggil di catch saja jika gagal.
  };

  return (
    <motion.div
      className="flex flex-col gap-6 py-2"
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.06 } }
      }}
    >
      <motion.div
        className="text-center"
        variants={{
          hidden: { opacity: 0, y: 8 },
          show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } }
        }}
      >
        <h3 className="text-xl font-bold text-gray-900">Masuk ke Akun Guru</h3>
        <p className="text-sm text-gray-500 mt-1">Gunakan akun yang dibuat di Supabase untuk masuk.</p>
      </motion.div>

      <motion.form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
        variants={{
          hidden: { opacity: 0, y: 8 },
          show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } }
        }}
      >
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-500 flex items-center gap-1.5 ml-1">
            <Mail className="w-3 h-3" /> Email
          </label>
          <Input 
            type="email" 
            placeholder="nama@email.com" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            required 
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-500 flex items-center gap-1.5 ml-1">
            <Lock className="w-3 h-3" /> Password
          </label>
          <Input 
            type="password" 
            placeholder="••••••••" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            required 
          />
        </div>

        <Button 
          type="submit" 
          isLoading={loading} 
          className="w-full !py-3.5 mt-2"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
          ) : (
            <LogIn className="w-5 h-5 mr-2" />
          )}
          Masuk
        </Button>
      </motion.form>
    </motion.div>
  );
};
