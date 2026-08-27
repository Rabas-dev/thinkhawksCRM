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

type AttachmentControlProps = {
  attachments: PendingAttachment[];
  onChange: (next: PendingAttachment[]) => void;
  onError?: (message: string | null) => void;
};

/**
 * Gmail-style attach-files trigger — an icon-only button meant to sit
 * alongside Send, not its own row. Pair with AttachmentChips (rendered
 * wherever fits the layout) to show what's queued; both share the same
 * `attachments`/`onChange` state from the parent form.
 */
export function AttachmentButton({ attachments, onChange, onError }: AttachmentControlProps) {
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
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        title="Attach files"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-ink hover:bg-section cursor-pointer"
      >
        <Paperclip size={15} />
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
    </>
  );
}

/** Removable chips for whatever AttachmentButton has queued — render separately from the button itself so the button can sit next to Send while chips sit above/below the message field. */
export function AttachmentChips({
  attachments,
  onChange,
  error,
}: {
  attachments: PendingAttachment[];
  onChange: (next: PendingAttachment[]) => void;
  error?: string | null;
}) {
  if (attachments.length === 0 && !error) return null;
  return (
    <div>
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
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
