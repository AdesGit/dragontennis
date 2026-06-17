"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function FaqList() {
  const faq = useQuery(api.faq.list);
  if (faq === undefined) return <p>Chargement…</p>;
  if (faq.length === 0) return <p className="text-sm text-gray-500">Aucune question.</p>;
  return (
    <div className="flex flex-col gap-4">
      {faq.map((f) => (
        <details key={f._id} className="rounded-lg border border-gray-200 p-4">
          <summary className="cursor-pointer font-medium">{f.question}</summary>
          <p className="mt-2 whitespace-pre-line text-sm text-gray-700">{f.answer}</p>
        </details>
      ))}
    </div>
  );
}
