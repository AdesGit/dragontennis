"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";

export function FaqAdminPanel() {
  const faq = useQuery(api.faq.list);
  const create = useMutation(api.faq.create);
  const remove = useMutation(api.faq.remove);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [order, setOrder] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  if (faq === undefined) return <p>Chargement…</p>;

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setMsg(null);
          try {
            await create({ question, answer, order: Number(order) || faq.length + 1 });
            setQuestion(""); setAnswer(""); setOrder("");
            setMsg("Question ajoutée.");
          } catch (err) {
            setMsg(err instanceof Error ? err.message : "Erreur");
          }
        }}
      >
        <input value={question} onChange={(e) => setQuestion(e.target.value)} required
          placeholder="Question" className="rounded border border-gray-300 px-3 py-2" />
        <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} required
          placeholder="Réponse" className="rounded border border-gray-300 px-3 py-2" />
        <input value={order} onChange={(e) => setOrder(e.target.value)} type="number"
          placeholder="Ordre (optionnel)" className="rounded border border-gray-300 px-3 py-2" />
        <button className="rounded bg-blue-600 px-4 py-2 text-white">Ajouter</button>
        {msg && <p className="text-sm text-gray-700">{msg}</p>}
      </form>

      <ul className="flex flex-col gap-2">
        {faq.map((f) => (
          <li key={f._id} className="flex items-start justify-between gap-3 border-b py-2">
            <div>
              <p className="font-medium">{f.order}. {f.question}</p>
              <p className="text-sm text-gray-600">{f.answer}</p>
            </div>
            <button
              onClick={async () => {
                if (!window.confirm("Supprimer cette question ?")) return;
                try { await remove({ id: f._id as Id<"faqEntries"> }); }
                catch (err) { setMsg(err instanceof Error ? err.message : "Erreur"); }
              }}
              className="shrink-0 text-red-600 hover:underline"
            >
              Supprimer
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
