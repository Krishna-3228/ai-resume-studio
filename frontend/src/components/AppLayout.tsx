import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, UserRound } from "lucide-react";
import logoImg from "../assets/logo.jpeg";

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
  return (
    <div className="h-screen bg-[#000407] text-[#ffecd1] selection:bg-[#ff7d00]/30 selection:text-[#ff9633] overflow-hidden">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 flex w-64 flex-col border-r border-[#15616d]/30 bg-[#00080e] z-30">
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-[#15616d]/30 px-6 bg-[#000407]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl overflow-hidden border border-[#ff7d00]/40 shadow-sm shadow-[#ff7d00]/20 bg-[#001524]">
              <img src={logoImg} alt="AI Resume Studio Logo" className="h-full w-full object-cover" />
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
      <main className="ml-64 h-screen flex flex-col bg-[#000407] overflow-hidden">
        {/* Page Content */}
        <div className="flex-1 h-full min-h-0 p-8 max-w-7xl w-full mx-auto flex flex-col">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
