import React, { useState, useEffect } from "react";
import Header from "./components/Header";
import Stepper from "./components/Stepper";
import Step1Upload from "./components/Step1Upload";
import Step2PolygonSelector from "./components/Step2PolygonSelector";
import Step3Results from "./components/Step3Results";
import Phoebe from "./components/Phoebe";
import { CALIBRATED_SITE, DEFAULT_FINANCIALS, DEFAULT_PHYSICS } from "./constants/config";

export default function App() {
  // Brand System 04 Theme: 'daylight' (#F6F5EF primary light) | 'graphite' (#182321 deep dark)
  const [theme, setTheme] = useState("daylight");
  const isDark = theme === "graphite";

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [isDark]);

  // Top-Level App Feature Navigation ('vision' = Rooftop AI Wizard, 'phoebe' = Phoebe HEMS)
  const [activeTab, setActiveTab] = useState("vision");

  // Wizard Navigation (Vision Tab)
  const [currentStep, setCurrentStep] = useState(1);
  const [maxStepAllowed, setMaxStepAllowed] = useState(1);

  // Step 1: Upload & Parameters
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [location, setLocation] = useState({ lat: CALIBRATED_SITE.lat, lon: CALIBRATED_SITE.lon });
  const [financials, setFinancials] = useState({ ...DEFAULT_FINANCIALS });
  const [gsd, setGsd] = useState(DEFAULT_PHYSICS.gsd);

  // Step 2: Detection & Polygon Selection
  const [detectionResult, setDetectionResult] = useState(null);
  const [selectedPolygonIds, setSelectedPolygonIds] = useState(new Set());

  // Step 3: Calculation Results
  const [results, setResults] = useState(null);

  // Loading & Error States
  const [isDetecting, setIsDetecting] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState(null);

  // Action: Run U-Net Detection on uploaded screenshot or captured map viewport
  const handleRunDetection = async (overrideFile) => {
    const targetFile = overrideFile instanceof File ? overrideFile : file;
    if (!targetFile) {
      setError(
        "Please upload a satellite screenshot or use Location Search to target a rooftop."
      );
      return;
    }

    try {
      setIsDetecting(true);
      setError(null);

      const formData = new FormData();
      formData.append("file", targetFile);
      formData.append("gsd", gsd.toString());

      const res = await fetch("/api/detect_roofs", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to detect rooftops.");
      }

      setDetectionResult(data);

      // Default: auto-select the largest detected roof (polygon #1)
      if (data.polygons && data.polygons.length > 0) {
        setSelectedPolygonIds(new Set([data.polygons[0].id]));
      } else {
        setSelectedPolygonIds(new Set());
      }

      setCurrentStep(2);
      setMaxStepAllowed((prev) => Math.max(prev, 2));
    } catch (err) {
      setError(err.message || "An error occurred during rooftop detection.");
    } finally {
      setIsDetecting(false);
    }
  };

  // Action: Calculate Solar Feasibility with Selected Rooftops
  const handleCalculateSolar = async () => {
    if (!detectionResult || selectedPolygonIds.size === 0) return;

    try {
      setIsCalculating(true);
      setError(null);

      let selectedAreaM2 = 0;
      detectionResult.polygons.forEach((p) => {
        if (selectedPolygonIds.has(p.id)) {
          selectedAreaM2 += p.gross_area_m2;
        }
      });

      const payload = {
        lat: location.lat,
        lon: location.lon,
        selected_area_m2: selectedAreaM2,
        electricity_rate: financials.electricityRate,
        install_cost_per_kwp: financials.installCostPerKwp,
        monthly_bill: financials.monthlyBill,
      };

      const res = await fetch("/api/calculate_solar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to calculate solar feasibility.");
      }

      setResults(data);
      setCurrentStep(3);
      setMaxStepAllowed(3);
    } catch (err) {
      setError(err.message || "An error occurred during solar calculations.");
    } finally {
      setIsCalculating(false);
    }
  };

  const handleReset = () => {
    setCurrentStep(1);
    setMaxStepAllowed(1);
    setFile(null);
    setPreviewUrl("");
    setDetectionResult(null);
    setSelectedPolygonIds(new Set());
    setResults(null);
    setError(null);
  };

  return (
    <div className="min-h-screen flex flex-col font-sans bg-[var(--bg-canvas)] text-[var(--text-primary)] selection:bg-[#F5AD46] selection:text-[#182321]">
      {/* Global Header with Brand System Logo, App Switcher & Daylight/Graphite Theme Toggle */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        theme={theme}
        setTheme={setTheme}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* TAB 1: Rooftop AI Vision Workflow */}
        <div className={activeTab === "vision" ? "space-y-6" : "hidden"}>
          {/* Step Progress Stepper */}
          <Stepper
            currentStep={currentStep}
            onStepClick={(stepId) => setCurrentStep(stepId)}
            maxStepAllowed={maxStepAllowed}
          />

          {/* Dynamic Wizard Steps */}
          <div>
            {currentStep === 1 && (
              <Step1Upload
                file={file}
                setFile={setFile}
                previewUrl={previewUrl}
                setPreviewUrl={setPreviewUrl}
                location={location}
                setLocation={setLocation}
                financials={financials}
                setFinancials={setFinancials}
                gsd={gsd}
                setGsd={setGsd}
                onRunDetection={handleRunDetection}
                isDetecting={isDetecting}
                error={error}
              />
            )}

            {currentStep === 2 && (
              <Step2PolygonSelector
                detectionResult={detectionResult}
                previewUrl={previewUrl}
                selectedPolygonIds={selectedPolygonIds}
                setSelectedPolygonIds={setSelectedPolygonIds}
                onCalculateSolar={handleCalculateSolar}
                isCalculating={isCalculating}
                onBack={() => setCurrentStep(1)}
                isDark={isDark}
              />
            )}

            {currentStep === 3 && (
              <Step3Results
                results={results}
                onBackToSelector={() => setCurrentStep(2)}
                onReset={handleReset}
                isDark={isDark}
              />
            )}
          </div>
        </div>

        {/* TAB 2: Phoebe AI HEMS */}
        <div className={activeTab === "phoebe" ? "block" : "hidden"}>
          <Phoebe isTabActive={activeTab === "phoebe"} isDark={isDark} />
        </div>
      </main>

      {/* Subtle Brand System Footer */}
      <footer className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
        <span>SolarSeeker / Daylight Precision</span>
        <span className="tabular-nums">PVGIS 5.3 · U-Net Vision · Phoebe MPC Dispatch</span>
      </footer>
    </div>
  );
}
