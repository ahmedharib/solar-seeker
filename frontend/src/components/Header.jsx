import React from "react";
import { Layers, Sun, Moon } from "lucide-react";
import { MainLogo, PhoebeLogo } from "./BrandLogos";

export default function Header({
  activeTab = "vision",
  setActiveTab,
  theme = "daylight",
  setTheme,
}) {
  const isDark = theme === "graphite";

  return (
    <header
      className="border-b border-[var(--border-subtle)] sticky top-0 z-50 backdrop-blur-md transition-colors"
      style={{ backgroundColor: "var(--bg-header)" }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left: main-logo.svg beside SolarSeeker Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab && setActiveTab("vision");
            }}
            className="inline-flex items-center gap-2.5 group select-none"
          >
            <MainLogo className="w-6 h-5 text-[var(--text-primary)] shrink-0 transition-transform group-hover:scale-[1.03]" />

            <span className="text-[20px] sm:text-[21px] font-semibold tracking-[-0.025em] text-[var(--text-primary)] leading-none">
              SolarSeeker
            </span>
          </a>
        </div>

        {/* Center: Segmented Product Switcher */}
        <div className="flex items-center justify-center">
          <div className="ss-pill-track p-1 rounded-full flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab && setActiveTab("vision")}
              className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "vision"
                  ? "ss-pill-active"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent"
              }`}
            >
              <Layers
                className={`w-3.5 h-3.5 shrink-0 -translate-y-px ${
                  activeTab === "vision"
                    ? "text-[#37645C] dark:text-[#F5AD46]"
                    : "text-[var(--text-muted)]"
                }`}
              />
              <span className="leading-none">Rooftop Vision</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab && setActiveTab("phoebe")}
              className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "phoebe"
                  ? "ss-pill-active"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent"
              }`}
            >
              <PhoebeLogo
                className={`w-3.5 h-3.5 shrink-0 -translate-y-px ${
                  activeTab === "phoebe"
                    ? "text-[#F5AD46]"
                    : "text-[var(--text-muted)]"
                }`}
              />
              <span className="leading-none">Phoebe</span>
            </button>
          </div>
        </div>

        {/* Right: Brand System 04 Daylight / Graphite Theme Switcher */}
        <div className="flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={() => setTheme && setTheme(isDark ? "daylight" : "graphite")}
            className="ss-pill-track px-3 py-1.5 rounded-full inline-flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-all cursor-pointer"
            title={
              isDark
                ? "Switch to Daylight (#F6F5EF) Theme"
                : "Switch to Graphite (#182321) Theme"
            }
          >
            {isDark ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-[#182321] border border-[#F6F5EF]/40 shrink-0" />
                <Moon className="w-3.5 h-3.5 text-[#F5AD46] shrink-0" />
                <span className="hidden sm:inline leading-none">Graphite</span>
              </>
            ) : (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-[#F5AD46] shrink-0" />
                <Sun className="w-3.5 h-3.5 text-[#182321] shrink-0" />
                <span className="hidden sm:inline leading-none">Daylight</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
