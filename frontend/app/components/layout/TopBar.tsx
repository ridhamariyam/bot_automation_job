"use client";
import { Menu } from "lucide-react";

interface TopBarProps {
  title: string;
  onMobileMenuOpen: () => void;
  actions?: React.ReactNode;
}

export function TopBar({ title, onMobileMenuOpen, actions }: TopBarProps) {
  return (
    <header
      className="sticky top-0 z-20 bg-white border-b border-slate-100 px-4 sm:px-6 flex items-center justify-between shrink-0"
      style={{ height: "var(--topbar-height)" }}
    >
      <div className="flex items-center gap-3">
        {/* Mobile menu trigger */}
        <button
          className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          onClick={onMobileMenuOpen}
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>
        <h1 className="text-[15px] font-semibold text-slate-900">{title}</h1>
      </div>

      {actions && (
        <div className="flex items-center gap-2">
          {actions}
        </div>
      )}
    </header>
  );
}
