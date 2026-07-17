import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getVisiblePages } from "../pagination";

interface PaginationFooterProps {
  totalItems: number;
  itemsPerPage: number;
  currentPage: number;
  setCurrentPage: (page: number | ((prev: number) => number)) => void;
  itemLabel?: string;
}

export default React.memo(function PaginationFooter({
  totalItems,
  itemsPerPage,
  currentPage,
  setCurrentPage,
  itemLabel = "item",
}: PaginationFooterProps) {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  if (totalPages <= 1) return null;

  const start = totalItems > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const end = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div className="bg-brand-50/30 p-4 border-t border-brand-100 text-sm text-brand-500 font-bold flex flex-col sm:flex-row items-center justify-between gap-3">
      <span className="whitespace-nowrap tabular-nums">
        Menampilkan {start}–{end} dari {totalItems} {itemLabel}
      </span>
      <div className="flex items-center gap-1 sm:gap-1.5 select-none shrink-0">
        <button
          disabled={currentPage === 1}
          onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
          className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center bg-white hover:bg-brand-50 border border-brand-200 rounded-xl text-brand-850 disabled:opacity-40 disabled:hover:bg-white cursor-pointer transition-all shrink-0"
          title="Halaman Sebelumnya"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {getVisiblePages(totalPages, currentPage, 5).map((pageNum, i) =>
          typeof pageNum === "string" ? (
            <span
              key={`ellipsis-${i}`}
              className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-brand-400 font-bold shrink-0"
            >
              ...
            </span>
          ) : (
            <button
              key={pageNum}
              onClick={() => setCurrentPage(pageNum)}
              className={`w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl border text-sm font-black transition-all cursor-pointer shrink-0 ${
                currentPage === pageNum
                  ? "bg-brand-600 border-brand-600 text-white"
                  : "bg-white hover:bg-brand-50 border-brand-200 text-brand-800"
              }`}
            >
              {pageNum}
            </button>
          )
        )}
        <button
          disabled={currentPage === totalPages}
          onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
          className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center bg-white hover:bg-brand-50 border border-brand-200 rounded-xl text-brand-850 disabled:opacity-40 disabled:hover:bg-white cursor-pointer transition-all shrink-0"
          title="Halaman Berikutnya"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
});
