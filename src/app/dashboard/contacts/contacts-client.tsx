"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { Plus, Search, ArrowUp, ArrowDown, ChevronsUpDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Drawer } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import type { Contact } from "@/lib/types";
import { format } from "date-fns";

type SortKey = "full_name" | "phone" | "email" | "company" | "created_at";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "full_name", label: "Contact name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "company", label: "Business name" },
  { key: "created_at", label: "Created" },
];

export function ContactsClient({ initialContacts }: { initialContacts: Contact[] }) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (search: string) => {
    setLoading(true);
    const res = await fetch(`/api/contacts${search ? `?q=${encodeURIComponent(search)}` : ""}`);
    const data = await res.json();
    setContacts(data.contacts ?? []);
    setSelected(new Set());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => load(q), 250);
    return () => clearTimeout(t);
  }, [q, load, dirty]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = useMemo(() => {
    const rows = [...contacts];
    rows.sort((a, b) => {
      const av = (a[sortKey] ?? "") as string;
      const bv = (b[sortKey] ?? "") as string;
      const cmp = av.localeCompare(bv);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [contacts, sortKey, sortDir]);

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === sorted.length ? new Set() : new Set(sorted.map((c) => c.id))));
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} contact${selected.size > 1 ? "s" : ""}? This can't be undone.`)) return;
    setDeleting(true);
    await Promise.all([...selected].map((id) => fetch(`/api/contacts/${id}`, { method: "DELETE" })));
    setDeleting(false);
    load(q);
  }

  return (
    <div className="flex h-screen flex-col px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-secondary">Contacts</h1>
          <p className="mt-1 text-sm text-muted">{contacts.length} contacts</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus size={16} /> New contact
        </Button>
      </div>

      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input
            value={q}
            onChange={(e) => {
              setDirty(true);
              setQ(e.target.value);
            }}
            placeholder="Search name, email, phone, company…"
            className="pl-9"
          />
        </div>
        {selected.size > 0 && (
          <Button variant="danger" size="sm" onClick={deleteSelected} disabled={deleting}>
            <Trash2 size={14} /> Delete {selected.size} selected
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto rounded-xl border border-border bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-section">
            <tr>
              <th className="w-10 border-b border-border px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={selected.size > 0 && selected.size === sorted.length}
                  onChange={toggleAll}
                  className="cursor-pointer"
                />
              </th>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className="cursor-pointer select-none border-b border-border px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted hover:bg-ink/5"
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key ? (
                      sortDir === "asc" ? (
                        <ArrowUp size={12} />
                      ) : (
                        <ArrowDown size={12} />
                      )
                    ) : (
                      <ChevronsUpDown size={12} className="opacity-40" />
                    )}
                  </span>
                </th>
              ))}
              <th className="border-b border-border px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                Tags
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={COLUMNS.length + 2} className="p-6 text-center text-sm text-muted">
                  Loading…
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 2} className="p-6 text-center text-sm text-muted">
                  No contacts yet.
                </td>
              </tr>
            ) : (
              sorted.map((c) => (
                <tr key={c.id} className={cn("group", selected.has(c.id) ? "bg-primary/5" : "hover:bg-section")}>
                  <td className="border-b border-border px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggleRow(c.id)}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="border-b border-border px-4 py-2.5">
                    <Link href={`/dashboard/contacts/${c.id}`} className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={c.full_name} size={28} />
                      <span className="truncate font-medium text-ink hover:text-primary-dark hover:underline">
                        {c.full_name}
                      </span>
                    </Link>
                  </td>
                  <td className="border-b border-border px-4 py-2.5 whitespace-nowrap text-ink">
                    {c.phone || "—"}
                  </td>
                  <td className="border-b border-border px-4 py-2.5 text-ink">
                    <span className="block max-w-[220px] truncate">{c.email || "—"}</span>
                  </td>
                  <td className="border-b border-border px-4 py-2.5 text-ink">{c.company || "—"}</td>
                  <td className="border-b border-border px-4 py-2.5 whitespace-nowrap text-muted">
                    {format(new Date(c.created_at), "MMM d, yyyy")}
                  </td>
                  <td className="border-b border-border px-4 py-2.5">
                    <div className="flex gap-1">
                      {c.tags?.slice(0, 2).map((t) => (
                        <Badge key={t} tone="primary">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted">
        {sorted.length} contact{sorted.length === 1 ? "" : "s"}
        {selected.size > 0 ? ` · ${selected.size} selected` : ""}
      </p>

      <NewContactDialog
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => {
          setOpen(false);
          setDirty(true);
          load(q);
        }}
      />
    </div>
  );
}

function NewContactDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: fullName, email, phone, company, notes }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Couldn't save contact — check the fields and try again.");
      return;
    }
    setFullName("");
    setEmail("");
    setPhone("");
    setCompany("");
    setNotes("");
    onCreated();
  }

  return (
    <Drawer open={open} onClose={onClose} title="Add Contact">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <Label>Full name</Label>
          <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input
              placeholder="+92 300 1234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label>Company</Label>
          <Input value={company} onChange={(e) => setCompany(e.target.value)} />
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={saving} className="w-full justify-center">
          {saving ? "Saving…" : "Save contact"}
        </Button>
      </form>
    </Drawer>
  );
}
