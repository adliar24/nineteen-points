import React from "react";

interface SkeletonProps {
  type: "metrics" | "table" | "card" | "list";
  count?: number;
}

export default React.memo(function SkeletonLoader({ type, count = 3 }: SkeletonProps) {
  if (type === "metrics") {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 animate-pulse">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white p-5 rounded-3xl border border-brand-100/60 space-y-3">
            <div className="w-8 h-8 rounded-xl bg-slate-200" />
            <div className="h-3 w-16 bg-slate-200 rounded-md" />
            <div className="h-6 w-12 bg-slate-200 rounded-md" />
          </div>
        ))}
      </div>
    );
  }

  if (type === "table") {
    return (
      <div className="bg-white rounded-3xl border border-brand-100/60 overflow-hidden animate-pulse">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-brand-50/40 border-b border-brand-100">
              <th className="py-3 px-4"><div className="h-3 w-24 bg-slate-200 rounded-md" /></th>
              <th className="py-3 px-4"><div className="h-3 w-24 bg-slate-200 rounded-md" /></th>
              <th className="py-3 px-4"><div className="h-3 w-24 bg-slate-200 rounded-md" /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {Array.from({ length: count }).map((_, i) => (
              <tr key={i}>
                <td className="py-3.5 px-4"><div className="h-3.5 w-28 bg-slate-100 rounded-md" /></td>
                <td className="py-3.5 px-4"><div className="h-3.5 w-36 bg-slate-100 rounded-md" /></td>
                <td className="py-3.5 px-4 text-center"><div className="h-5 w-10 bg-slate-100 rounded-full mx-auto" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (type === "card") {
    return (
      <div className="bg-white rounded-[32px] border border-brand-200 p-6 space-y-5 animate-pulse max-w-[290px] w-full aspect-[1/1.58] mx-auto flex flex-col justify-between py-8 px-5 shadow-lg">
        {/* Header wave-like shape */}
        <div className="h-10 w-full bg-slate-200 rounded-xl" />
        {/* Profile Avatar */}
        <div className="w-18 h-24 bg-slate-200 rounded-2xl mx-auto" />
        {/* Title & Info */}
        <div className="space-y-2">
          <div className="h-4 w-3/4 bg-slate-200 rounded-md mx-auto" />
          <div className="h-3 w-1/2 bg-slate-200 rounded-md mx-auto" />
        </div>
        {/* QR Code */}
        <div className="w-24 h-24 bg-slate-200 rounded-2xl mx-auto" />
      </div>
    );
  }

  if (type === "list") {
    return (
      <div className="space-y-3.5 animate-pulse">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="bg-white p-4.5 rounded-3xl border border-brand-100/60 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-slate-200" />
              <div className="space-y-2">
                <div className="h-3 w-28 bg-slate-200 rounded-md" />
                <div className="h-2 w-16 bg-slate-200 rounded-md" />
              </div>
            </div>
            <div className="h-5 w-10 bg-slate-200 rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  return null;
});
