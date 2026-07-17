interface RoleBadgeProps {
  role: string;
  className?: string;
}

const ROLE_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  super_admin:      { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", label: "SUPER ADMIN" },
  kepala_sekolah:   { bg: "bg-slate-50",  text: "text-slate-700",  border: "border-slate-200",  label: "KEPALA SEKOLAH" },
  guru:             { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200",  label: "GURU" },
  piket:            { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200",   label: "PIKET" },
  siswa:            { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", label: "SISWA" },
};

export default function RoleBadge({ role, className = "" }: RoleBadgeProps) {
  const style = ROLE_STYLES[role] || ROLE_STYLES.siswa;
  return (
    <span
      className={`font-black text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-xl border shadow-xs whitespace-nowrap inline-block ${style.bg} ${style.text} ${style.border} ${className}`}
    >
      {style.label}
    </span>
  );
}
