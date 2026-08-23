import { CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";

const CHECKS = [
  { key: "NEXT_PUBLIC_SUPABASE_URL", label: "Supabase URL" },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", label: "Supabase anon key" },
  { key: "SUPABASE_SERVICE_ROLE_KEY", label: "Supabase service role key (webhooks)" },
  { key: "SENDGRID_API_KEY", label: "SendGrid API key (email sending)" },
  { key: "SENDGRID_FROM_EMAIL", label: "SendGrid verified sender address" },
  { key: "SENDGRID_WEBHOOK_PUBLIC_KEY", label: "SendGrid Event Webhook public key (delivery/open tracking)" },
  { key: "SENDGRID_INBOUND_TOKEN", label: "SendGrid inbound webhook shared secret (email replies)" },
  { key: "TELNYX_API_KEY", label: "Telnyx API key" },
  { key: "TELNYX_WEBRTC_CONNECTION_ID", label: "Telnyx WebRTC connection ID (browser dialer)" },
  { key: "TELNYX_CALL_CONTROL_APP_ID", label: "Telnyx Call Control App ID (bridging inbound calls to the browser)" },
  { key: "TELNYX_PHONE_NUMBER", label: "Telnyx phone number (calling + SMS)" },
  { key: "TELNYX_WEBHOOK_TOKEN", label: "Telnyx webhook shared secret" },
  { key: "NEXT_PUBLIC_BASE_URL", label: "Public base URL (for Telnyx/SendGrid callbacks)" },
];

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <h1 className="text-2xl font-semibold text-secondary">Settings</h1>
      <p className="mt-1 text-sm text-muted">
        Configuration status for this deployment. See{" "}
        <code className="rounded bg-ink/5 px-1 py-0.5 text-xs">SETUP.md</code> in the project
        for how to fill each of these in.
      </p>

      <Card className="mt-6 flex items-center justify-between px-5 py-4">
        <div>
          <p className="text-sm text-ink">Appearance</p>
          <p className="text-xs text-muted">Switch between light and dark mode</p>
        </div>
        <ThemeToggle />
      </Card>

      <Card className="mt-6 divide-y divide-border">
        {CHECKS.map((c) => {
          const set = Boolean(process.env[c.key]);
          return (
            <div key={c.key} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm text-ink">{c.label}</p>
                <p className="text-xs text-muted">{c.key}</p>
              </div>
              {set ? (
                <span className="flex items-center gap-1 text-xs font-medium text-success">
                  <CheckCircle2 size={14} /> Configured
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs font-medium text-muted">
                  <XCircle size={14} /> Not set
                </span>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
