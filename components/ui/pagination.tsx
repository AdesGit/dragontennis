"use client";

import { useEffect, useMemo, useState } from "react";

export const PAGE_SIZES = [10, 20, 50, 100];

/**
 * Client-side pagination over an already filtered/sorted list.
 * Falls back to page 1 whenever the list shrinks below the current page.
 */
export function usePagination<T>(items: T[], initialSize = 20) {
  const [pageSize, setPageSize] = useState(initialSize);
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    if (page > pageCount) setPage(1);
  }, [page, pageCount]);

  const current = Math.min(page, pageCount);
  const visible = useMemo(
    () => items.slice((current - 1) * pageSize, current * pageSize),
    [items, current, pageSize],
  );

  return {
    visible,
    page: current,
    pageCount,
    pageSize,
    total: items.length,
    setPage,
    setPageSize: (size: number) => {
      setPageSize(size);
      setPage(1);
    },
  };
}

type PaginationProps = {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  label?: string;
};

export function Pagination({
  page, pageCount, pageSize, total, onPage, onPageSize, label = "éléments",
}: PaginationProps) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
      <span>
        {total === 0 ? "Aucun résultat" : from + "–" + to + " sur " + total + " " + label}
      </span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1">
          Par page
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            className="rounded border border-gray-300 px-2 py-1"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40"
        >
          Précédent
        </button>
        <span>Page {page} / {pageCount}</span>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= pageCount}
          className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40"
        >
          Suivant
        </button>
      </div>
    </div>
  );
}
