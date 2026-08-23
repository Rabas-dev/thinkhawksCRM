"use client";

import { useEffect, useState } from "react";
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
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useDialer } from "@/lib/dialer-context";

// Grouped (rather than one flat list) so the sidebar reads in logical
// clusters at a glance — core workspace, then communication channels, then
// growth tools — instead of eleven undifferentiated links in a row.
const NAV_GROUPS = [
  [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/pipeline", label: "Pipeline", icon: KanbanSquare },
    { href: "/dashboard/contacts", label: "Contacts", icon: Users },
    { href: "/dashboard/calendar", label: "Calendar", icon: CalendarDays },
  ],
  [
    { href: "/dashboard/email", label: "Email", icon: Mail },
    { href: "/dashboard/dialer", label: "Dialer", icon: PhoneCall },
    { href: "/dashboard/calls", label: "Call log", icon: Phone },
    { href: "/dashboard/messages", label: "Messages", icon: MessageSquare },
  ],
  [
    { href: "/dashboard/campaigns", label: "Campaigns", icon: Megaphone },
    { href: "/dashboard/templates", label: "Templates", icon: FileText },
  ],
  [{ href: "/dashboard/settings", label: "Settings", icon: Settings }],
];

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { openDialer } = useDialer();

  // Persisted per-browser so the agent's preference sticks across reloads.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads a per-browser preference from storage on mount
    setCollapsed(localStorage.getItem("sidebar:collapsed") === "1");
  }, []);
  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar:collapsed", next ? "1" : "0");
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-150",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className={cn("flex items-center gap-2 px-5 py-5", collapsed && "justify-center px-0")}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md gradient-bg text-sm font-bold text-white">
          TH
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-none text-secondary">Think Hawks</p>
            <p className="text-[11px] text-muted">CRM</p>
          </div>
        )}
      </div>

      <div className={cn("px-3 pb-2", collapsed && "px-2")}>
        <button
          onClick={() => openDialer()}
          title="Dial a number"
          className={cn(
            "flex w-full items-center gap-2 rounded-md gradient-bg py-2 text-sm font-medium text-white hover:opacity-90 cursor-pointer",
            collapsed ? "justify-center px-0" : "justify-center px-3",
          )}
        >
          <PhoneCall size={16} />
          {!collapsed && "Dial a number"}
        </button>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3">
        {NAV_GROUPS.map((group, i) => (
          <div key={i} className={cn("space-y-1", i > 0 && "border-t border-border pt-4")}>
            {group.map((item) => {
              const active =
                item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    collapsed && "justify-center px-0",
                    active
                      ? "bg-primary/12 text-primary-dark"
                      : "text-secondary hover:bg-section",
                  )}
                >
                  <Icon size={17} strokeWidth={2} className="shrink-0" />
                  {!collapsed && item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        {!collapsed && <div className="mb-2 truncate px-2 text-xs text-muted">{email}</div>}
        <button
          onClick={handleLogout}
          title={collapsed ? "Sign out" : undefined}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-secondary hover:bg-section cursor-pointer",
            collapsed && "justify-center px-0",
          )}
        >
          <LogOut size={16} className="shrink-0" />
          {!collapsed && "Sign out"}
        </button>
        <button
          onClick={toggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted hover:bg-section hover:text-secondary cursor-pointer",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? <PanelLeftOpen size={16} className="shrink-0" /> : <PanelLeftClose size={16} className="shrink-0" />}
          {!collapsed && "Collapse"}
        </button>
      </div>
    </aside>
  );
}
