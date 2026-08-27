"use client";

import { useRef } from "react";
import { Paperclip, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type PendingAttachment = {
  filename: string;
  type: string;
  size: number;
  /** base64-encoded file content, no "data:" prefix — passed straight through to SendGrid's attachments API. */
  content: string;
};

/** Total raw (pre-base64) bytes allowed — base64 inflates ~37%, and SendGrid caps total message size at 30MB; this keeps real-world sends safely under that with room for headers/body. */
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Gmail-style attach-files control: a paperclip button plus removable chips for whatever's queued. Shared by every compose surface (contact email dialog, Email page thread/quick-compose). */
export function AttachmentField({
  attachments,
  onChange,
  error,
  onError,
}: {
  attachments: PendingAttachment[];
  onChange: (next: PendingAttachment[]) => void;
  error?: string | null;
  onError?: (message: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    onError?.(null);
    const files = Array.from(fileList);
    const currentTotal = attachments.reduce((sum, a) => sum + a.size, 0);
    const addedTotal = files.reduce((sum, f) => sum + f.size, 0);
    if (currentTotal + addedTotal > MAX_TOTAL_BYTES) {
      onError?.(`Attachments can't exceed ${formatSize(MAX_TOTAL_BYTES)} total.`);
      return;
    }
    const next: PendingAttachment[] = await Promise.all(
      files.map(async (file) => ({
        filename: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        content: await readAsBase64(file),
      })),
    );
    onChange([...attachments, ...next]);
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-xs font-medium text-ink hover:bg-section cursor-pointer"
        >
          <Paperclip size={13} /> Attach
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {attachments.length > 0 && (
          <span className="text-[11px] text-muted">
            {attachments.length} file{attachments.length > 1 ? "s" : ""} ·{" "}
            {formatSize(attachments.reduce((sum, a) => sum + a.size, 0))}
          </span>
        )}
      </div>
      {attachments.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {attachments.map((a, i) => (
            <span
              key={`${a.filename}-${i}`}
              className={cn(
                "flex items-center gap-1 rounded-md border border-border bg-section px-2 py-1 text-[11px] text-ink",
              )}
            >
              <Paperclip size={11} className="text-muted" />
              <span className="max-w-[160px] truncate">{a.filename}</span>
              <span className="text-muted">{formatSize(a.size)}</span>
              <button
                type="button"
                onClick={() => onChange(attachments.filter((_, idx) => idx !== i))}
                className="ml-0.5 text-muted hover:text-danger cursor-pointer"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
