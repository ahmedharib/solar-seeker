import React from "react";
import { Layers, Sparkles } from "lucide-react";

export default function Header({ activeTab = "vision", setActiveTab }) {
  return (
    <header className="border-b border-zinc-800/80 bg-[#09090b] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left: Brand Logo */}
        <div className="flex items-center gap-6 shrink-0">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab && setActiveTab("vision");
            }}
            className="font-inter text-[24px] sm:text-[24px] font-bold tracking-tight text-white hover:text-zinc-200 transition-colors select-none"
            style={{
              fontFamily:
                "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            }}
          >
            SolarSeeker
          </a>
        </div>

        {/* Center: ElevenLabs-style Segmented App Switcher */}
        <div className="flex items-center justify-center">
          <div className="bg-zinc-900 border border-zinc-800 p-1 rounded-full flex items-center gap-1 shadow-inner">
            <button
              type="button"
              onClick={() => setActiveTab && setActiveTab("vision")}
              className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                activeTab === "vision"
                  ? "bg-zinc-800 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Layers className="w-3.5 h-3.5 shrink-0 -translate-y-px" />
              <span className="leading-none">Rooftop Vision</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab && setActiveTab("phoebe")}
              className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                activeTab === "phoebe"
                  ? "bg-zinc-800 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0 -translate-y-px" />
              <span className="leading-none">Phoebe</span>
            </button>
          </div>
        </div>

        {/* Right side spacer for balanced centered navigation */}
        <div className="w-[120px] hidden sm:block shrink-0" />
      </div>
    </header>
  );
}
