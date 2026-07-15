import React from "react";

interface SkeletonProps {
  type: "metrics" | "table" | "card" | "list";
  count?: number;
}

export default function SkeletonLoader({ type, count = 3 }: SkeletonProps) {
  if (type === "metrics") {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
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
      <div className="bg-white rounded-3xl border border-brand-100/60 p-6 space-y-4 animate-pulse">
        {/* Table header */}
        <div className="flex gap-4 border-b border-brand-50 pb-4">
          <div className="h-4 w-1/4 bg-slate-200 rounded-md" />
          <div className="h-4 w-1/4 bg-slate-200 rounded-md" />
          <div className="h-4 w-1/4 bg-slate-200 rounded-md" />
          <div className="h-4 w-1/4 bg-slate-200 rounded-md" />
        </div>
        {/* Table rows */}
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex gap-4 py-2 border-b border-brand-50/50 last:border-0">
            <div className="h-4 w-1/4 bg-slate-200/80 rounded-md" />
            <div className="h-4 w-1/4 bg-slate-200/80 rounded-md" />
            <div className="h-4 w-1/4 bg-slate-200/80 rounded-md" />
            <div className="h-4 w-1/4 bg-slate-200/80 rounded-md" />
          </div>
        ))}
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
}
