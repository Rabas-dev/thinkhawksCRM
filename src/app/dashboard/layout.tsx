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
      <div className="flex flex-1">
        <Sidebar email={user.email ?? ""} />
        <main className="flex-1 overflow-y-auto bg-section">{children}</main>
      </div>
      <Dialer />
    </DialerProvider>
  );
}
