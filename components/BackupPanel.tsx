"use client";

import { useMutation, useQuery } from "convex/react";
import { Download, Upload } from "lucide-react";
import { useState } from "react";

import { api } from "@/convex/_generated/api";

type ImportSummary = {
  dryRun: boolean;
  version: number;
  tables: Record<string, { incoming: number; created: number; updated: number; skipped: number }>;
  warnings: string[];
};

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function todayFileName() {
  return `tennis-backup-${new Date().toISOString().slice(0, 10)}.json`;
}

export function BackupPanel() {
  const snapshot = useQuery(api.backup.exportData, {});
  const importData = useMutation(api.backup.importData);
  const [selectedSnapshot, setSelectedSnapshot] = useState<unknown | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function readFile(file: File) {
    setMessage(null);
    setSummary(null);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      setSelectedSnapshot(parsed);
      setFileName(file.name);
      const preview = await importData({ snapshot: parsed, dryRun: true });
      setSummary(preview as ImportSummary);
      setMessage({ ok: true, text: "Dry-run terminé: aucune donnée modifiée." });
    } catch (err) {
      setSelectedSnapshot(null);
      setFileName(null);
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Fichier invalide" });
    }
  }

  async function runImport() {
    if (!selectedSnapshot) return;
    if (!window.confirm("Importer ce backup en mode merge/upsert ? Les données existantes compatibles seront mises à jour.")) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await importData({ snapshot: selectedSnapshot, dryRun: false });
      setSummary(result as ImportSummary);
      setMessage({ ok: true, text: "Import terminé." });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Erreur import" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border p-4">
        <h2 className="mb-2 font-semibold">Exporter</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Export JSON simple des données métier: membres, invitations, transactions,
          activations, courts et FAQ. Les sessions auth et tokens Legrand ne sont pas inclus.
        </p>
        <button
          type="button"
          disabled={snapshot === undefined}
          onClick={() => downloadJson(todayFileName(), snapshot)}
          className="inline-flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          Télécharger le backup
        </button>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-2 font-semibold">Importer</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          L’import est en merge/upsert. Un dry-run est lancé automatiquement dès que le
          fichier est choisi; cliquez ensuite sur importer pour appliquer.
        </p>
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void readFile(file);
          }}
          className="block w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        {fileName && <p className="mt-2 text-sm text-muted-foreground">Fichier: {fileName}</p>}
        {summary && (
          <div className="mt-4 overflow-x-auto rounded border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2">Table</th>
                  <th className="px-3 py-2">Entrées</th>
                  <th className="px-3 py-2">Créées</th>
                  <th className="px-3 py-2">Mises à jour</th>
                  <th className="px-3 py-2">Ignorées</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(summary.tables).map(([table, row]) => (
                  <tr key={table} className="border-t">
                    <td className="px-3 py-2 font-medium">{table}</td>
                    <td className="px-3 py-2">{row.incoming}</td>
                    <td className="px-3 py-2">{row.created}</td>
                    <td className="px-3 py-2">{row.updated}</td>
                    <td className="px-3 py-2">{row.skipped}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {summary?.warnings.length ? (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-700">
            {summary.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
        {message && (
          <p className={message.ok ? "mt-3 text-sm text-green-600" : "mt-3 text-sm text-red-600"}>
            {message.text}
          </p>
        )}
        <button
          type="button"
          disabled={!selectedSnapshot || busy}
          onClick={runImport}
          className="mt-4 inline-flex items-center gap-2 rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <Upload className="h-4 w-4" />
          {busy ? "Import…" : "Importer en merge/upsert"}
        </button>
      </section>
    </div>
  );
}
