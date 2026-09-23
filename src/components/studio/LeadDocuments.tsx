"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LeadDocument } from "@/lib/types";
import { api } from "@/lib/client-api";
import {
  formatDocumentSize,
  LEAD_DOCUMENT_ACCEPT,
} from "@/lib/lead-documents";
import { FileIcon, TrashIcon } from "@/components/icons";
import { Lockable } from "@/components/studio/board-lock";

export function LeadDocuments({
  leadId,
  disabled,
  lockHint,
}: {
  leadId: string;
  disabled: boolean;
  lockHint: string;
}) {
  const [docs, setDocs] = useState<LeadDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const { documents } = await api.listLeadDocuments(leadId);
    setDocs(documents);
  }, [leadId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void refresh()
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const addFiles = async (files: FileList | File[]) => {
    if (disabled || busy) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of list) {
        const { document } = await api.uploadLeadDocument(leadId, file);
        setDocs((prev) => [document, ...prev.filter((d) => d.id !== document.id)]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (doc: LeadDocument) => {
    if (disabled || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteLeadDocument(leadId, doc.id);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h4 className="kicker mb-2">
        Documents
      </h4>
      <Lockable className="block w-full">
        <div
          onDragOver={(e) => {
            if (disabled) return;
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            if (disabled) return;
            e.preventDefault();
            setDragOver(false);
            void addFiles(e.dataTransfer.files);
          }}
          className={`rounded-xl border border-dashed px-3 py-3 transition-colors ${
            dragOver
              ? "border-aurora-400/60 bg-aurora-400/10"
              : "border-white/15 bg-ink-950/30"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={LEAD_DOCUMENT_ACCEPT}
            className="sr-only"
            disabled={disabled || busy}
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={disabled || busy}
            title={disabled ? lockHint : "Drop files or browse"}
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center gap-1 py-2 text-center disabled:opacity-60"
          >
            <FileIcon className="h-5 w-5 text-aurora-300" />
            <span className="text-xs font-medium text-mist-200">
              {busy ? "Uploading…" : "Drop files here"}
            </span>
            <span className="text-[11px] text-mist-500">
              PDF, Office, images — up to 4 MB
            </span>
          </button>
        </div>
      </Lockable>
      {error ? (
        <p className="mt-2 text-xs text-rose-300">{error}</p>
      ) : null}
      {loading ? (
        <p className="mt-2 text-xs text-mist-500">Loading documents…</p>
      ) : docs.length === 0 ? (
        <p className="mt-2 text-xs text-mist-500">None attached yet.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {docs.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center gap-2 rounded-lg border border-white/8 bg-ink-950/40 px-2.5 py-2"
            >
              <FileIcon className="h-3.5 w-3.5 shrink-0 text-mist-400" />
              <a
                href={`/api/leads/${leadId}/documents/${doc.id}`}
                className="min-w-0 flex-1 truncate text-sm text-mist-100 hover:text-aurora-200 hover:underline"
              >
                {doc.name}
              </a>
              <span className="shrink-0 text-[11px] tabular-nums text-mist-500">
                {formatDocumentSize(doc.size)}
              </span>
              <Lockable>
                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => void remove(doc)}
                  aria-label={disabled ? lockHint : `Remove ${doc.name}`}
                  title={disabled ? lockHint : "Remove"}
                  className="text-mist-600 hover:text-rose-400 disabled:opacity-50"
                >
                  <TrashIcon className="h-3 w-3" />
                </button>
              </Lockable>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
