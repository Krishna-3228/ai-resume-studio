import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, UserRound, FileText } from "lucide-react";

const navigation = [
  {
    name: "Dashboard",
    path: "/",
    icon: LayoutDashboard,
  },
  {
    name: "Profile",
    path: "/profile",
    icon: UserRound,
  },
];

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <aside className="fixed inset-y-0 left-0 flex w-64 flex-col border-r border-gray-200 bg-white">
        <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-6">
          <FileText className="h-6 w-6 text-indigo-600" />
          <span className="text-lg font-semibold">Resume Studio</span>
        </div>

        <nav className="flex-1 space-y-1 p-4">
          {navigation.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`
                }
              >
                <Icon className="h-5 w-5" />
                {item.name}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-gray-200 p-4">
          <p className="text-xs text-gray-400">Resume Studio · v0.1.0</p>
        </div>
      </aside>

      <main className="ml-64 min-h-screen">
        <div className="border-b border-gray-200 bg-white px-8 py-5">
          <h2 className="text-sm font-medium text-gray-500">
            Resume Workspace
          </h2>
        </div>

        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}