import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-x-auto">
          <div className="mx-auto w-full max-w-[1400px] space-y-6 p-4 md:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
