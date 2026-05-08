"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { twMerge } from "tailwind-merge";
import { logout } from "../../lib/useAuth";
import {
  LayoutDashboard, Briefcase, Bot, FileText,
  Users, CreditCard, Settings, LogOut, Zap,
} from "lucide-react";

const NAV_MAIN = [
  { href: "/dashboard",     label: "Overview",     icon: LayoutDashboard },
  { href: "/applications",  label: "Applications", icon: Briefcase },
  { href: "/scoring",       label: "Automation",   icon: Bot },
  { href: "/resume",        label: "Resume Lab",   icon: FileText },
  { href: "/recruiter",     label: "Recruiters",   icon: Users },
];

const NAV_BOTTOM = [
  { href: "/billing",  label: "Billing",  icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavItem({
  href, label, icon: Icon, active, onClick,
}: {
  href: string; label: string; icon: React.ElementType;
  active?: boolean; onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={twMerge(
        "flex items-center gap-2.5 px-3 h-9 rounded-lg text-[13.5px] font-medium transition-colors duration-100",
        active
          ? "bg-slate-100 text-slate-900"
          : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
      )}
    >
      <Icon size={15} className={active ? "text-slate-700" : "text-slate-400"} />
      {label}
    </Link>
  );
}

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 h-14 flex items-center border-b border-slate-100 shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2.5" onClick={onMobileClose}>
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
            <Zap size={14} className="text-white" fill="white" />
          </div>
          <span className="text-[15px] font-semibold text-slate-900 tracking-tight">JobRocket</span>
        </Link>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {NAV_MAIN.map((item) => (
          <NavItem
            key={item.href}
            {...item}
            active={isActive(item.href)}
            onClick={onMobileClose}
          />
        ))}
      </nav>

      {/* Bottom nav */}
      <div className="px-3 py-3 border-t border-slate-100 space-y-0.5 shrink-0">
        {NAV_BOTTOM.map((item) => (
          <NavItem
            key={item.href}
            {...item}
            active={isActive(item.href)}
            onClick={onMobileClose}
          />
        ))}
        <button
          onClick={() => { onMobileClose(); logout(router); }}
          className="flex items-center gap-2.5 px-3 h-9 rounded-lg w-full text-left text-[13.5px] font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors"
        >
          <LogOut size={15} className="text-slate-400" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex flex-col shrink-0 bg-white border-r border-slate-100"
        style={{ width: "var(--sidebar-width)" }}
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={twMerge(
          "lg:hidden fixed inset-y-0 left-0 z-50 flex flex-col bg-white border-r border-slate-100 transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ width: "var(--sidebar-width)" }}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
