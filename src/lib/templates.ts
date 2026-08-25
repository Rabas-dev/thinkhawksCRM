import type { Contact } from "@/lib/types";
import { escapeHtml } from "@/lib/utils";

const TOKEN_RE = /\{\{\s*(first_name|full_name|company)\s*\}\}/g;

/**
 * Fills {{first_name}}, {{full_name}}, {{company}} tokens with a contact's
 * details. Values are HTML-escaped — unlike the agent's own typed message
 * text, contact fields can originate from untrusted input (e.g. a contact
 * auto-created from an inbound email's From header) and this result gets
 * wrapped into outbound email HTML without further escaping.
 */
export function renderTemplate(text: string, contact: Pick<Contact, "full_name" | "company">): string {
  return text.replace(TOKEN_RE, (_match, token: string) => {
    switch (token) {
      case "first_name":
        return escapeHtml(contact.full_name.trim().split(/\s+/)[0] || contact.full_name);
      case "full_name":
        return escapeHtml(contact.full_name);
      case "company":
        return escapeHtml(contact.company || "");
      default:
        return "";
    }
  });
}
