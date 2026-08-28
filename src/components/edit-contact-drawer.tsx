"use client";

import { useEffect, useState } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import type { Contact } from "@/lib/types";

/** Edits a saved contact's core fields (name/email/phone/company/notes) — shared by the Contacts list and the contact detail page. */
export function EditContactDrawer({
  open,
  onClose,
  contact,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  contact: Contact;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(contact.full_name);
  const [email, setEmail] = useState(contact.email ?? "");
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [company, setCompany] = useState(contact.company ?? "");
  const [notes, setNotes] = useState(contact.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync from the current contact each time the drawer opens, since these
  // are locally editable fields — otherwise reopening the drawer for a
  // different contact (or after a save) would still show whatever was last
  // typed rather than that contact's actual saved values.
  useEffect(() => {
    if (!open) return;
    setFullName(contact.full_name);
    setEmail(contact.email ?? "");
    setPhone(contact.phone ?? "");
    setCompany(contact.company ?? "");
    setNotes(contact.notes ?? "");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-sync when the drawer opens, not on every contact re-render
  }, [open, contact.id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/contacts/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: fullName,
        email: email || null,
        phone: phone || null,
        company: company || null,
        notes: notes || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Couldn't save those changes — check the fields and try again.");
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <Drawer open={open} onClose={onClose} title="Edit contact">
      <form onSubmit={save} className="space-y-3">
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
            <Input placeholder="+92 300 1234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Company</Label>
          <Input value={company} onChange={(e) => setCompany(e.target.value)} />
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={saving} className="w-full justify-center">
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </Drawer>
  );
}
