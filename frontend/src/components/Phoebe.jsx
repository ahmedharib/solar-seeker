import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  UploadCloud,
  Database,
  Play,
  Pause,
  RotateCcw,
  FastForward,
  BatteryCharging,
  Zap,
  TrendingDown,
  ShieldCheck,
  FileSpreadsheet,
  AlertCircle,
  Terminal,
  Clock,
  Activity,
} from 'lucide-react';
import { PhoebeLogo } from './BrandLogos';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { getThemeColors } from '../constants/theme';
import { PHOEBE_CONFIG, CURRENCY } from '../constants/config';

export default function Phoebe({ isTabActive = true, isDark = false }) {
  const fileInputRef = useRef(null);
  const themeColors = getThemeColors(isDark);

  // Input Mode: 'sample' (data/phoebe-test-data.csv) | 'upload' (Custom CSV)
  const [sourceMode, setSourceMode] = useState('sample');
  const [selectedPreset, setSelectedPreset] = useState(PHOEBE_CONFIG.presets[0].id);
  const [csvFile, setCsvFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  // Battery & MPC Parameters
  const [batteryCapacityKwh, setBatteryCapacityKwh] = useState(PHOEBE_CONFIG.batteryCapacityKwh);
  const [initialSocPercent, setInitialSocPercent] = useState(PHOEBE_CONFIG.initialSocPercent);
  const [maxOutputKw, setMaxOutputKw] = useState(PHOEBE_CONFIG.maxOutputKw);
  const forecastHorizon = PHOEBE_CONFIG.forecastHorizonMinutes || 300;

  // Simulation Data & Loading State
  const [simulation, setSimulation] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [error, setError] = useState(null);

  // Timelapse Playback State
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(0); // 0 = 1x, 1 = 2x, 2 = 4x

  // Auto-pause timelapse if user switches away to another tab
  useEffect(() => {
    if (!isTabActive && isPlaying) {
      setIsPlaying(false);
    }
  }, [isTabActive, isPlaying]);

  // Run simulation against /api/phoebe/simulate
  const handleRunSimulation = async (overrideMode, overridePreset, overrideFile) => {
    const modeToUse = overrideMode || sourceMode;
    const presetToUse = overridePreset || selectedPreset;
    const fileToUse = overrideFile !== undefined ? overrideFile : csvFile;

    if (modeToUse === 'upload' && !fileToUse) {
      setError('Please upload a CSV file or switch to the Built-in Test Dataset.');
      return;
    }

    try {
      setIsSimulating(true);
      setIsPlaying(false);
      setError(null);

      const formData = new FormData();
      formData.append('use_sample', (modeToUse === 'sample').toString());
      formData.append('preset_key', presetToUse);
      formData.append('battery_capacity_kwh', batteryCapacityKwh.toString());
      formData.append('initial_soc_percent', initialSocPercent.toString());
      formData.append('max_output_kw', maxOutputKw.toString());
      formData.append('forecast_horizon_minutes', forecastHorizon.toString());

      if (modeToUse === 'upload' && fileToUse) {
        formData.append('csv_file', fileToUse);
      }

      const res = await fetch('/api/phoebe/simulate', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to run Phoebe HEMS simulation.');
      }

      setSimulation(data);
      setCurrentStepIndex(0);
      setIsPlaying(false);
    } catch (err) {
      setError(err.message || 'An error occurred while communicating with Phoebe HEMS engine.');
    } finally {
      setIsSimulating(false);
    }
  };

  // Timelapse interval timer
  useEffect(() => {
    if (!isPlaying || !simulation?.timeline?.length) return undefined;

    const totalSteps = simulation.timeline.length;
    const intervalMs = PHOEBE_CONFIG.playbackSpeeds[speedIndex]?.intervalMs || 140;

    const timer = setInterval(() => {
      setCurrentStepIndex((prev) => {
        if (prev >= totalSteps - 1) {
          setIsPlaying(false);
          return totalSteps - 1;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, speedIndex, simulation]);

  // File drag & drop handlers
  const handleFileSelect = (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please select a valid .csv file containing power readings.');
      return;
    }
    setCsvFile(file);
    setSourceMode('upload');
    setError(null);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  // Derived data up to current timelapse step
  const timeline = useMemo(() => simulation?.timeline || [], [simulation]);
  const visibleTimeline = useMemo(
    () => timeline.slice(0, currentStepIndex + 1),
    [timeline, currentStepIndex]
  );

  const currentStep = timeline[currentStepIndex] || null;
  const totalSteps = timeline.length || forecastHorizon;

  const liveMetrics = useMemo(() => {
    if (!currentStep) {
      return {
        demandWithoutKw: 0,
        gridNaiveKw: 0,
        gridWithKw: 0,
        batteryOutputKw: 0,
        batteryOutputNaiveKw: 0,
        dischargeCapKw: 0,
        socPercent: initialSocPercent,
        naiveSocPercent: initialSocPercent,
        remainingKwh: (batteryCapacityKwh * initialSocPercent) / 100,
        naiveRemainingKwh: (batteryCapacityKwh * initialSocPercent) / 100,
        cumCostWithoutTl: 0,
        cumCostNaiveTl: 0,
        cumCostWithTl: 0,
        cumSavingsTl: 0,
        savingsPercent: 0,
        aiVsNaiveSavingsTl: 0,
        aiVsNaivePercent: 0,
        cumDemandKwh: 0,
        cumGridNaiveKwh: 0,
        cumGridWithKwh: 0,
        usageReductionPercent: 0,
        gridIndependenceScore: 0,
        minutesOffGrid: 0,
        naiveDepletedTimestamp: null,
      };
    }

    const cumCostWithoutTl = currentStep.cumulative_cost_without_model_tl || 0;
    const cumCostNaiveTl = currentStep.cumulative_cost_naive_tl || 0;
    const cumCostWithTl = currentStep.cumulative_cost_with_model_tl || 0;
    const cumSavingsTl = currentStep.cumulative_savings_tl || cumCostWithoutTl - cumCostWithTl;
    const savingsPercent =
      cumCostWithoutTl > 0 ? Math.round((cumSavingsTl / cumCostWithoutTl) * 1000) / 10 : 0;
    const aiVsNaiveSavingsTl =
      currentStep.cumulative_ai_vs_naive_savings_tl !== undefined
        ? currentStep.cumulative_ai_vs_naive_savings_tl
        : cumCostNaiveTl - cumCostWithTl;
    const aiVsNaivePercent =
      cumCostNaiveTl > 0 ? Math.round((aiVsNaiveSavingsTl / cumCostNaiveTl) * 1000) / 10 : 0;

    const cumDemandKwh = currentStep.cumulative_demand_kwh || 0;
    const cumGridNaiveKwh = currentStep.cumulative_grid_naive_kwh || 0;
    const cumGridWithKwh = currentStep.cumulative_grid_with_model_kwh || 0;
    const usageReductionPercent =
      cumDemandKwh > 0
        ? Math.round(((cumDemandKwh - cumGridWithKwh) / cumDemandKwh) * 1000) / 10
        : 0;

    const stepCount = currentStep.step || 1;
    const gridIndependenceScore =
      Math.round((currentStep.minutes_off_grid_so_far / stepCount) * 1000) / 10;

    return {
      demandWithoutKw: currentStep.demand_without_model_kw || 0,
      gridNaiveKw: currentStep.grid_draw_naive_kw || 0,
      gridWithKw: currentStep.grid_draw_with_model_kw || 0,
      batteryOutputKw: currentStep.battery_output_kw || 0,
      batteryOutputNaiveKw: currentStep.battery_output_naive_kw || 0,
      dischargeCapKw: currentStep.discharge_cap_kw || 0,
      socPercent: currentStep.battery_soc_percent ?? initialSocPercent,
      naiveSocPercent: currentStep.battery_soc_naive_percent ?? initialSocPercent,
      remainingKwh: currentStep.battery_remaining_kwh ?? 0,
      naiveRemainingKwh: currentStep.battery_remaining_naive_kwh ?? 0,
      cumCostWithoutTl,
      cumCostNaiveTl,
      cumCostWithTl,
      cumSavingsTl,
      savingsPercent,
      aiVsNaiveSavingsTl,
      aiVsNaivePercent,
      cumDemandKwh,
      cumGridNaiveKwh,
      cumGridWithKwh,
      usageReductionPercent,
      gridIndependenceScore,
      minutesOffGrid: currentStep.minutes_off_grid_so_far || 0,
      naiveDepletedTimestamp: simulation?.financials?.naive_depleted_timestamp || null,
    };
  }, [currentStep, initialSocPercent, batteryCapacityKwh, simulation]);

  // Visible action log entries up to the current timelapse step
  const visibleLogs = useMemo(() => {
    if (!simulation) return [];
    const logs = [...(simulation.action_log?.slice(0, 2) || [])];
    visibleTimeline.forEach((stepItem) => {
      if (stepItem.note) {
        logs.push(stepItem.note);
      }
    });
    if (currentStepIndex === totalSteps - 1 && simulation.action_log?.length > 2) {
      const finalMsg = simulation.action_log[simulation.action_log.length - 1];
      if (!logs.includes(finalMsg)) {
        logs.push(finalMsg);
      }
    }
    return logs;
  }, [simulation, visibleTimeline, currentStepIndex, totalSteps]);

  const endTimestamp =
    timeline.length > 0 ? timeline[timeline.length - 1].timestamp : '21:59';

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 rounded-xl ss-badge-danger flex items-start gap-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 -translate-y-px" />
          <div className="text-xs">
            <p className="font-bold leading-none">Phoebe Simulation Error</p>
            <p className="opacity-90 text-[11px] mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Top Section: Header & Data Source Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left 7 Cols: Dataset Selector / CSV Upload */}
        <div className="lg:col-span-7 p-6 rounded-2xl ss-card flex flex-col justify-between space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-lg ss-icon-solar inline-flex items-center justify-center shrink-0">
                  <PhoebeLogo className="w-3.5 h-3.5" />
                </span>
                <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight leading-none">
                  Phoebe — AI Home Energy Management System
                </h2>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1.5">
                RandomForest rolling horizon forecaster & Model Predictive Control (MPC) battery dispatch.
              </p>
            </div>

            {/* Dual Input Mode Toggle */}
            <div className="ss-pill-track p-1 rounded-full inline-flex items-center gap-1 self-start sm:self-auto shrink-0">
              <button
                type="button"
                onClick={() => {
                  setSourceMode('sample');
                  setError(null);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  sourceMode === 'sample'
                    ? 'ss-pill-active'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent'
                }`}
              >
                <Database className="w-3.5 h-3.5 text-[#F5AD46] shrink-0 -translate-y-px" />
                <span className="leading-none">Test Data CSV</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSourceMode('upload');
                  setError(null);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  sourceMode === 'upload'
                    ? 'ss-pill-active'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent'
                }`}
              >
                <UploadCloud className="w-3.5 h-3.5 text-[#F5AD46] shrink-0 -translate-y-px" />
                <span className="leading-none">Upload CSV</span>
              </button>
            </div>
          </div>

          {/* Mode A: Built-in Test CSV (data/phoebe-test-data.csv) */}
          {sourceMode === 'sample' ? (
            <div className="flex-1 flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-[#F5AD46] shrink-0 -translate-y-px" />
                  <span className="leading-none">
                    Active Dataset: data/phoebe-test-data.csv (180-Min Input Window)
                  </span>
                </span>
                <span className="text-xs tabular-nums text-[var(--text-muted)] font-medium leading-none">
                  1,037,854 rows available
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {PHOEBE_CONFIG.presets.map((preset) => {
                  const active = selectedPreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setSelectedPreset(preset.id);
                        setError(null);
                      }}
                      className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
                        active
                          ? 'bg-[var(--brand-field-subtle)] border-[var(--brand-field-border)] shadow-xs'
                          : 'ss-well hover:border-[var(--border-strong)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold leading-none text-[var(--text-primary)]">
                          {preset.label}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full leading-none ${
                            active
                              ? 'bg-[#37645C] text-[#F6F5EF]'
                              : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)]'
                          }`}
                        >
                          {preset.badge || (active ? 'Selected' : 'Household')}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] mt-2 leading-relaxed">
                        {preset.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Mode B: Custom CSV File Upload */
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex-1 min-h-[220px] cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all flex flex-col items-center justify-center ${
                dragActive
                  ? 'border-[#37645C] bg-[var(--brand-field-subtle)]'
                  : 'border-[var(--border-strong)] hover:border-[#37645C] ss-well'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              />
              <div className="w-12 h-12 rounded-xl ss-icon-solar flex items-center justify-center mx-auto mb-3 shadow-xs">
                <UploadCloud className="w-6 h-6" />
              </div>
              {csvFile ? (
                <div className="space-y-1">
                  <p className="text-xs font-bold text-[var(--text-primary)]">{csvFile.name}</p>
                  <p className="text-xs text-[var(--text-secondary)] tabular-nums">
                    {(csvFile.size / 1024).toFixed(1)} KB · Click or drop another CSV to replace
                  </p>
                  <p className="text-xs font-bold text-[#37645C] dark:text-[#84C5B9] pt-1">
                    ✓ CSV staged — Click "Run Simulation" below to forecast
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs font-bold text-[var(--text-primary)]">
                    Drop your household consumption <span className="tabular-nums">.csv</span> here, or click to browse
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Reads the last 180 minutes of power demand (kW) from column 0 to forecast the peak window
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right 5 Cols: EPDK Tariff Tiers & Symmetrical BESS Configuration */}
        <div className="lg:col-span-5 p-6 rounded-2xl ss-card flex flex-col justify-between space-y-4">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-[var(--text-primary)] inline-flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg ss-icon-solar inline-flex items-center justify-center shrink-0">
                <Zap className="w-3.5 h-3.5" />
              </span>
              <span className="leading-none">EPDK 3-Tier Tariff & BESS Setup</span>
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Time-of-use tariffs and peak-shaving storage parameters.
            </p>
          </div>

          {/* 3-Tier EPDK Rate Pills */}
          <div className="grid grid-cols-3 gap-3 tabular-nums">
            <div className="p-3 rounded-xl ss-well">
              <div className="text-[10px] text-[var(--text-muted)] font-semibold leading-none">
                Night (22–06)
              </div>
              <div className="text-sm font-bold text-[var(--text-primary)] mt-1">
                {CURRENCY.symbol}{PHOEBE_CONFIG.tariffs.nightTl}
              </div>
              <div className="text-[10px] text-[var(--text-secondary)] mt-0.5 leading-none">
                Off-Peak Charge
              </div>
            </div>

            <div className="p-3 rounded-xl ss-well">
              <div className="text-[10px] text-[var(--text-muted)] font-semibold leading-none">
                Day (06–17)
              </div>
              <div className="text-sm font-bold text-[var(--text-primary)] mt-1">
                {CURRENCY.symbol}{PHOEBE_CONFIG.tariffs.dayTl}
              </div>
              <div className="text-[10px] text-[var(--text-secondary)] mt-0.5 leading-none">
                Standard Tariff
              </div>
            </div>

            <div className="p-3 rounded-xl ss-badge-solar">
              <div className="text-[10px] font-bold leading-none opacity-80">
                Peak (17–22)
              </div>
              <div className="text-sm font-bold text-[var(--text-primary)] mt-1">
                {CURRENCY.symbol}{PHOEBE_CONFIG.tariffs.peakTl}
              </div>
              <div className="text-[10px] font-semibold mt-0.5 leading-none">
                AI Peak Window
              </div>
            </div>
          </div>

          {/* Permanent Stable BESS Parameter Controls (Zero layout shifts) */}
          <div className="grid grid-cols-3 gap-3 pt-1">
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1.5 leading-none">
                Capacity (kWh)
              </label>
              <input
                type="number"
                step="1"
                min="2"
                max="50"
                value={batteryCapacityKwh}
                onChange={(e) =>
                  setBatteryCapacityKwh(parseFloat(e.target.value) || PHOEBE_CONFIG.batteryCapacityKwh)
                }
                className="w-full ss-input rounded-xl px-3 py-2 text-xs font-bold tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1.5 leading-none">
                17:00 SoC (%)
              </label>
              <input
                type="number"
                step="5"
                min="10"
                max="100"
                value={initialSocPercent}
                onChange={(e) =>
                  setInitialSocPercent(parseFloat(e.target.value) || PHOEBE_CONFIG.initialSocPercent)
                }
                className="w-full ss-input rounded-xl px-3 py-2 text-xs font-bold tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1.5 leading-none">
                Max Out (kW)
              </label>
              <input
                type="number"
                step="0.5"
                min="1"
                max="20"
                value={maxOutputKw}
                onChange={(e) =>
                  setMaxOutputKw(parseFloat(e.target.value) || PHOEBE_CONFIG.maxOutputKw)
                }
                className="w-full ss-input rounded-xl px-3 py-2 text-xs font-bold tabular-nums"
              />
            </div>
          </div>

          {/* Active EPDK Peak Window Badge */}
          <div className="flex items-center justify-between p-3 rounded-xl ss-well text-xs">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-[#F5AD46] shrink-0" />
              <span className="text-[var(--text-primary)] font-semibold">EPDK Peak Window</span>
            </div>
            <span className="tabular-nums text-[var(--text-secondary)] font-semibold text-xs">
              17:00 – 22:00 (5 Hours)
            </span>
          </div>

          {/* Primary Run / Re-run Simulation Button */}
          <button
            type="button"
            onClick={() => handleRunSimulation()}
            disabled={isSimulating || (sourceMode === 'upload' && !csvFile)}
            className={`w-full py-4 px-6 rounded-full font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer ${
              isSimulating || (sourceMode === 'upload' && !csvFile)
                ? 'ss-well text-[var(--text-muted)] cursor-not-allowed opacity-60'
                : 'ss-btn-primary active:scale-[0.99]'
            }`}
          >
            {isSimulating ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
                <span className="leading-none">
                  Forecasting Demand & Calculating MPC Dispatch...
                </span>
              </>
            ) : !simulation ? (
              <>
                <Play className="w-4 h-4 fill-current shrink-0 ml-0.5" />
                <span className="leading-none">Run 5-Hour Peak Simulation</span>
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4 shrink-0 -translate-y-px" />
                <span className="leading-none">Re-run 5-Hour Simulation</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Pre-Simulation Standby State */}
      {!simulation && (
        <div className="p-8 sm:p-12 rounded-2xl ss-card text-center space-y-6">
          <div className="w-12 h-12 rounded-xl ss-icon-solar flex items-center justify-center mx-auto shadow-xs">
            <PhoebeLogo className="w-6 h-6" />
          </div>
          <div className="max-w-xl mx-auto space-y-2">
            <h3 className="text-base font-bold text-[var(--text-primary)] tracking-tight">
              Ready to Forecast & Optimize Battery Dispatch
            </h3>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Phoebe uses an AI RandomForest model trained on historical load data to forecast 5 hours of power demand during the EPDK peak window (17:00–22:00 at {CURRENCY.symbol}{PHOEBE_CONFIG.tariffs.peakTl}/kWh). Model Predictive Control (MPC) schedules battery discharge to shave costly spikes, outperforming naive batteries and lowering your electricity bill.
            </p>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => handleRunSimulation()}
              disabled={isSimulating || (sourceMode === 'upload' && !csvFile)}
              className="py-3.5 px-6 rounded-full ss-btn-primary font-bold text-xs sm:text-sm inline-flex items-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSimulating ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Forecasting Demand & Calculating MPC Dispatch...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  <span>Run 5-Hour Peak Simulation</span>
                </>
              )}
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-[var(--text-muted)] pt-2 font-semibold tabular-nums">
            <span>✓ 3-Way Benchmark Comparison</span>
            <span>✓ EPDK 5-Hour Evening Peak (17:00–22:00)</span>
            <span>✓ 180-min rolling history</span>
          </div>
        </div>
      )}

      {/* Post-Simulation Results & Interactive Timelapse */}
      {simulation && (
        <>
          {/* Interactive Timelapse Playback Bar — Clean Card (no outer glow), Yellow Resume/Pause with White Text, Yellow Speed Text */}
          <div className="p-4 sm:p-5 rounded-2xl ss-card flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Play / Pause / Resume Button - Yellow with White Text */}
              <button
                type="button"
                onClick={() => {
                  if (currentStepIndex >= totalSteps - 1) {
                    setCurrentStepIndex(0);
                    setIsPlaying(true);
                  } else {
                    setIsPlaying(!isPlaying);
                  }
                }}
                className="px-4 py-2 rounded-full bg-[#E59A2E] hover:bg-[#F5AD46] text-white flex items-center gap-2 font-bold text-xs transition-colors shrink-0 cursor-pointer shadow-xs"
                title={
                  isPlaying
                    ? 'Pause Timelapse'
                    : currentStepIndex >= totalSteps - 1
                    ? 'Replay Timelapse'
                    : currentStepIndex === 0
                    ? 'Start Timelapse'
                    : 'Resume Timelapse'
                }
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5 fill-white text-white shrink-0" />
                    <span className="leading-none">Pause Timelapse</span>
                  </>
                ) : currentStepIndex >= totalSteps - 1 ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5 text-white shrink-0" />
                    <span className="leading-none">Replay Timelapse</span>
                  </>
                ) : currentStepIndex === 0 ? (
                  <>
                    <Play className="w-3.5 h-3.5 fill-white text-white shrink-0 ml-0.5" />
                    <span className="leading-none">Start Timelapse</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-white text-white shrink-0 ml-0.5" />
                    <span className="leading-none">Resume Timelapse</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentStepIndex(0);
                }}
                className="w-8 h-8 rounded-full bg-[#182321] hover:bg-[#253633] text-[#F5AD46] flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                title="Restart from 17:00"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentStepIndex(totalSteps - 1);
                }}
                className="w-8 h-8 rounded-full bg-[#182321] hover:bg-[#253633] text-[#F5AD46] flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                title={`Skip to End (${endTimestamp})`}
              >
                <FastForward className="w-3.5 h-3.5" />
              </button>

              <div className="pl-3 border-l border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-[#F5AD46] shrink-0 -translate-y-px" />
                  <span className="text-sm font-bold text-[var(--text-primary)] tabular-nums leading-none">
                    {currentStep?.timestamp || '17:00'}
                  </span>
                  <span className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-full ss-well text-[var(--text-secondary)] leading-none">
                    Min {currentStepIndex + 1} / {totalSteps}
                  </span>
                  {isPlaying ? (
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full ss-badge-field leading-none inline-flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#37645C] dark:bg-[#84C5B9] animate-pulse" />
                      Live Playing
                    </span>
                  ) : currentStepIndex >= totalSteps - 1 ? (
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full ss-well text-[var(--text-muted)] leading-none">
                      Completed
                    </span>
                  ) : currentStepIndex > 0 ? (
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full ss-badge-solar leading-none">
                      Paused
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full ss-well text-[var(--text-muted)] leading-none">
                      Ready to Play
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-1 leading-none">
                  Source:{' '}
                  <span className="text-[var(--text-primary)] font-semibold">
                    {simulation.source_label}
                  </span>
                </p>
              </div>
            </div>

            {/* Timeline Scrubber */}
            <div className="flex-1 max-w-xl flex items-center gap-3 tabular-nums">
              <span className="text-xs font-semibold text-[var(--text-muted)]">17:00</span>
              <input
                type="range"
                min={0}
                max={Math.max(0, totalSteps - 1)}
                value={currentStepIndex}
                onChange={(e) => {
                  setIsPlaying(false);
                  setCurrentStepIndex(Number(e.target.value));
                }}
                className="w-full accent-[#F5AD46] cursor-pointer h-1.5 bg-[var(--bg-elevated)] rounded-lg"
              />
              <span className="text-xs font-semibold text-[var(--text-muted)]">{endTimestamp}</span>
            </div>

            {/* Speed Selector — Preserving Distinct Yellow Text in 1x, 2x, 4x */}
            <div className="flex items-center gap-1.5 self-end md:self-auto">
              <span className="text-xs text-[var(--text-muted)] font-semibold mr-1 leading-none">
                Speed:
              </span>
              {PHOEBE_CONFIG.playbackSpeeds.map((s, idx) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setSpeedIndex(idx)}
                  className={`text-xs font-bold tabular-nums px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                    speedIndex === idx
                      ? 'bg-[#182321] text-[#F5AD46] border-[#F5AD46]/60 shadow-xs'
                      : 'bg-[#182321]/85 text-[#F5AD46]/70 border-[#182321] hover:text-[#F5AD46]'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3-Way Benchmark Executive Comparison Scoreboard */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {/* Arm 1: Grid-Only (No Battery) */}
            <div className="p-6 rounded-2xl ss-card relative overflow-hidden flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#C2452D] dark:bg-[#E0634B] shrink-0" />
                    <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                      Grid-Only
                    </span>
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full ss-badge-danger leading-none">
                    No Storage
                  </span>
                </div>
                <div>
                  <div className="text-[11px] text-[var(--text-muted)] font-semibold leading-none">
                    Cumulative Peak Bill
                  </div>
                  <div className="text-2xl font-bold text-[var(--text-primary)] tabular-nums mt-1 leading-tight">
                    {CURRENCY.symbol}{liveMetrics.cumCostWithoutTl.toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2 text-xs tabular-nums">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[var(--text-muted)] block text-[10px] font-semibold leading-none mb-1">
                      Grid Import
                    </span>
                    <span className="text-[var(--text-primary)] font-bold">
                      {liveMetrics.cumDemandKwh} kWh
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] block text-[10px] font-semibold leading-none mb-1">
                      Peak Exposure
                    </span>
                    <span className="text-[var(--text-primary)] font-bold">100% Utility</span>
                  </div>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-snug">
                  Pays full {CURRENCY.symbol}{PHOEBE_CONFIG.tariffs.peakTl}/kWh peak tariff on every spike.
                </p>
              </div>
            </div>

            {/* Arm 2: Naive Battery (Unintelligent Immediate Dump) */}
            <div className="p-6 rounded-2xl ss-card relative overflow-hidden flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#F5AD46] shrink-0" />
                    <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                      Naive Battery
                    </span>
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full ss-badge-solar leading-none">
                    No AI Forecast
                  </span>
                </div>
                <div>
                  <div className="text-[11px] text-[var(--text-muted)] font-semibold leading-none">
                    Cumulative Peak Bill
                  </div>
                  <div className="text-2xl font-bold text-[var(--text-primary)] tabular-nums mt-1 leading-tight">
                    {CURRENCY.symbol}{liveMetrics.cumCostNaiveTl.toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2 text-xs tabular-nums">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[var(--text-muted)] block text-[10px] font-semibold leading-none mb-1">
                      Grid Import
                    </span>
                    <span className="text-[var(--text-primary)] font-bold">
                      {liveMetrics.cumGridNaiveKwh} kWh
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] block text-[10px] font-semibold leading-none mb-1">
                      Battery State
                    </span>
                    <span className="text-[var(--text-primary)] font-bold">
                      {liveMetrics.naiveSocPercent}% SoC
                    </span>
                  </div>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-snug">
                  {liveMetrics.naiveSocPercent <= 5 ? (
                    <span className="text-[var(--text-primary)] font-semibold">
                      Depleted early ({liveMetrics.naiveDepletedTimestamp || 'mid-peak'}) — exposed to late spikes!
                    </span>
                  ) : (
                    <span>Dumps energy blindly at 17:00 without rationing for evening spikes.</span>
                  )}
                </p>
              </div>
            </div>

            {/* Arm 3: Phoebe AI (Elevated Hero Card) */}
            <div className="p-6 rounded-2xl ss-card-hero ring-1 ring-[#37645C]/30 relative overflow-hidden flex flex-col justify-between space-y-4">
              {/* Top Brand System Accent Bar (Field #37645C + Solar #F5AD46) */}
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#37645C] via-[#F5AD46] to-[#37645C]" />

              <div className="space-y-3 relative z-10">
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md ss-icon-solar flex items-center justify-center shrink-0">
                      <PhoebeLogo className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                      Phoebe AI
                    </span>
                  </div>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-[#37645C] text-[#F6F5EF] font-bold leading-none inline-flex items-center gap-1.5 shadow-xs">
                    <PhoebeLogo className="w-2.5 h-2.5 text-[#F5AD46]" />
                    AI Optimized
                  </span>
                </div>
                <div className="flex items-baseline justify-between tabular-nums">
                  <div>
                    <div className="text-[11px] text-[var(--text-secondary)] font-semibold leading-none">
                      Cumulative Peak Bill
                    </div>
                    <div className="text-2xl font-bold text-[var(--text-primary)] mt-1 leading-tight">
                      {CURRENCY.symbol}{liveMetrics.cumCostWithTl.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-[var(--text-secondary)] font-semibold leading-none">
                      Extra vs Naive
                    </div>
                    <div className="text-sm font-bold text-[#37645C] dark:text-[#84C5B9] mt-1 leading-tight">
                      +{CURRENCY.symbol}{liveMetrics.aiVsNaiveSavingsTl.toFixed(2)} (
                      {liveMetrics.aiVsNaivePercent > 0 ? `+${liveMetrics.aiVsNaivePercent}%` : '0%'})
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2 text-xs relative z-10 tabular-nums">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[var(--text-muted)] block text-[10px] font-semibold leading-none mb-1">
                      Grid Import
                    </span>
                    <span className="text-[#37645C] dark:text-[#84C5B9] font-bold">
                      {liveMetrics.cumGridWithKwh} kWh
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] block text-[10px] font-semibold leading-none mb-1">
                      Battery State
                    </span>
                    <span className="text-[#37645C] dark:text-[#84C5B9] font-bold">
                      {liveMetrics.socPercent}% SoC
                    </span>
                  </div>
                </div>
                <p className="text-xs text-[var(--text-primary)] font-medium leading-snug">
                  Rations discharge cap ({liveMetrics.dischargeCapKw} kW) to protect against whole-evening spikes.
                </p>
              </div>
            </div>
          </div>

          {/* 4 Live KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
            {/* KPI 1: Total Peak Savings vs Grid-Only */}
            <div className="p-6 rounded-2xl ss-card flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-semibold">
                <span className="leading-none">Total Savings vs. Grid</span>
                <span className="w-6 h-6 rounded-lg ss-icon-solar inline-flex items-center justify-center shrink-0">
                  <TrendingDown className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-[#37645C] dark:text-[#84C5B9] tabular-nums leading-none">
                +{CURRENCY.symbol}{liveMetrics.cumSavingsTl.toFixed(2)}
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-tight tabular-nums">
                +{CURRENCY.symbol}{liveMetrics.aiVsNaiveSavingsTl.toFixed(2)} extra saved vs. Naive BESS
              </p>
            </div>

            {/* KPI 2: Instant Grid Draw Comparison */}
            <div className="p-6 rounded-2xl ss-card flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-semibold">
                <span className="leading-none">Grid Power Usage</span>
                <span className="text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-full ss-badge-field leading-none">
                  -{liveMetrics.usageReductionPercent}% kWh
                </span>
              </div>
              <div className="flex items-baseline gap-2.5 tabular-nums leading-none">
                <span className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
                  {liveMetrics.gridWithKw.toFixed(2)} kW
                </span>
                <span className="text-xs text-[var(--text-muted)] line-through">
                  {liveMetrics.demandWithoutKw.toFixed(2)} kW
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-tight tabular-nums">
                Naive BESS Grid Draw: {liveMetrics.gridNaiveKw.toFixed(2)} kW
              </p>
            </div>

            {/* KPI 3: Battery SoC & AI Cap */}
            <div className="p-6 rounded-2xl ss-card flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-semibold">
                <span className="leading-none">Phoebe BESS vs. Naive</span>
                <span className="w-6 h-6 rounded-lg ss-icon-solar inline-flex items-center justify-center shrink-0">
                  <BatteryCharging className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] tabular-nums leading-none">
                {liveMetrics.socPercent}%{' '}
                <span className="text-xs font-medium text-[var(--text-secondary)]">
                  (Naive: {liveMetrics.naiveSocPercent}%)
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-tight tabular-nums">
                Discharging {liveMetrics.batteryOutputKw.toFixed(2)} kW (Cap {liveMetrics.dischargeCapKw} kW)
              </p>
            </div>

            {/* KPI 4: Grid Independence Score */}
            <div className="p-6 rounded-2xl ss-card flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-semibold">
                <span className="leading-none">Peak Independence</span>
                <span className="w-6 h-6 rounded-lg ss-icon-solar inline-flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] tabular-nums leading-none">
                {liveMetrics.gridIndependenceScore}%
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-tight tabular-nums">
                <strong className="text-[var(--text-primary)]">{liveMetrics.minutesOffGrid}</strong> of{' '}
                {currentStepIndex + 1} mins 100% off-grid
              </p>
            </div>
          </div>

          {/* Dual Charts Grid: Symmetrical Side-by-Side Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left Graph: Real-Time Power Usage (3-Way Comparison in kW) */}
            <div className="lg:col-span-6 p-6 sm:p-8 rounded-2xl ss-card flex flex-col justify-between space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)] inline-flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg ss-icon-solar inline-flex items-center justify-center shrink-0">
                      <Activity className="w-3.5 h-3.5" />
                    </span>
                    <span className="leading-none">Real-Time Power Usage: 3-Way Comparison (kW)</span>
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-1.5">
                    Grid-Only vs. Naive Battery vs. Phoebe AI-rationed grid draw.
                  </p>
                </div>
                {/* 4 Pills Stacked 2 Up, 2 Down */}
                <div className="grid grid-cols-2 gap-1.5 shrink-0">
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full ss-well text-[var(--text-primary)] inline-flex items-center justify-center gap-1.5 leading-none">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: themeColors.charts.withoutModelUsage }}
                    />
                    Grid-Only
                  </span>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full ss-well text-[var(--text-primary)] inline-flex items-center justify-center gap-1.5 leading-none">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: themeColors.charts.naiveBatteryUsage }}
                    />
                    Naive BESS
                  </span>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full ss-well text-[var(--text-primary)] inline-flex items-center justify-center gap-1.5 leading-none">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: themeColors.charts.withModelUsage }}
                    />
                    Phoebe AI
                  </span>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full ss-well text-[var(--text-primary)] inline-flex items-center justify-center gap-1.5 leading-none">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: themeColors.charts.batteryDischarge }}
                    />
                    BESS Output
                  </span>
                </div>
              </div>

              <div className="h-64 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={visibleTimeline} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <defs>
                      <linearGradient id="usageWithoutGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={themeColors.charts.withoutModelUsage} stopOpacity={0.10} />
                        <stop offset="95%" stopColor={themeColors.charts.withoutModelUsage} stopOpacity={0.00} />
                      </linearGradient>
                      <linearGradient id="usageWithGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={themeColors.charts.withModelUsage} stopOpacity={0.16} />
                        <stop offset="95%" stopColor={themeColors.charts.withModelUsage} stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={themeColors.charts.gridLines} />
                    <XAxis dataKey="timestamp" stroke={themeColors.charts.axisText} fontSize={11} tickLine={false} />
                    <YAxis stroke={themeColors.charts.axisText} fontSize={11} tickLine={false} />
                    <Tooltip
                      cursor={{ stroke: themeColors.charts.cursorStroke, strokeWidth: 1, strokeDasharray: '3 3' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          return (
                            <div
                              className="border p-3 rounded-xl text-xs space-y-1.5 shadow-lg tabular-nums"
                              style={{
                                backgroundColor: themeColors.charts.tooltipBg,
                                borderColor: themeColors.charts.tooltipBorder,
                                color: themeColors.charts.tooltipText,
                              }}
                            >
                              <p className="font-bold leading-none">Time: {d.timestamp}</p>
                              <div className="space-y-1 pt-1">
                                <p className="text-[var(--text-secondary)] flex items-center justify-between gap-4">
                                  <span className="inline-flex items-center gap-1.5">
                                    <span
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ backgroundColor: themeColors.charts.withoutModelUsage }}
                                    />
                                    Grid-Only
                                  </span>
                                  <strong className="text-[var(--text-primary)]">{d.demand_without_model_kw} kW</strong>
                                </p>
                                <p className="text-[var(--text-secondary)] flex items-center justify-between gap-4">
                                  <span className="inline-flex items-center gap-1.5">
                                    <span
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ backgroundColor: themeColors.charts.naiveBatteryUsage }}
                                    />
                                    Naive BESS Grid
                                  </span>
                                  <strong className="text-[var(--text-primary)]">{d.grid_draw_naive_kw} kW</strong>
                                </p>
                                <p className="text-[var(--text-secondary)] flex items-center justify-between gap-4">
                                  <span className="inline-flex items-center gap-1.5">
                                    <span
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ backgroundColor: themeColors.charts.withModelUsage }}
                                    />
                                    Phoebe AI Grid
                                  </span>
                                  <strong className="text-[var(--text-primary)]">{d.grid_draw_with_model_kw} kW</strong>
                                </p>
                                <p className="text-[var(--text-secondary)] flex items-center justify-between gap-4">
                                  <span className="inline-flex items-center gap-1.5">
                                    <span
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ backgroundColor: themeColors.charts.batteryDischarge }}
                                    />
                                    BESS Out
                                  </span>
                                  <strong className="text-[var(--text-primary)]">{d.battery_output_kw} kW</strong>
                                </p>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="demand_without_model_kw"
                      stroke={themeColors.charts.withoutModelUsage}
                      strokeWidth={1.5}
                      fill="url(#usageWithoutGrad)"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="grid_draw_naive_kw"
                      stroke={themeColors.charts.naiveBatteryUsage}
                      strokeWidth={1.75}
                      strokeDasharray="4 4"
                      fill="none"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="grid_draw_with_model_kw"
                      stroke={themeColors.charts.withModelUsage}
                      strokeWidth={2}
                      fill="url(#usageWithGrad)"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="battery_output_kw"
                      stroke={themeColors.charts.batteryDischarge}
                      strokeWidth={1.75}
                      strokeDasharray="2 2"
                      fill="none"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Right Graph: Cumulative Cost Comparison (3-Way Benchmark in TL) */}
            <div className="lg:col-span-6 p-6 sm:p-8 rounded-2xl ss-card flex flex-col justify-between space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)] inline-flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg ss-icon-solar inline-flex items-center justify-center shrink-0">
                      <Zap className="w-3.5 h-3.5" />
                    </span>
                    <span className="leading-none">
                      Cumulative Peak Cost: 3-Way Benchmark ({CURRENCY.symbol})
                    </span>
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-1.5">
                    Running electricity bill during the {CURRENCY.symbol}{PHOEBE_CONFIG.tariffs.peakTl}/kWh evening peak window.
                  </p>
                </div>
                {/* 3 Pills Stacked 2 Top, 1 Bottom */}
                <div className="grid grid-cols-2 gap-1.5 shrink-0">
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full ss-well text-[var(--text-primary)] inline-flex items-center justify-center gap-1.5 leading-none">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: themeColors.charts.withoutModelCost }}
                    />
                    Grid-Only ({CURRENCY.symbol})
                  </span>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full ss-well text-[var(--text-primary)] inline-flex items-center justify-center gap-1.5 leading-none">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: themeColors.charts.naiveBatteryCost }}
                    />
                    Naive BESS ({CURRENCY.symbol})
                  </span>
                  <div className="col-span-2 flex justify-center">
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full ss-well text-[var(--text-primary)] inline-flex items-center justify-center gap-1.5 leading-none">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: themeColors.charts.withModelCost }}
                      />
                      Phoebe AI ({CURRENCY.symbol})
                    </span>
                  </div>
                </div>
              </div>

              <div className="h-64 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={visibleTimeline} margin={{ top: 10, right: 10, left: -5, bottom: 0 }}>
                    <defs>
                      <linearGradient id="costWithoutGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={themeColors.charts.withoutModelCost} stopOpacity={0.10} />
                        <stop offset="95%" stopColor={themeColors.charts.withoutModelCost} stopOpacity={0.00} />
                      </linearGradient>
                      <linearGradient id="costWithGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={themeColors.charts.withModelCost} stopOpacity={0.16} />
                        <stop offset="95%" stopColor={themeColors.charts.withModelCost} stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={themeColors.charts.gridLines} />
                    <XAxis dataKey="timestamp" stroke={themeColors.charts.axisText} fontSize={11} tickLine={false} />
                    <YAxis
                      stroke={themeColors.charts.axisText}
                      fontSize={11}
                      tickLine={false}
                      tickFormatter={(v) => `${CURRENCY.symbol}${v}`}
                    />
                    <Tooltip
                      cursor={{ stroke: themeColors.charts.cursorStroke, strokeWidth: 1, strokeDasharray: '3 3' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          return (
                            <div
                              className="border p-3 rounded-xl text-xs space-y-1.5 shadow-lg tabular-nums"
                              style={{
                                backgroundColor: themeColors.charts.tooltipBg,
                                borderColor: themeColors.charts.tooltipBorder,
                                color: themeColors.charts.tooltipText,
                              }}
                            >
                              <p className="font-bold leading-none">Time: {d.timestamp}</p>
                              <div className="space-y-1 pt-1">
                                <p className="text-[var(--text-secondary)] flex items-center justify-between gap-4">
                                  <span className="inline-flex items-center gap-1.5">
                                    <span
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ backgroundColor: themeColors.charts.withoutModelCost }}
                                    />
                                    Grid-Only Cost
                                  </span>
                                  <strong className="text-[var(--text-primary)]">
                                    {CURRENCY.symbol}{d.cumulative_cost_without_model_tl?.toFixed(2)}
                                  </strong>
                                </p>
                                <p className="text-[var(--text-secondary)] flex items-center justify-between gap-4">
                                  <span className="inline-flex items-center gap-1.5">
                                    <span
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ backgroundColor: themeColors.charts.naiveBatteryCost }}
                                    />
                                    Naive Battery Cost
                                  </span>
                                  <strong className="text-[var(--text-primary)]">
                                    {CURRENCY.symbol}{d.cumulative_cost_naive_tl?.toFixed(2)}
                                  </strong>
                                </p>
                                <p className="text-[var(--text-secondary)] flex items-center justify-between gap-4">
                                  <span className="inline-flex items-center gap-1.5">
                                    <span
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ backgroundColor: themeColors.charts.withModelCost }}
                                    />
                                    Phoebe AI Cost
                                  </span>
                                  <strong className="text-[var(--text-primary)]">
                                    {CURRENCY.symbol}{d.cumulative_cost_with_model_tl?.toFixed(2)}
                                  </strong>
                                </p>
                                <div className="pt-1.5 border-t border-[var(--border-subtle)] space-y-0.5">
                                  <p className="text-[#37645C] dark:text-[#84C5B9] font-bold flex items-center justify-between gap-4">
                                    <span>Saved vs Grid:</span>
                                    <span>+{CURRENCY.symbol}{d.cumulative_savings_tl?.toFixed(2)}</span>
                                  </p>
                                  <p className="text-[var(--text-primary)] font-semibold flex items-center justify-between gap-4">
                                    <span>Extra vs Naive:</span>
                                    <span>+{CURRENCY.symbol}{d.cumulative_ai_vs_naive_savings_tl?.toFixed(2)}</span>
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="cumulative_cost_without_model_tl"
                      stroke={themeColors.charts.withoutModelCost}
                      strokeWidth={1.5}
                      fill="url(#costWithoutGrad)"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="cumulative_cost_naive_tl"
                      stroke={themeColors.charts.naiveBatteryCost}
                      strokeWidth={1.75}
                      strokeDasharray="4 4"
                      fill="none"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="cumulative_cost_with_model_tl"
                      stroke={themeColors.charts.withModelCost}
                      strokeWidth={2}
                      fill="url(#costWithGrad)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Bottom Section: Live AI Decision Telemetry Log & 180-Min Input Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left 7 Cols: Live MPC Action Log */}
            <div className="lg:col-span-7 p-6 rounded-2xl ss-card space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[var(--text-primary)] inline-flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg ss-icon-solar inline-flex items-center justify-center shrink-0">
                    <Terminal className="w-3.5 h-3.5" />
                  </span>
                  <span className="leading-none">Phoebe MPC Decision & Rationing Ledger</span>
                </h3>
                <span className="text-[11px] font-bold tabular-nums px-2.5 py-0.5 rounded-full ss-well text-[var(--text-secondary)] leading-none">
                  {visibleLogs.length} events logged
                </span>
              </div>

              <div className="ss-well rounded-xl p-4 h-44 overflow-y-auto space-y-2 tabular-nums text-xs">
                {visibleLogs.map((logEntry, index) => (
                  <div
                    key={index}
                    className={`flex items-start gap-2.5 leading-relaxed ${
                      index === visibleLogs.length - 1
                        ? 'text-[var(--text-primary)] font-bold'
                        : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    <span className="text-[#F5AD46] font-bold select-none">›</span>
                    <span>{logEntry}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right 5 Cols: Key Simulation Details & Input Summary */}
            <div className="lg:col-span-5 p-6 rounded-2xl ss-card space-y-4">
              <h3 className="text-sm font-bold text-[var(--text-primary)] inline-flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg ss-icon-solar inline-flex items-center justify-center shrink-0">
                  <Database className="w-3.5 h-3.5" />
                </span>
                <span className="leading-none">Model & 3-Way Benchmark Summary</span>
              </h3>

              <div className="space-y-2.5 text-xs divide-y divide-[var(--border-subtle)] tabular-nums">
                <div className="flex justify-between pt-1">
                  <span className="text-[var(--text-secondary)]">Forecaster Architecture:</span>
                  <span className="text-[var(--text-primary)] font-bold">
                    RandomForest (5-Hour Rolling Forecaster)
                  </span>
                </div>
                <div className="flex justify-between pt-2.5">
                  <span className="text-[var(--text-secondary)]">Historical Lookback Window:</span>
                  <span className="text-[var(--text-primary)] font-bold">
                    {simulation?.past_180_summary?.count || 180} mins (Avg{' '}
                    {simulation?.past_180_summary?.avg_kw || 0} kW)
                  </span>
                </div>
                <div className="flex justify-between pt-2.5">
                  <span className="text-[var(--text-secondary)]">Naive Battery Depletion:</span>
                  <span className="text-[var(--text-primary)] font-bold">
                    {simulation?.financials?.naive_depleted_timestamp
                      ? `${simulation.financials.naive_depleted_timestamp} (Runs Dry Early)`
                      : 'Sustained full horizon'}
                  </span>
                </div>
                <div className="flex justify-between pt-2.5">
                  <span className="text-[var(--text-secondary)]">Extra AI vs. Naive Savings:</span>
                  <span className="text-[#37645C] dark:text-[#84C5B9] font-bold">
                    +{CURRENCY.symbol}{simulation?.financials?.ai_vs_naive_savings_tl?.toFixed(2) || '0.00'}{' '}
                    (+{simulation?.financials?.ai_vs_naive_percent || 0}%)
                  </span>
                </div>
                <div className="flex justify-between pt-2.5">
                  <span className="text-[var(--text-secondary)]">Total Savings vs. Grid-Only:</span>
                  <span className="text-[#37645C] dark:text-[#84C5B9] font-bold">
                    +{CURRENCY.symbol}{simulation?.financials?.total_savings_tl?.toFixed(2) || '0.00'}{' '}
                    ({simulation?.financials?.savings_percent || 0}%)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
