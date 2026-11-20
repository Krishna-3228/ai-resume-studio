import { NavLink, Outlet, useLocation } from "react-router-dom";
import { LayoutDashboard, UserRound, Sparkles, FileText } from "lucide-react";

const navigation = [
  {
    name: "Dashboard",
    path: "/",
    icon: LayoutDashboard,
    description: "Manage resume projects",
  },
  {
    name: "Profile",
    path: "/profile",
    icon: UserRound,
    description: "Master resume data",
  },
];

export default function AppLayout() {
  const location = useLocation();
  const currentRouteName =
    location.pathname === "/"
      ? "Projects Dashboard"
      : location.pathname.startsWith("/profile")
      ? "Master Profile"
      : "Workspace";

  return (
    <div className="min-h-screen bg-[#000407] text-[#ffecd1] selection:bg-[#ff7d00]/30 selection:text-[#ff9633]">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 flex w-64 flex-col border-r border-[#15616d]/30 bg-[#00080e] z-30">
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-[#15616d]/30 px-6 bg-[#000407]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#ff7d00]/15 border border-[#ff7d00]/40 text-[#ff7d00] shadow-sm shadow-[#ff7d00]/20">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-white block leading-none">
                Resume Studio
              </span>
              <span className="text-[10px] text-[#ff7d00] font-semibold tracking-wider">
                AI POWERED
              </span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1.5 p-4">
          <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-[#7ed9e7]">
            Navigation
          </p>
          {navigation.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition-all ${
                    isActive
                      ? "bg-[#001524] text-[#ff7d00] border-l-2 border-[#ff7d00] font-semibold shadow-inner"
                      : "text-[#bfecf3] hover:bg-[#00111d] hover:text-white"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={`h-5 w-5 transition-colors ${
                        isActive
                          ? "text-[#ff7d00]"
                          : "text-[#15616d] group-hover:text-[#ff7d00]"
                      }`}
                    />
                    <span>{item.name}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="border-t border-[#15616d]/30 p-4 bg-[#000407]">
          <div className="flex items-center justify-between text-xs text-[#7ed9e7]">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#ff7d00] animate-pulse" />
              <span className="font-medium text-white">Studio Engine</span>
            </span>
            <span className="font-mono text-[11px] text-[#7ed9e7]/80">v0.1.0</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="ml-64 min-h-screen flex flex-col bg-[#000407]">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-[#15616d]/30 bg-[#00080e]/95 px-8 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-semibold text-[#7ed9e7] uppercase tracking-wider">
              AI Resume Studio
            </span>
            <span className="text-[#15616d] font-bold">/</span>
            <h2 className="text-sm font-bold text-white">
              {currentRouteName}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-[#15616d]/50 bg-[#00111d] px-3.5 py-1 text-xs text-[#bfecf3]">
              <Sparkles className="h-3.5 w-3.5 text-[#ff7d00]" />
              <span className="font-medium">Tailored LaTeX Resumes</span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
