import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import { Dialer } from "@/components/dialer";
import { DialerProvider } from "@/lib/dialer-context";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <DialerProvider>
      {/* min-h-0 lets this flex row shrink below its content's natural height
          instead of growing past the viewport — required for <main>'s
          overflow-y-auto to actually scroll internally rather than pushing
          the whole page taller (see layout.tsx's h-dvh + overflow-hidden). */}
      <div className="flex flex-1 min-h-0">
        <Sidebar email={user.email ?? ""} />
        <main className="flex-1 min-h-0 overflow-y-auto bg-section">{children}</main>
      </div>
      <Dialer />
    </DialerProvider>
  );
}
