import type { Contact } from "@/lib/types";

const TOKEN_RE = /\{\{\s*(first_name|full_name|company)\s*\}\}/g;

/** Fills {{first_name}}, {{full_name}}, {{company}} tokens with a contact's details. */
export function renderTemplate(text: string, contact: Pick<Contact, "full_name" | "company">): string {
  return text.replace(TOKEN_RE, (_match, token: string) => {
    switch (token) {
      case "first_name":
        return contact.full_name.trim().split(/\s+/)[0] || contact.full_name;
      case "full_name":
        return contact.full_name;
      case "company":
        return contact.company || "";
      default:
        return "";
    }
  });
}
