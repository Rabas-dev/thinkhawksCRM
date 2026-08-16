"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Phone,
  MessageSquare,
  Settings,
  LogOut,
  Megaphone,
  FileText,
  PhoneCall,
  Mail,
  KanbanSquare,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useDialer } from "@/lib/dialer-context";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/dashboard/contacts", label: "Contacts", icon: Users },
  { href: "/dashboard/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/dashboard/email", label: "Email", icon: Mail },
  { href: "/dashboard/dialer", label: "Dialer", icon: PhoneCall },
  { href: "/dashboard/calls", label: "Call log", icon: Phone },
  { href: "/dashboard/messages", label: "Messages", icon: MessageSquare },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/dashboard/templates", label: "Templates", icon: FileText },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { openDialer } = useDialer();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-border bg-white">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-bg text-sm font-bold text-white">
          TH
        </div>
        <div>
          <p className="text-sm font-semibold leading-none text-secondary">Think Hawks</p>
          <p className="text-[11px] text-muted">CRM</p>
        </div>
      </div>

      <div className="px-3 pb-2">
        <button
          onClick={() => openDialer()}
          className="flex w-full items-center justify-center gap-2 rounded-lg gradient-bg px-3 py-2 text-sm font-medium text-white hover:opacity-90 cursor-pointer"
        >
          <PhoneCall size={16} />
          Dial a number
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/12 text-primary-dark"
                  : "text-secondary hover:bg-section",
              )}
            >
              <Icon size={17} strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <div className="mb-2 truncate px-2 text-xs text-muted">{email}</div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-secondary hover:bg-section cursor-pointer"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
