import { CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";

const CHECKS = [
  { key: "NEXT_PUBLIC_SUPABASE_URL", label: "Supabase URL" },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", label: "Supabase anon key" },
  { key: "SUPABASE_SERVICE_ROLE_KEY", label: "Supabase service role key (webhooks)" },
  { key: "SENDGRID_API_KEY", label: "SendGrid API key (email sending)" },
  { key: "SENDGRID_FROM_EMAIL", label: "SendGrid verified sender address" },
  { key: "SENDGRID_WEBHOOK_PUBLIC_KEY", label: "SendGrid Event Webhook public key (delivery/open tracking)" },
  { key: "SENDGRID_INBOUND_TOKEN", label: "SendGrid inbound webhook shared secret (email replies)" },
  { key: "TWILIO_ACCOUNT_SID", label: "Twilio Account SID" },
  { key: "TWILIO_AUTH_TOKEN", label: "Twilio Auth Token" },
  { key: "TWILIO_PHONE_NUMBER", label: "Twilio phone number (calling + SMS)" },
  { key: "TWILIO_WHATSAPP_NUMBER", label: "Twilio WhatsApp number (optional)" },
  { key: "TWILIO_WEBHOOK_TOKEN", label: "Twilio webhook shared secret" },
  { key: "TWILIO_API_KEY_SID", label: "Twilio API Key SID (browser dialer)" },
  { key: "TWILIO_API_KEY_SECRET", label: "Twilio API Key Secret (browser dialer)" },
  { key: "TWILIO_TWIML_APP_SID", label: "Twilio TwiML App SID (browser dialer)" },
  { key: "NEXT_PUBLIC_BASE_URL", label: "Public base URL (for Twilio callbacks)" },
];

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <h1 className="text-2xl font-semibold text-secondary">Settings</h1>
      <p className="mt-1 text-sm text-muted">
        Configuration status for this deployment. See{" "}
        <code className="rounded bg-black/5 px-1 py-0.5 text-xs">SETUP.md</code> in the project
        for how to fill each of these in.
      </p>

      <Card className="mt-6 divide-y divide-border">
        {CHECKS.map((c) => {
          const set = Boolean(process.env[c.key]);
          return (
            <div key={c.key} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm text-[#222]">{c.label}</p>
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
