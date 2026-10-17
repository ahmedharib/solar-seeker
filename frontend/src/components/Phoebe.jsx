import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Sparkles,
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
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { THEME_COLORS } from '../constants/theme';
import { PHOEBE_CONFIG, CURRENCY } from '../constants/config';

export default function Phoebe({ isTabActive = true }) {
  const fileInputRef = useRef(null);

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
      setIsPlaying(false); // Do not auto-play; require explicit user action to start
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
  const timeline = simulation?.timeline || [];
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
    const cumSavingsTl = currentStep.cumulative_savings_tl || (cumCostWithoutTl - cumCostWithTl);
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
        <div className="p-4 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-200 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5 -translate-y-px" />
          <div className="text-xs">
            <p className="font-semibold text-rose-100 leading-none">Phoebe Simulation Error</p>
            <p className="text-rose-200/90 text-[11px] mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Top Section: Header & Data Source Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left 7 Cols: Dataset Selector / CSV Upload */}
        <div className="lg:col-span-7 p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-col justify-between space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0 -translate-y-px" />
                <h2 className="text-base font-bold text-white tracking-tight leading-none">
                  Phoebe — AI Home Energy Management System
                </h2>
              </div>
              <p className="text-xs text-zinc-400 mt-1.5">
                RandomForest rolling horizon forecaster & Model Predictive Control (MPC) battery dispatch.
              </p>
            </div>

            {/* Dual Input Mode Toggle */}
            <div className="bg-zinc-900 border border-zinc-800 p-1 rounded-full inline-flex items-center gap-1 self-start sm:self-auto shrink-0 shadow-inner">
              <button
                type="button"
                onClick={() => {
                  setSourceMode('sample');
                  setError(null);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
                  sourceMode === 'sample'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Database className="w-3.5 h-3.5 shrink-0 -translate-y-px" />
                <span className="leading-none">Test Data CSV</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSourceMode('upload');
                  setError(null);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
                  sourceMode === 'upload'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <UploadCloud className="w-3.5 h-3.5 shrink-0 -translate-y-px" />
                <span className="leading-none">Upload CSV</span>
              </button>
            </div>
          </div>

          {/* Mode A: Built-in Test CSV (data/phoebe-test-data.csv) */}
          {sourceMode === 'sample' ? (
            <div className="flex-1 flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="inline-flex items-center gap-1.5 font-medium text-zinc-300">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400 shrink-0 -translate-y-px" />
                  <span className="leading-none">Active Dataset: data/phoebe-test-data.csv (180-Min Input Window)</span>
                </span>
                <span className="text-xs font-mono text-zinc-500 leading-none">
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
                          ? 'bg-zinc-900 border-amber-400/60 shadow-sm'
                          : 'bg-zinc-950/70 border-zinc-800/80 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-semibold leading-none ${active ? 'text-amber-400' : 'text-zinc-200'}`}>
                          {preset.label}
                        </span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border leading-none ${
                          active
                            ? 'bg-amber-400/10 text-amber-400 border-amber-400/20'
                            : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                        }`}>
                          {preset.badge || (active ? 'Selected' : 'Household')}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
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
                  ? 'border-amber-400 bg-amber-400/5'
                  : 'border-zinc-800 hover:border-zinc-700 bg-zinc-950/60'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              />
              <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-3 text-amber-400">
                <UploadCloud className="w-6 h-6" />
              </div>
              {csvFile ? (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-white">{csvFile.name}</p>
                  <p className="text-xs text-zinc-400">
                    {(csvFile.size / 1024).toFixed(1)} KB · Click or drop another CSV to replace
                  </p>
                  <p className="text-xs font-mono text-emerald-400 pt-1">
                    ✓ CSV staged — Click "Run Simulation" below to forecast
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-zinc-200">
                    Drop your household consumption <span className="text-amber-400 font-mono">.csv</span> here, or click to browse
                  </p>
                  <p className="text-xs text-zinc-500">
                    Reads the last 180 minutes of power demand (kW) from column 0 to forecast the peak window
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right 5 Cols: EPDK Tariff Tiers & Symmetrical BESS Configuration */}
        <div className="lg:col-span-5 p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-col justify-between space-y-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-white inline-flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400 shrink-0 -translate-y-px" />
              <span className="leading-none">EPDK 3-Tier Tariff & BESS Setup</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Time-of-use tariffs and peak-shaving storage parameters.
            </p>
          </div>

          {/* 3-Tier EPDK Rate Pills */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80">
              <div className="text-[10px] text-zinc-500 font-mono leading-none">Night (22–06)</div>
              <div className="text-sm font-bold text-white font-mono mt-1">
                {CURRENCY.symbol}{PHOEBE_CONFIG.tariffs.nightTl}
              </div>
              <div className="text-[10px] text-zinc-400 mt-0.5 leading-none">Off-Peak Charge</div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80">
              <div className="text-[10px] text-zinc-500 font-mono leading-none">Day (06–17)</div>
              <div className="text-sm font-bold text-white font-mono mt-1">
                {CURRENCY.symbol}{PHOEBE_CONFIG.tariffs.dayTl}
              </div>
              <div className="text-[10px] text-zinc-400 mt-0.5 leading-none">Standard Tariff</div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80">
              <div className="text-[10px] text-zinc-500 font-mono leading-none">Peak (17–22)</div>
              <div className="text-sm font-bold text-amber-400 font-mono mt-1">
                {CURRENCY.symbol}{PHOEBE_CONFIG.tariffs.peakTl}
              </div>
              <div className="text-[10px] text-zinc-400 mt-0.5 leading-none">AI Peak Window</div>
            </div>
          </div>

          {/* Permanent Stable BESS Parameter Controls (Zero layout shifts) */}
          <div className="grid grid-cols-3 gap-3 pt-1">
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1 leading-none">
                Capacity (kWh)
              </label>
              <input
                type="number"
                step="1"
                min="2"
                max="50"
                value={batteryCapacityKwh}
                onChange={(e) => setBatteryCapacityKwh(parseFloat(e.target.value) || PHOEBE_CONFIG.batteryCapacityKwh)}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-500 rounded-xl px-3 py-2 text-xs text-white font-mono transition-colors"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1 leading-none">
                17:00 SoC (%)
              </label>
              <input
                type="number"
                step="5"
                min="10"
                max="100"
                value={initialSocPercent}
                onChange={(e) => setInitialSocPercent(parseFloat(e.target.value) || PHOEBE_CONFIG.initialSocPercent)}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-500 rounded-xl px-3 py-2 text-xs text-white font-mono transition-colors"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1 leading-none">
                Max Out (kW)
              </label>
              <input
                type="number"
                step="0.5"
                min="1"
                max="20"
                value={maxOutputKw}
                onChange={(e) => setMaxOutputKw(parseFloat(e.target.value) || PHOEBE_CONFIG.maxOutputKw)}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-500 rounded-xl px-3 py-2 text-xs text-white font-mono transition-colors"
              />
            </div>
          </div>

          {/* Active EPDK Peak Window Badge */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 text-xs">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-zinc-300 font-medium">EPDK Peak Window</span>
            </div>
            <span className="font-mono text-zinc-400 text-xs">
              17:00 – 22:00 (5 Hours)
            </span>
          </div>

          {/* Primary Run / Re-run Simulation Button - Crisp White */}
          <button
            type="button"
            onClick={() => handleRunSimulation()}
            disabled={isSimulating || (sourceMode === 'upload' && !csvFile)}
            className={`w-full py-4 px-6 rounded-full font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer ${
              isSimulating || (sourceMode === 'upload' && !csvFile)
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700/60'
                : 'bg-white hover:bg-zinc-200 text-zinc-950 active:scale-[0.99]'
            }`}
          >
            {isSimulating ? (
              <>
                <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin shrink-0" />
                <span className="leading-none">Forecasting Demand & Calculating MPC Dispatch...</span>
              </>
            ) : !simulation ? (
              <>
                <Play className="w-4 h-4 fill-zinc-950 shrink-0 ml-0.5" />
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
        <div className="p-8 sm:p-12 rounded-2xl bg-zinc-900/30 border border-zinc-800 text-center space-y-6">
          <div className="w-14 h-14 rounded-2xl bg-amber-400/10 border border-amber-400/20 text-amber-400 flex items-center justify-center mx-auto">
            <Sparkles className="w-7 h-7" />
          </div>
          <div className="max-w-xl mx-auto space-y-2">
            <h3 className="text-base font-bold text-white tracking-tight">
              Ready to Forecast & Optimize Battery Dispatch
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Phoebe uses an AI RandomForest model trained on historical load data to forecast 5 hours of power demand during the EPDK peak window (17:00–22:00 at {CURRENCY.symbol}{PHOEBE_CONFIG.tariffs.peakTl}/kWh). Model Predictive Control (MPC) schedules battery discharge to shave costly spikes, outperforming naive batteries and lowering your electricity bill.
            </p>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => handleRunSimulation()}
              disabled={isSimulating || (sourceMode === 'upload' && !csvFile)}
              className="py-3.5 px-6 rounded-full bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-xs sm:text-sm inline-flex items-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSimulating ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                  <span>Forecasting Demand & Calculating MPC Dispatch...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-zinc-950 ml-0.5" />
                  <span>Run 5-Hour Peak Simulation</span>
                </>
              )}
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-zinc-500 pt-2 font-mono">
            <span>✓ 3-Way Benchmark Comparison</span>
            <span>✓ EPDK 5-Hour Evening Peak (17:00–22:00)</span>
            <span>✓ 180-min rolling history</span>
          </div>
        </div>
      )}

      {/* Post-Simulation Results & Interactive Timelapse */}
      {simulation && (
        <>
          {/* Interactive Timelapse Playback Bar */}
          <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Play / Pause / Resume Button - Crisp White */}
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
                className="px-4 py-2 rounded-full bg-white hover:bg-zinc-200 text-zinc-950 flex items-center gap-2 font-semibold text-xs transition-colors shrink-0 cursor-pointer shadow-sm"
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
                    <Pause className="w-3.5 h-3.5 fill-zinc-950 shrink-0" />
                    <span className="leading-none">Pause Timelapse</span>
                  </>
                ) : currentStepIndex >= totalSteps - 1 ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                    <span className="leading-none">Replay Timelapse</span>
                  </>
                ) : currentStepIndex === 0 ? (
                  <>
                    <Play className="w-3.5 h-3.5 fill-zinc-950 shrink-0 ml-0.5" />
                    <span className="leading-none">Start Timelapse</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-zinc-950 shrink-0 ml-0.5" />
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
                className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
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
                className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                title={`Skip to End (${endTimestamp})`}
              >
                <FastForward className="w-3.5 h-3.5" />
              </button>

              <div className="pl-3 border-l border-zinc-800">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0 -translate-y-px" />
                  <span className="text-sm font-bold text-white font-mono leading-none">
                    {currentStep?.timestamp || '17:00'}
                  </span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 leading-none">
                    Min {currentStepIndex + 1} / {totalSteps}
                  </span>
                  {isPlaying ? (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 leading-none animate-pulse">
                      Live Playing
                    </span>
                  ) : currentStepIndex >= totalSteps - 1 ? (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 leading-none">
                      Completed
                    </span>
                  ) : currentStepIndex > 0 ? (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20 leading-none">
                      Paused
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 leading-none">
                      Ready to Play
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-1 leading-none">
                  Source: <span className="text-zinc-200 font-medium">{simulation.source_label}</span>
                </p>
              </div>
            </div>

            {/* Timeline Scrubber */}
            <div className="flex-1 max-w-xl flex items-center gap-3">
              <span className="text-xs font-mono text-zinc-500">17:00</span>
              <input
                type="range"
                min={0}
                max={Math.max(0, totalSteps - 1)}
                value={currentStepIndex}
                onChange={(e) => {
                  setIsPlaying(false);
                  setCurrentStepIndex(Number(e.target.value));
                }}
                className="w-full accent-amber-400 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
              />
              <span className="text-xs font-mono text-zinc-500">{endTimestamp}</span>
            </div>

            {/* Speed Selector */}
            <div className="flex items-center gap-1.5 self-end md:self-auto">
              <span className="text-xs text-zinc-500 mr-1 leading-none">Speed:</span>
              {PHOEBE_CONFIG.playbackSpeeds.map((s, idx) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setSpeedIndex(idx)}
                  className={`text-xs font-mono px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                    speedIndex === idx
                      ? 'bg-zinc-800 text-amber-400 border-amber-400/40 font-semibold shadow-sm'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3-Way Benchmark Executive Comparison Scoreboard: Harmonious Symmetrical Dark Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {/* Arm 1: Grid-Only (No Battery) */}
            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 relative overflow-hidden flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Grid-Only</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 leading-none">
                    No Battery (Baseline)
                  </span>
                </div>
                <div>
                  <div className="text-[11px] text-zinc-500 font-mono leading-none">Cumulative Peak Bill</div>
                  <div className="text-2xl font-bold text-white font-mono mt-1 leading-tight">
                    {CURRENCY.symbol}{liveMetrics.cumCostWithoutTl.toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-3 border-t border-zinc-800/80">
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div>
                    <span className="text-zinc-500 block text-[10px] leading-none mb-1">Grid Import</span>
                    <span className="text-zinc-300 font-semibold">{liveMetrics.cumDemandKwh} kWh</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px] leading-none mb-1">Peak Exposure</span>
                    <span className="text-rose-400 font-semibold">100% Utility</span>
                  </div>
                </div>
                <p className="text-xs text-zinc-500 leading-snug">
                  Unmitigated peak grid draw at {CURRENCY.symbol}{PHOEBE_CONFIG.tariffs.peakTl}/kWh + progressive overload surcharge.
                </p>
              </div>
            </div>

            {/* Arm 2: Naive / Standard Battery */}
            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 relative overflow-hidden flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Naive Battery</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 leading-none">
                    Standard BESS (No AI)
                  </span>
                </div>
                <div>
                  <div className="text-[11px] text-zinc-500 font-mono leading-none">Cumulative Peak Bill</div>
                  <div className="text-2xl font-bold text-amber-400 font-mono mt-1 leading-tight">
                    {CURRENCY.symbol}{liveMetrics.cumCostNaiveTl.toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-3 border-t border-zinc-800/80">
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div>
                    <span className="text-zinc-500 block text-[10px] leading-none mb-1">Grid Import</span>
                    <span className="text-zinc-300 font-semibold">{liveMetrics.cumGridNaiveKwh} kWh</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px] leading-none mb-1">Battery State</span>
                    <span className={liveMetrics.naiveSocPercent <= 0.1 ? 'text-amber-400 font-bold' : 'text-zinc-300 font-semibold'}>
                      {liveMetrics.naiveSocPercent}% SoC
                    </span>
                  </div>
                </div>
                <p className="text-xs text-zinc-400 leading-snug">
                  {liveMetrics.naiveSocPercent <= 0.1 ? (
                    <span className="text-amber-400 font-medium">
                      ⚠️ Depleted at {liveMetrics.naiveDepletedTimestamp || '18:38'} (0% SoC). Exhausted early, leaving late peaks exposed.
                    </span>
                  ) : (
                    <span>Greedy unmanaged dispatch discharges at full power on early base loads.</span>
                  )}
                </p>
              </div>
            </div>

            {/* Arm 3: Phoebe AI - Harmonized to Matching Surface */}
            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 relative overflow-hidden flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Phoebe AI</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold leading-none">
                    AI + MPC Dispatch
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <div>
                    <div className="text-[11px] text-zinc-500 font-mono leading-none">Cumulative Peak Bill</div>
                    <div className="text-2xl font-bold text-emerald-400 font-mono mt-1 leading-tight">
                      {CURRENCY.symbol}{liveMetrics.cumCostWithTl.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-zinc-500 font-mono leading-none">Extra vs Naive</div>
                    <div className="text-sm font-bold text-amber-400 font-mono mt-1 leading-tight">
                      +{CURRENCY.symbol}{liveMetrics.aiVsNaiveSavingsTl.toFixed(2)} (+{liveMetrics.aiVsNaivePercent}%)
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-3 border-t border-zinc-800/80">
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div>
                    <span className="text-zinc-500 block text-[10px] leading-none mb-1">Grid Import</span>
                    <span className="text-emerald-400 font-semibold">{liveMetrics.cumGridWithKwh} kWh</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px] leading-none mb-1">Battery State</span>
                    <span className="text-emerald-400 font-semibold">{liveMetrics.socPercent}% SoC ({liveMetrics.remainingKwh} kWh)</span>
                  </div>
                </div>
                <p className="text-xs text-zinc-300 leading-snug">
                  RandomForest rolling forecaster + dynamic MPC spike rationing preserves battery across all {forecastHorizon / 60} hours.
                </p>
              </div>
            </div>
          </div>

          {/* 4 Live Telemetry KPI Cards - Clean White Figures with Subtle Semantic Indicators */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Card 1: Grid Usage Reduction */}
            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="leading-none">Grid Usage Shaved</span>
                <TrendingDown className="w-4 h-4 text-amber-400 shrink-0" />
              </div>
              <div className="text-2xl font-bold text-white tracking-tight font-mono">
                {liveMetrics.usageReductionPercent}%
              </div>
              <p className="text-xs text-zinc-500 leading-tight font-mono">
                {(liveMetrics.cumDemandKwh - liveMetrics.cumGridWithKwh).toFixed(2)} kWh demand shifted to battery
              </p>
            </div>

            {/* Card 2: Peak Cost Savings vs Grid */}
            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="leading-none">Net Peak Savings</span>
                <span className="text-emerald-400 font-mono text-xs font-semibold leading-none">
                  -{liveMetrics.savingsPercent}% Bill
                </span>
              </div>
              <div className="text-2xl font-bold text-white tracking-tight font-mono">
                {CURRENCY.symbol}{liveMetrics.cumSavingsTl.toFixed(2)}
              </div>
              <p className="text-xs text-zinc-500 leading-tight font-mono">
                Total reduction vs. Grid-Only baseline
              </p>
            </div>

            {/* Card 3: Phoebe Battery State (SoC) */}
            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="leading-none">Phoebe Battery (SoC)</span>
                <BatteryCharging className="w-4 h-4 text-amber-400 shrink-0" />
              </div>
              <div className="text-2xl font-bold text-white tracking-tight font-mono">
                {liveMetrics.socPercent}%{' '}
                <span className="text-xs font-normal text-zinc-400 font-mono">
                  ({liveMetrics.remainingKwh} kWh)
                </span>
              </div>
              <p className="text-xs text-zinc-500 leading-tight font-mono">
                MPC Cap: <strong className="text-zinc-200">{liveMetrics.dischargeCapKw} kW</strong> · Out: <strong className="text-sky-400">{liveMetrics.batteryOutputKw} kW</strong>
              </p>
            </div>

            {/* Card 4: Grid Independence Score */}
            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="leading-none">Grid Independence</span>
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              </div>
              <div className="text-2xl font-bold text-white tracking-tight font-mono">
                {liveMetrics.gridIndependenceScore}%
              </div>
              <p className="text-xs text-zinc-500 leading-tight font-mono">
                <strong className="text-zinc-300">{liveMetrics.minutesOffGrid}</strong> of {currentStepIndex + 1} mins 100% off-grid
              </p>
            </div>
          </div>

          {/* Dual Comparison Graphs: Symmetrical Equal Heights with Harsh White Overlay Eliminated */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left Graph: Power Usage Comparison (3-Way Benchmark) */}
            <div className="lg:col-span-6 p-6 sm:p-8 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-col justify-between space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-white inline-flex items-center gap-2">
                    <Activity className="w-4 h-4 text-amber-400 shrink-0 -translate-y-px" />
                    <span className="leading-none">Grid Power Usage: 3-Way Benchmark (kW)</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1.5">
                    Grid-Only demand vs. Naive greedy battery vs. Phoebe AI MPC peak-shaving.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-1.5 shrink-0">
                  <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 leading-none text-center">
                    Grid-Only
                  </span>
                  <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 leading-none text-center">
                    Naive Battery
                  </span>
                  <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 leading-none text-center">
                    Phoebe AI
                  </span>
                  <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 leading-none text-center">
                    BESS Out
                  </span>
                </div>
              </div>

              <div className="h-64 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={visibleTimeline} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <defs>
                      <linearGradient id="usageWithoutGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={THEME_COLORS.charts.withoutModelUsage} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={THEME_COLORS.charts.withoutModelUsage} stopOpacity={0.01} />
                      </linearGradient>
                      <linearGradient id="usageWithGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={THEME_COLORS.charts.withModelUsage} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={THEME_COLORS.charts.withModelUsage} stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={THEME_COLORS.charts.gridLines} />
                    <XAxis dataKey="timestamp" stroke={THEME_COLORS.charts.axisText} fontSize={11} tickLine={false} />
                    <YAxis
                      stroke={THEME_COLORS.charts.axisText}
                      fontSize={11}
                      tickLine={false}
                      tickFormatter={(v) => `${v}kW`}
                    />
                    <Tooltip
                      cursor={{ stroke: '#52525b', strokeWidth: 1, strokeDasharray: '3 3' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          return (
                            <div
                              className="border p-3 rounded-xl text-xs space-y-1.5 shadow-lg font-mono"
                              style={{
                                backgroundColor: THEME_COLORS.charts.tooltipBg,
                                borderColor: THEME_COLORS.charts.tooltipBorder,
                              }}
                            >
                              <p className="font-semibold text-white leading-none">Time: {d.timestamp}</p>
                              <p className="text-rose-400">
                                Grid-Only Demand: <strong>{d.demand_without_model_kw} kW</strong>
                              </p>
                              <p className="text-amber-400">
                                Naive Battery Grid: <strong>{d.grid_draw_naive_kw} kW</strong> (SoC: {d.battery_soc_naive_percent}%)
                              </p>
                              <p className="text-emerald-400">
                                Phoebe AI Grid: <strong>{d.grid_draw_with_model_kw} kW</strong> (SoC: {d.battery_soc_percent}%)
                              </p>
                              <p className="text-sky-400">
                                Phoebe BESS Output: <strong>{d.battery_output_kw} kW</strong> <span className="text-zinc-400 text-[10px]">(Cap: {d.discharge_cap_kw} kW)</span>
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="demand_without_model_kw"
                      stroke={THEME_COLORS.charts.withoutModelUsage}
                      strokeWidth={1.5}
                      fill="url(#usageWithoutGrad)"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="grid_draw_naive_kw"
                      stroke={THEME_COLORS.charts.naiveBatteryUsage}
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      fill="none"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="grid_draw_with_model_kw"
                      stroke={THEME_COLORS.charts.withModelUsage}
                      strokeWidth={2.5}
                      fill="url(#usageWithGrad)"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="battery_output_kw"
                      stroke={THEME_COLORS.charts.batteryDischarge}
                      strokeWidth={1.5}
                      strokeDasharray="2 2"
                      fill="none"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Right Graph: Cumulative Cost Comparison (3-Way Benchmark in TL) */}
            <div className="lg:col-span-6 p-6 sm:p-8 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-col justify-between space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-white inline-flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400 shrink-0 -translate-y-px" />
                    <span className="leading-none">
                      Cumulative Peak Cost: 3-Way Benchmark ({CURRENCY.symbol})
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1.5">
                    Running electricity bill during the {CURRENCY.symbol}{PHOEBE_CONFIG.tariffs.peakTl}/kWh evening peak window.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-1.5 shrink-0">
                  <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 leading-none text-center">
                    Grid-Only ({CURRENCY.symbol})
                  </span>
                  <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 leading-none text-center">
                    Naive BESS ({CURRENCY.symbol})
                  </span>
                  <div className="col-span-2 flex justify-center">
                    <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 leading-none text-center">
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
                        <stop offset="5%" stopColor={THEME_COLORS.charts.withoutModelCost} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={THEME_COLORS.charts.withoutModelCost} stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="costWithGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={THEME_COLORS.charts.withModelCost} stopOpacity={0.45} />
                        <stop offset="95%" stopColor={THEME_COLORS.charts.withModelCost} stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={THEME_COLORS.charts.gridLines} />
                    <XAxis dataKey="timestamp" stroke={THEME_COLORS.charts.axisText} fontSize={11} tickLine={false} />
                    <YAxis
                      stroke={THEME_COLORS.charts.axisText}
                      fontSize={11}
                      tickLine={false}
                      tickFormatter={(v) => `${CURRENCY.symbol}${v}`}
                    />
                    <Tooltip
                      cursor={{ stroke: '#52525b', strokeWidth: 1, strokeDasharray: '3 3' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          return (
                            <div
                              className="border p-3 rounded-xl text-xs space-y-1.5 shadow-lg font-mono"
                              style={{
                                backgroundColor: THEME_COLORS.charts.tooltipBg,
                                borderColor: THEME_COLORS.charts.tooltipBorder,
                              }}
                            >
                              <p className="font-semibold text-white leading-none">Time: {d.timestamp}</p>
                              <p className="text-rose-400">
                                Grid-Only Cost: <strong>{CURRENCY.symbol}{d.cumulative_cost_without_model_tl?.toFixed(2)}</strong>
                              </p>
                              <p className="text-amber-400">
                                Naive Battery Cost: <strong>{CURRENCY.symbol}{d.cumulative_cost_naive_tl?.toFixed(2)}</strong>
                              </p>
                              <p className="text-emerald-400">
                                Phoebe AI Cost: <strong>{CURRENCY.symbol}{d.cumulative_cost_with_model_tl?.toFixed(2)}</strong>
                              </p>
                              <div className="pt-1 border-t border-zinc-800 space-y-0.5">
                                <p className="text-emerald-400 font-bold">
                                  Saved vs Grid: +{CURRENCY.symbol}{d.cumulative_savings_tl?.toFixed(2)}
                                </p>
                                <p className="text-amber-400 font-bold">
                                  Extra vs Naive: +{CURRENCY.symbol}{d.cumulative_ai_vs_naive_savings_tl?.toFixed(2)}
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
                      dataKey="cumulative_cost_without_model_tl"
                      stroke={THEME_COLORS.charts.withoutModelCost}
                      strokeWidth={1.5}
                      fill="url(#costWithoutGrad)"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="cumulative_cost_naive_tl"
                      stroke={THEME_COLORS.charts.naiveBatteryCost}
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      fill="none"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="cumulative_cost_with_model_tl"
                      stroke={THEME_COLORS.charts.withModelCost}
                      strokeWidth={2.5}
                      fill="url(#costWithGrad)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

      {/* Bottom Section: Live AI Decision Telemetry Log & 180-Min Input Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Cols: Live MPC Action Log */}
        <div className="lg:col-span-7 p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white inline-flex items-center gap-2">
              <Terminal className="w-4 h-4 text-amber-400 shrink-0 -translate-y-px" />
              <span className="leading-none">Phoebe MPC Decision & Rationing Ledger</span>
            </h3>
            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 leading-none">
              {visibleLogs.length} events logged
            </span>
          </div>

          <div className="bg-zinc-950 border border-zinc-800/90 rounded-xl p-4 h-44 overflow-y-auto space-y-2 font-mono text-xs">
            {visibleLogs.map((logEntry, index) => (
              <div
                key={index}
                className={`flex items-start gap-2.5 leading-relaxed ${
                  index === visibleLogs.length - 1 ? 'text-amber-400 font-semibold' : 'text-zinc-400'
                }`}
              >
                <span className="text-zinc-600 select-none">›</span>
                <span>{logEntry}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right 5 Cols: Key Simulation Details & Input Summary */}
        <div className="lg:col-span-5 p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 space-y-4">
          <h3 className="text-sm font-semibold text-white inline-flex items-center gap-2">
            <Database className="w-4 h-4 text-amber-400 shrink-0 -translate-y-px" />
            <span className="leading-none">Model & 3-Way Benchmark Summary</span>
          </h3>

          <div className="space-y-2.5 text-xs divide-y divide-zinc-800/80">
            <div className="flex justify-between pt-1">
              <span className="text-zinc-400">Forecaster Architecture:</span>
              <span className="text-zinc-200 font-mono">
                RandomForest (5-Hour Rolling Forecaster)
              </span>
            </div>
            <div className="flex justify-between pt-2.5">
              <span className="text-zinc-400">Historical Lookback Window:</span>
              <span className="text-zinc-200 font-mono">
                {simulation?.past_180_summary?.count || 180} mins (Avg {simulation?.past_180_summary?.avg_kw || 0} kW)
              </span>
            </div>
            <div className="flex justify-between pt-2.5">
              <span className="text-zinc-400">Naive Battery Depletion:</span>
              <span className="text-amber-400 font-mono font-semibold">
                {simulation?.financials?.naive_depleted_timestamp
                  ? `${simulation.financials.naive_depleted_timestamp} (Runs Dry Early)`
                  : 'Sustained full horizon'}
              </span>
            </div>
            <div className="flex justify-between pt-2.5">
              <span className="text-zinc-400">Extra AI vs. Naive Savings:</span>
              <span className="text-amber-400 font-mono font-bold">
                +{CURRENCY.symbol}{simulation?.financials?.ai_vs_naive_savings_tl?.toFixed(2) || '0.00'} (+{simulation?.financials?.ai_vs_naive_percent || 0}%)
              </span>
            </div>
            <div className="flex justify-between pt-2.5">
              <span className="text-zinc-400">Total Savings vs. Grid-Only:</span>
              <span className="text-emerald-400 font-mono font-bold">
                +{CURRENCY.symbol}{simulation?.financials?.total_savings_tl?.toFixed(2) || '0.00'} ({simulation?.financials?.savings_percent || 0}%)
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
