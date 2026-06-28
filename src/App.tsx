'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MapPin, Camera, AlertTriangle, CheckCircle, TrendingUp,
  User, Clock, ArrowRight, Upload, ShieldAlert, Award,
  List, ThumbsUp, Filter, Plus, Search, X, ChevronRight, ChevronDown, ChevronUp,
  TrendingDown, Check, Loader2, Sparkles, RefreshCw, Layers, Database, Bell, ShieldCheck, UserCheck, Zap, Activity, MessageSquare
} from 'lucide-react';
import { getDb, Issue, UserProfile, StatusUpdate, PredictiveAlert, Location } from '@/lib/db';
import { runCivSightPipeline, PipelineStep } from '@/lib/agents';

// Preset test images for judges to test out-of-the-box
const TEST_PRESETS = [
  {
    name: 'Severe Pothole',
    category: 'pothole',
    url: 'https://images.unsplash.com/photo-1515162305285-0293e4767cc2?w=500',
    description: 'Large pothole on Ashok Marg school zone, creating hazardous conditions for school buses and riders.',
    lat: 26.9154,
    lng: 75.7894
  },
  {
    name: 'Water Main Leak',
    category: 'water_leak',
    url: 'https://images.unsplash.com/photo-1486016006115-74a41448aea2?w=500',
    description: 'Burst municipal water line spilling clean drinking water across MI Road.',
    lat: 26.9124,
    lng: 75.7873
  },
  {
    name: 'Broken Streetlight',
    category: 'streetlight',
    url: 'https://images.unsplash.com/photo-1509114397022-ed747cca3f65?w=500',
    description: 'Flickering street lamp on Civil Lines Road, leaving the residential corner dark and dangerous.',
    lat: 26.9104,
    lng: 75.7854
  },
  {
    name: 'Overflowing Trash',
    category: 'waste',
    url: 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?w=500',
    description: 'Unmanaged garbage collection dumping refuse onto the park pedestrian pathway.',
    lat: 26.9204,
    lng: 75.7834
  }
];

// Presets for completed repairs (used in Field Operator AI quality check)
const AFTER_PRESETS: Record<string, { name: string; url: string; isFake?: boolean }[]> = {
  pothole: [
    { name: "Fresh Asphalt Patching", url: "https://images.unsplash.com/photo-1599740831144-5e934789139b?w=500" },
    { name: "Same Image (Fails AI Inspection)", url: "https://images.unsplash.com/photo-1515162305285-0293e4767cc2?w=500", isFake: true }
  ],
  water_leak: [
    { name: "Dry Piping & Replaced Sleeve Valve", url: "https://images.unsplash.com/photo-1542013936693-8848e574047a?w=500" },
    { name: "Same Image (Fails AI Inspection)", url: "https://images.unsplash.com/photo-1486016006115-74a41448aea2?w=500", isFake: true }
  ],
  streetlight: [
    { name: "New LED Cobra-head Luminaire", url: "https://images.unsplash.com/photo-1471341971476-ae15ff5dd4ea?w=500" },
    { name: "Same Image (Fails AI Inspection)", url: "https://images.unsplash.com/photo-1509114397022-ed747cca3f65?w=500", isFake: true }
  ],
  waste: [
    { name: "Cleared Pavement & Sanitized Area", url: "https://images.unsplash.com/photo-1534080391025-44799e9d6d7d?w=500" },
    { name: "Same Image (Fails AI Inspection)", url: "https://images.unsplash.com/photo-1530587191325-3db32d826c18?w=500", isFake: true }
  ]
};

// Safe date/time formatting helpers to prevent hydration/format crashes
const formatLocalDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'N/A';
  try {
    return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (e) {
    return 'N/A';
  }
};

const formatLocalTime = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  try {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch (e) {
    return '';
  }
};

const MAPS_API_KEY = 
  (typeof process !== 'undefined' && process.env && (
    process.env.NEXT_PUBLIC_MAPS_API_KEY ||
    (process.env as any).GOOGLE_MAPS_API_KEY ||
    (process.env as any).VITE_MAPS_API_KEY ||
    (process.env as any).VITE_GOOGLE_MAPS_API_KEY
  )) ||
  ((import.meta as any).env && (
    (import.meta as any).env.VITE_MAPS_API_KEY ||
    (import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY ||
    (import.meta as any).env.NEXT_PUBLIC_MAPS_API_KEY
  )) ||
  '';

const getRankDetails = (points: number, role: string) => {
  const pts = points || 0;
  const rolePrefix = role === 'admin' ? 'ADMIN' : role === 'worker' ? 'CREW' : 'CITIZEN';
  if (pts < 200) {
    return {
      levelName: `${rolePrefix} NODE LEVEL 1`,
      nextRankText: `NEXT RANK: 200 XP`,
      nextRankVal: 200,
      badge: "Apprentice"
    };
  } else if (pts < 500) {
    return {
      levelName: `${rolePrefix} NODE LEVEL 2`,
      nextRankText: `NEXT RANK: 500 XP`,
      nextRankVal: 500,
      badge: "Specialist"
    };
  } else if (pts < 1000) {
    return {
      levelName: `${rolePrefix} NODE LEVEL 3`,
      nextRankText: `NEXT RANK: 1000 XP`,
      nextRankVal: 1000,
      badge: "Elite"
    };
  } else if (pts < 2000) {
    return {
      levelName: `${rolePrefix} NODE LEVEL 4`,
      nextRankText: `NEXT RANK: 2000 XP`,
      nextRankVal: 2000,
      badge: "Master"
    };
  } else {
    return {
      levelName: `${rolePrefix} NODE LEVEL 5`,
      nextRankText: `MAX RANK REACHED`,
      nextRankVal: Infinity,
      badge: "Grandmaster"
    };
  }
};

const renderUserAvatar = (user: { displayName?: string; photoURL?: string } | null, sizeClasses = "w-8 h-8 text-[10px]") => {
  if (!user) return null;
  const displayName = user.displayName || 'Anonymous';
  const initials = displayName
    ? displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'U';
  
  const colors = [
    'bg-[#E8DCC4] text-[#A06828] border-[#C8873A]', // Warm Gold
    'bg-[#DCE1DE] text-[#4F5D54] border-[#8BA393]', // Soft Green
    'bg-[#E1E5EB] text-[#4B6B94] border-[#92A7C4]', // Steel Blue
    'bg-[#EADED9] text-[#8C5E58] border-[#B28D88]', // Soft Rose
  ];
  
  const charCodeSum = displayName.split('').reduce((sum: number, char: string) => sum + char.charCodeAt(0), 0);
  const colorIndex = charCodeSum % colors.length;
  const colorClass = colors[colorIndex];

  return (
    <div className={`${sizeClasses} flex items-center justify-center font-bold tracking-wider rounded-chip border select-none ${colorClass}`}>
      {initials}
    </div>
  );
};

interface SeverityRingProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

function SeverityRing({ score, size = 'md' }: SeverityRingProps) {
  // Color mapping
  let color = '#7A8C5E'; // low
  if (score >= 8) {
    color = '#B03A2E'; // critical
  } else if (score >= 5) {
    color = '#C87533'; // high
  }

  // Size mapping
  let diameter = 48;
  let fontSize = 18;
  if (size === 'sm') {
    diameter = 32;
    fontSize = 12;
  } else if (size === 'lg') {
    diameter = 64;
    fontSize = 24;
  }

  const radius = (diameter - 2.5) / 2;

  return (
    <div
      className="flex items-center justify-center select-none relative"
      style={{ width: `${diameter}px`, height: `${diameter}px` }}
    >
      <svg width={diameter} height={diameter} className="transform -rotate-90">
        <circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
        />
      </svg>
      <span
        className="absolute font-mono font-bold text-center"
        style={{ fontSize: `${fontSize}px`, color: color }}
      >
        {score}
      </span>
    </div>
  );
}

function StatusStepper({ status, updates, createdAt, resolvedAt }: { status: string; updates: StatusUpdate[]; createdAt: string; resolvedAt: string | null }) {
  const steps = [
    { key: 'reported', label: 'Reported' },
    { key: 'verified', label: 'Verified' },
    { key: 'assigned', label: 'Assigned' },
    { key: 'resolved', label: 'Resolved' }
  ];

  const currentStatus = status || 'reported';
  let currentStep = 1;
  if (currentStatus === 'reported') currentStep = 1;
  else if (currentStatus === 'verified') currentStep = 2;
  else if (currentStatus === 'assigned' || currentStatus === 'in_progress') currentStep = 3;
  else if (currentStatus === 'resolved') currentStep = 4;

  const getStepTimestamp = (stepKey: string) => {
    if (!updates || !Array.isArray(updates)) {
      if (stepKey === 'reported') return createdAt ? new Date(createdAt) : null;
      if (stepKey === 'resolved') return resolvedAt ? new Date(resolvedAt) : null;
      return null;
    }
    if (stepKey === 'reported') {
      const update = updates.find(u => u && u.status === 'reported');
      return update ? new Date(update.timestamp) : (createdAt ? new Date(createdAt) : null);
    }
    if (stepKey === 'verified') {
      const update = updates.find(u => u && u.status === 'verified');
      return update ? new Date(update.timestamp) : null;
    }
    if (stepKey === 'assigned') {
      const update = updates.find(u => u && (u.status === 'assigned' || u.status === 'in_progress'));
      return update ? new Date(update.timestamp) : null;
    }
    if (stepKey === 'resolved') {
      const update = updates.find(u => u && u.status === 'resolved');
      return update ? new Date(update.timestamp) : (resolvedAt ? new Date(resolvedAt) : null);
    }
    return null;
  };

  return (
    <div className="w-full">
      <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#9A9A9C] mb-4 select-none">Resolution Status</h4>
      <div className="relative flex justify-between items-start">
        {/* Progress Line */}
        <div className="absolute top-4 left-0 right-0 h-[1.5px] bg-[#D8D3CE] -z-10" />

        {/* Active Connector Lines */}
        <div className="absolute top-4 left-0 right-0 h-[1.5px] -z-10 flex">
          <div
            className={`h-full transition-all duration-500 ${currentStep >= 2 ? 'bg-[#C8873A]' : 'bg-transparent'}`}
            style={{ width: '33.33%' }}
          />
          <div
            className={`h-full transition-all duration-500 ${currentStep >= 3 ? 'bg-[#C8873A]' : 'bg-transparent'}`}
            style={{ width: '33.33%' }}
          />
          <div
            className={`h-full transition-all duration-500 ${currentStep >= 4 ? 'bg-[#C8873A]' : 'bg-transparent'}`}
            style={{ width: '33.33%' }}
          />
        </div>

        {steps.map((step, idx) => {
          const stepNum = idx + 1;
          const isCompleted = stepNum < currentStep;
          const isActive = stepNum === currentStep;
          const isPastOrActive = stepNum <= currentStep;
          const ts = getStepTimestamp(step.key);
          const isValidTs = ts && !isNaN(ts.getTime());

          return (
            <div key={idx} className="flex flex-col items-center flex-1 relative">
              <div
                className={`w-8 h-8 flex items-center justify-center text-xs font-mono font-bold transition-all duration-350 rounded-full border-2 ${isPastOrActive
                    ? 'bg-[#1C1C1E] text-white border-[#1C1C1E]'
                    : 'bg-[#9A9A9C] text-white border-[#9A9A9C]'
                  }`}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4 stroke-[3]" />
                ) : (
                  stepNum
                )}
              </div>
              <span className={`text-[10px] font-semibold mt-1.5 uppercase tracking-wider ${isActive ? 'text-[#1C1C1E]' : 'text-[#9A9A9C]'}`}>
                {step.label}
              </span>
              {isValidTs && ts && (
                <span className="text-[9px] text-[#9A9A9C] mt-0.5 font-mono">
                  {ts.toLocaleDateString([], { month: 'short', day: 'numeric' })} {ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PrimaryButton({
  label,
  onClick,
  loading = false,
  disabled = false,
  className = ""
}: {
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`w-full md:w-auto px-6 py-3.5 text-[15px] font-semibold font-sans uppercase tracking-wider transition-all select-none flex items-center justify-center gap-2 border-b-2 border-b-[#A06828] rounded-none ${disabled
          ? 'bg-[#D8D3CE] text-[#9A9A9C] cursor-not-allowed border-b-transparent'
          : 'bg-[#C8873A] hover:bg-[#A06828] text-white active:translate-y-[1px] active:border-b-0'
        } ${className}`}
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin text-white" />
          <span>Processing...</span>
        </>
      ) : (
        <span>{label}</span>
      )}
    </button>
  );
}

function CategoryChip({
  label,
  selected,
  onSelect
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`px-3 py-1.5 text-[11px] font-sans font-medium uppercase tracking-wider transition-all select-none border border-charcoal ${selected
          ? 'bg-charcoal text-white rounded-chip'
          : 'bg-white text-charcoal rounded-none'
        }`}
      style={{
        borderWidth: '0.8px',
        borderRadius: selected ? '4px' : '0px'
      }}
    >
      {label}
    </button>
  );
}

function IssueCard({ issue, isActive, onClick }: { issue: Issue; isActive: boolean; onClick: () => void; key?: any }) {
  if (!issue) return null;
  const category = issue.category || 'other';
  const address = issue.address || '';
  const photoUrl = issue.photoUrl || '';
  const severity = typeof issue.severity === 'number' ? issue.severity : 1;
  const createdAt = issue.createdAt || new Date().toISOString();

  const title = `${category.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())} — ${address.split(',')[0] || 'Unknown'}`;

  let locationText = 'Jaipur';
  if (address.startsWith('Street View Coordinates') || address.startsWith('Street Coordinates')) {
    if (address.toLowerCase().includes('bengaluru')) {
      locationText = 'Bengaluru';
    } else {
      locationText = 'Jaipur';
    }
  } else {
    const parts = address.split(',');
    locationText = parts[1] ? parts[1].trim() : (parts[0] ? parts[0].trim() : 'Jaipur');
  }
  const d = new Date(createdAt);
  const diffMs = isNaN(d.getTime()) ? 0 : Date.now() - d.getTime();
  const diffHours = Math.max(0, Math.floor(diffMs / (3600 * 1000)));
  const timeText = diffHours < 24 ? `${diffHours}h ago` : `${Math.floor(diffHours / 24)}d ago`;
  const subtitle = `${locationText} · ${timeText}`;

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3.5 p-4 cursor-pointer text-left select-none transition-colors border-b border-hairline ${isActive ? 'bg-stone' : 'bg-transparent hover:bg-stone/30'
        }`}
    >
      <img
        src={photoUrl}
        alt={category}
        referrerPolicy="no-referrer"
        className="w-12 h-12 object-cover rounded-chip shrink-0 border border-hairline"
      />
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold font-sans text-charcoal truncate">{title}</h4>
        <p className="text-xs font-sans text-dust mt-0.5">{subtitle}</p>
      </div>
      <div className="shrink-0 pl-2">
        <SeverityRing score={severity} size="sm" />
      </div>
    </div>
  );
}

function AIAnalysisCard({
  category,
  severity,
  description,
  confidence
}: {
  category: string;
  severity: number;
  description: string;
  confidence?: number;
}) {
  return (
    <div
      className="bg-[#F5E6D3] border border-[#C8873A] p-4 text-left select-none rounded-chip"
      style={{ borderWidth: '0.5px' }}
    >
      <span className="text-[10px] font-semibold font-sans text-[#A06828] tracking-widest uppercase block mb-2">AI Analysis</span>
      <div className="flex items-center gap-3.5 mb-3">
        <SeverityRing score={severity} size="sm" />
        <div>
          <h4 className="text-xs font-bold text-[#1C1C1E] capitalize">
            {category.replace('_', ' ')}
          </h4>
          {confidence !== undefined && (
            <p className="text-[10px] text-[#9A9A9C] font-mono mt-0.5">CONFIDENCE: {(confidence * 100).toFixed(0)}%</p>
          )}
        </div>
      </div>
      <p className="text-xs font-sans text-[#4A4A4C] leading-relaxed">{description}</p>
    </div>
  );
}

function PredictiveAlertCard({
  zone,
  pattern,
  count,
  onExpand
}: {
  zone: string;
  pattern: string;
  count: number;
  onExpand?: () => void;
}) {
  return (
    <div
      onClick={onExpand}
      className={`bg-[#FAFAF8] border-l-[3px] border-l-[#C8873A] border-y border-r border-[#D8D3CE] p-3.5 flex items-center justify-between gap-4 text-left cursor-pointer transition-colors hover:bg-stone/20`}
    >
      <div>
        <span className="text-[10px] font-semibold font-sans text-[#A06828] tracking-widest uppercase block mb-1">PREDICTIVE ALERT</span>
        <h4 className="text-sm font-semibold font-sans text-[#1C1C1E]">{zone}</h4>
        <p className="text-xs font-sans text-[#4A4A4C] mt-1 leading-relaxed">{pattern} ({count} reports)</p>
      </div>
      <ChevronRight className="w-4 h-4 text-[#9A9A9C] shrink-0" />
    </div>
  );
}

// =========================================================
// SLA Countdown Component — live ticking timer
// =========================================================
function SLACountdown({ deadline, status, size = 'md' }: { deadline: string; status: string; size?: 'sm' | 'md' }) {
  const [display, setDisplay] = React.useState('');
  const [urgency, setUrgency] = React.useState<'ok' | 'warning' | 'critical' | 'overdue'>('ok');

  React.useEffect(() => {
    if (status === 'resolved') return;
    const update = () => {
      const now = Date.now();
      const end = new Date(deadline).getTime();
      if (isNaN(end)) { setDisplay('N/A'); return; }
      const diff = end - now;
      if (diff <= 0) {
        setUrgency('overdue');
        setDisplay('OVERDUE');
        return;
      }
      const totalHours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      if (totalHours < 6) setUrgency('critical');
      else if (totalHours < 24) setUrgency('warning');
      else setUrgency('ok');
      if (totalHours >= 48) {
        const days = Math.floor(totalHours / 24);
        const remH = totalHours % 24;
        setDisplay(`${days}d ${remH}h`);
      } else {
        setDisplay(`${String(totalHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
      }
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [deadline, status]);

  if (status === 'resolved') return <span className="text-[10px] text-dust font-mono">N/A</span>;
  if (!display) return null;

  const colors: Record<string, { bg: string; text: string; border: string; dot: string }> = {
    ok:       { bg: 'bg-[#EAF1EC]', text: 'text-[#3D6B4F]', border: 'border-[#A8C5AF]', dot: 'bg-[#3D6B4F]' },
    warning:  { bg: 'bg-[#FEF3E2]', text: 'text-[#A06828]', border: 'border-[#C8873A]', dot: 'bg-[#C8873A]' },
    critical: { bg: 'bg-[#FDECEA]', text: 'text-[#B03A2E]', border: 'border-[#E07A73]', dot: 'bg-[#B03A2E] animate-pulse' },
    overdue:  { bg: 'bg-[#B03A2E]', text: 'text-white',     border: 'border-[#8B2C24]', dot: 'bg-white animate-pulse' }
  };
  const c = colors[urgency];
  const label = urgency === 'overdue' ? 'SLA BREACHED' : urgency === 'critical' ? 'CRITICAL — SLA' : urgency === 'warning' ? 'SLA WARNING' : 'SLA REMAINING';

  if (size === 'sm') {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 border font-mono font-bold text-[9px] rounded-none select-none ${c.bg} ${c.text} ${c.border}`}>
        <span className={`w-1 h-1 rounded-full shrink-0 ${c.dot}`} />
        {display}
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-2.5 px-3 py-2.5 border rounded-none ${c.bg} ${c.border}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
      <div>
        <p className={`text-[9px] font-bold uppercase tracking-widest select-none ${c.text}`}>{label}</p>
        <p className={`font-mono font-bold text-base tracking-widest ${c.text}`}>{display}</p>
      </div>
    </div>
  );
}


export default function Home() {
  const db = getDb();

  // Real-time states
  const [issues, setIssues] = useState<Issue[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [alerts, setAlerts] = useState<PredictiveAlert[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  // UI States
  const [activeTab, setActiveTab] = useState<'map' | 'reports' | 'dashboard' | 'profile' | 'worker'>('map');
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [selectedIssueUpdates, setSelectedIssueUpdates] = useState<StatusUpdate[]>([]);
  const [isDemoBannerVisible, setIsDemoBannerVisible] = useState(
    typeof window !== 'undefined' ? !localStorage.getItem('civsight_demo_dismissed') : true
  );
  const [currentStatIdx, setCurrentStatIdx] = useState(0);

  // Walkthrough Interactive Quest States
  const [sessionHasReported, setSessionHasReported] = useState(false);
  const [sessionHasViewedAnalysis, setSessionHasViewedAnalysis] = useState(false);
  const [sessionHasSwitchedToWorker, setSessionHasSwitchedToWorker] = useState(false);
  const [sessionHasStartedWork, setSessionHasStartedWork] = useState(false);
  const [sessionHasVerified, setSessionHasVerified] = useState(false);
  const [sessionHasOpenedDashboard, setSessionHasOpenedDashboard] = useState(false);
  const [isWalkthroughCollapsed, setIsWalkthroughCollapsed] = useState(false);

  // Worker Workflow states
  const [workerDept, setWorkerDept] = useState<'pothole' | 'water_leak' | 'streetlight' | 'waste'>('pothole');
  const [workerSelectedIssue, setWorkerSelectedIssue] = useState<Issue | null>(null);
  const [repairNotes, setRepairNotes] = useState<string>('');
  const [afterImageProof, setAfterImageProof] = useState<string>('');
  const [isVerifyingRepair, setIsVerifyingRepair] = useState<boolean>(false);
  const [verificationResult, setVerificationResult] = useState<{ isResolved: boolean; confidence: number; aiVerificationReport: string } | null>(null);

  // Notification bell state
  interface AppNotification {
    id: string;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning';
    read: boolean;
    timestamp: string;
  }
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const desktopNotifRef = useRef<HTMLDivElement>(null);
  const mobileNotifRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  const pushNotification = (title: string, message: string, type: 'info' | 'success' | 'warning') => {
    const id = Math.random().toString(36).substr(2, 9);
    setNotifications(prev => [{ id, title, message, type, read: false, timestamp: new Date().toISOString() }, ...prev].slice(0, 20));
  };

  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  const dismissNotification = (id: string) => setNotifications(prev => prev.filter(n => n.id !== id));

  // Google Maps Refs & States
  const mapRef = useRef<HTMLDivElement>(null);
  const dashboardMapRef = useRef<HTMLDivElement>(null);
  const miniMapRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const [googleMapsLoaded, setGoogleMapsLoaded] = useState(false);
  const [googleMapsError, setGoogleMapsError] = useState(false);

  const [activeMapInstance, setActiveMapInstance] = useState<any>(null);
  const [activeDashboardMapInstance, setActiveDashboardMapInstance] = useState<any>(null);
  const activeMiniMapInstance = useRef<any>(null);
  const mapMarkers = useRef<any[]>([]);
  const dashboardMapMarkers = useRef<any[]>([]);
  const dashboardHeatmapLayer = useRef<any>(null);
  const visualizationLibRef = useRef<any>(null);
  const coreLibRef = useRef<any>(null);
  const markerLibRef = useRef<any>(null);
  const mapsLibRef = useRef<any>(null);

  // Reporting Wizard state
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportStep, setReportStep] = useState<1 | 2 | 3>(1);
  const [reportImage, setReportImage] = useState<string | null>(null);
  const [reportCategory, setReportCategory] = useState<string>('');
  const [reportSeverity, setReportSeverity] = useState<number>(5);
  const [reportDescription, setReportDescription] = useState<string>('');
  const [reportLocation, setReportLocation] = useState<Location>({ lat: 26.9124, lng: 75.7873 });
  const [userCoordinates, setUserCoordinates] = useState<Location | null>(null);
  const [isDuplicateDetected, setIsDuplicateDetected] = useState(false);
  const [duplicateDistance, setDuplicateDistance] = useState<number>(0);

  // Agent Pipeline Execution state
  const [isPipelineRunning, setIsPipelineRunning] = useState(false);
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([
    { agentName: "Agent 1: Vision Classifier", status: 'pending', logs: [] },
    { agentName: "Agent 2: Geo-Context Agent", status: 'pending', logs: [] },
    { agentName: "Agent 3: Community Validation", status: 'pending', logs: [] },
    { agentName: "Agent 4: Priority & Routing", status: 'pending', logs: [] },
    { agentName: "Agent 5: Resolution Tracker", status: 'pending', logs: [] }
  ]);
  const [pipelineResult, setPipelineResult] = useState<{ issueId?: string; mergedId?: string } | null>(null);

  // Search and filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Filters logic - defensively guarded against null/undefined fields in local storage
  const filteredIssues = (issues || []).filter(issue => {
    if (!issue) return false;
    const address = issue.address || '';
    const description = issue.description || '';
    const id = issue.id || '';
    const matchesSearch = address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || (issue.category || '') === categoryFilter;
    const matchesStatus = statusFilter === 'all' || (issue.status || '') === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Calculate stats for admin dashboard
  const totalOpen = (issues || []).filter(i => i && i.status !== 'resolved').length;
  const criticalIssues = (issues || []).filter(i => i && i.status !== 'resolved' && (i.severity || 0) >= 8).length;
  const resolvedCount = (issues || []).filter(i => i && i.status === 'resolved').length;

  // Live SLA stats — computed in real-time from issues state, zero API cost
  const liveSlaBreaches = (issues || []).filter(i => i && i.status !== 'resolved' && i.slaDeadline && new Date(i.slaDeadline).getTime() < Date.now()).length;
  const liveResolutionRate = issues.length > 0 ? Math.round((resolvedCount / issues.length) * 100) : 0;

  // Impact metrics (computed live from issues)
  const totalCitizensEngaged = (issues || []).reduce((sum, i) => sum + (i?.confirmations || 0), 0) + (users || []).length;
  const estimatedSavings = (issues || []).filter(i => i?.status === 'resolved').reduce((sum, i) => {
    const map: Record<string, number> = { pothole: 15000, water_leak: 25000, streetlight: 8000, waste: 5000, other: 3000 };
    return sum + (map[i.category] || 3000);
  }, 0);

  // ── Agent Activity Log ───────────────────────────────────────────────────
  interface AgentLog {
    id: string; timestamp: string; agentName: string; agentNum: number;
    action: string; issueId?: string; status: 'success' | 'running' | 'merged' | 'failed'; model?: string;
  }
  const [liveAgentLogs, setLiveAgentLogs] = React.useState<AgentLog[]>([]);
  const pushAgentLog = (log: Omit<AgentLog, 'id'>) =>
    setLiveAgentLogs(prev => [{ ...log, id: Math.random().toString(36).substr(2, 8) }, ...prev].slice(0, 30));

  const [aiInsights, setAiInsights] = useState<any>(null);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);

  const handleGenerateInsights = async () => {
    setIsGeneratingInsights(true);
    let stats: any = null;
    try {
      const totalIssues = issues.length;
      const resCount = issues.filter(i => i.status === 'resolved').length;
      const resRate = totalIssues > 0 ? Math.round((resCount / totalIssues) * 100) : 0;
      const critCount = issues.filter(i => i.status !== 'resolved' && (i.severity || 0) >= 8).length;
      const breachCount = issues.filter(i => i.status !== 'resolved' && i.slaDeadline && new Date(i.slaDeadline).getTime() < Date.now()).length;
      
      const resolved = issues.filter(i => i.status === 'resolved' && i.resolvedAt && i.createdAt);
      const avgResDays = resolved.length > 0
        ? Number((resolved.reduce((sum, i) => sum + (new Date(i.resolvedAt!).getTime() - new Date(i.createdAt).getTime()), 0) / resolved.length / (1000 * 60 * 60 * 24)).toFixed(1))
        : 0;

      const citizens = (issues || []).reduce((sum, i) => sum + (i?.confirmations || 0), 0) + (users || []).length;

      const catBreakdown: Record<string, number> = {};
      issues.forEach(i => {
        const cat = i.category || 'other';
        catBreakdown[cat] = (catBreakdown[cat] || 0) + 1;
      });

      const depts: Record<string, { assigned: number; resolved: number; breached: number; totalSeverity: number; avgSeverity: number; riskScore: number }> = {};
      issues.forEach(i => {
        const d = i.departmentId || 'Unassigned';
        if (!depts[d]) depts[d] = { assigned: 0, resolved: 0, breached: 0, totalSeverity: 0, avgSeverity: 0, riskScore: 0 };
        depts[d].assigned++;
        if (i.status === 'resolved') {
          depts[d].resolved++;
        } else {
          const sev = i.severity || 5;
          depts[d].totalSeverity += sev;
          
          let issueRisk = sev;
          const isBreached = i.slaDeadline && new Date(i.slaDeadline).getTime() < Date.now();
          if (isBreached) {
            issueRisk *= 2.5;
          } else if (i.slaDeadline) {
            const hoursLeft = (new Date(i.slaDeadline).getTime() - Date.now()) / (1000 * 60 * 60);
            if (hoursLeft > 0 && hoursLeft < 48) {
              issueRisk += (48 - hoursLeft) * 0.4;
            }
          }
          depts[d].riskScore += Number(issueRisk.toFixed(1));
        }
      });

      Object.keys(depts).forEach(d => {
        const openCount = depts[d].assigned - depts[d].resolved;
        if (openCount > 0) {
          depts[d].avgSeverity = Number((depts[d].totalSeverity / openCount).toFixed(1));
        }
      });

      stats = {
        totalIssues,
        resolvedCount: resCount,
        resolutionRate: resRate,
        criticalCount: critCount,
        slaBreachCount: breachCount,
        avgResolutionDays: avgResDays,
        citizensEngaged: citizens,
        categoryBreakdown: catBreakdown,
        deptStats: depts
      };

      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stats })
      });
      if (!res.ok) throw new Error('Failed to generate insights');
      const data = await res.json();
      setAiInsights(data);
    } catch (err) {
      console.error(err);
      const slaBreachCount = stats.slaBreachCount || 0;
      const criticalCount = stats.criticalCount || 0;
      
      let alertLevel = 'normal';
      let alertReason = 'No critical severity spikes or major SLA breaches detected in the last 24 hours.';
      if (slaBreachCount > 2 || criticalCount > 3) {
        alertLevel = 'critical';
        alertReason = `${slaBreachCount} active SLA breaches and ${criticalCount} critical issues require immediate escalation.`;
      } else if (slaBreachCount > 0 || criticalCount > 1) {
        alertLevel = 'elevated';
        alertReason = `${slaBreachCount} active SLA breach(es) and ${criticalCount} critical issue(s) detected in the last 24 hours.`;
      }

      const recommendations = [];
      if (slaBreachCount > 0) {
        recommendations.push(`Direct the highest-risk department to address the ${slaBreachCount} active SLA breach(es) within 12 hours.`);
      } else {
        recommendations.push("Deploy maintenance crews to address outstanding routine complaints.");
      }
      if (criticalCount > 0) {
        recommendations.push(`Optimize resource allocation and route crews to resolve the ${criticalCount} critical open issues.`);
      } else {
        recommendations.push("Verify pressure levels at key PHED water distribution hubs to preempt line stress.");
      }
      recommendations.push("Monitor citizen confirmation rates to automatically trigger priority escalation filters.");

      let topRiskDepartment = 'All departments operating well';
      if (stats.deptStats) {
        let maxRisk = 0;
        let worstDept = '';
        for (const [dept, dStats] of Object.entries(stats.deptStats) as any) {
          const score = dStats.riskScore || 0;
          if (score > maxRisk) {
            maxRisk = score;
            worstDept = dept;
          }
        }
        
        if (worstDept) {
          topRiskDepartment = worstDept;
        } else {
          // Fallback legacy calculation
          let maxBreaches = 0;
          for (const [dept, dStats] of Object.entries(stats.deptStats) as any) {
            if (dStats.breached > maxBreaches) {
              maxBreaches = dStats.breached;
              worstDept = dept;
            }
          }
          if (worstDept) {
            topRiskDepartment = worstDept;
          } else {
            let maxAssigned = 0;
            for (const [dept, dStats] of Object.entries(stats.deptStats) as any) {
              if (dStats.assigned > maxAssigned && dStats.resolved < dStats.assigned) {
                maxAssigned = dStats.assigned;
                worstDept = dept;
              }
            }
            if (worstDept) topRiskDepartment = worstDept;
          }
        }
      }

      setAiInsights({
        summary: `Jaipur municipal infrastructure health is currently stable with a total of ${stats.totalIssues} reported issues. A resolution rate of ${stats.resolutionRate}% has been achieved, with an average resolution time of ${stats.avgResolutionDays} days. SLA compliance is being monitored closely across all departments.`,
        alertLevel,
        alertReason,
        recommendations,
        keyMetric: `${slaBreachCount} SLA breach${slaBreachCount === 1 ? '' : 'es'} need${slaBreachCount === 1 ? 's' : ''} immediate escalation`,
        topRiskDepartment,
        predictedEscalation: slaBreachCount > 0 
          ? `SLA breaches will compound if active work orders are not fulfilled within the next 48 hours.`
          : `Waste overflow may increase on pedestrian walkways if collection schedules are delayed.`,
        generatedAt: new Date().toISOString(),
        model: "gemini-3.5-flash (Fallback Simulation)"
      });
    } finally {
      setIsGeneratingInsights(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'dashboard' && !aiInsights && !isGeneratingInsights && issues.length > 0) {
      handleGenerateInsights();
    }
  }, [activeTab, aiInsights, issues]);

  // AI Chat Assistant States and Methods
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    { role: 'assistant', content: "Namaste! I am your CivSight City AI Assistant. I have live access to Jaipur's reports queue and department SLAs. Ask me about ongoing issues or municipal performance!" }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, chatOpen]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentStatIdx((prev) => (prev + 1) % 4);
    }, 3500);
    return () => clearInterval(timer);
  }, []);

  const runLocalFallbackChat = (userMsg: string) => {
    const query = userMsg.toLowerCase();
    let reply = "";

    const activeIssuesList = issues.filter(i => i.status !== 'resolved');

    if (query.includes('status') || query.includes('report') || query.includes('issue') || query.includes('complaint')) {
      if (activeIssuesList.length > 0) {
        const latest = activeIssuesList[0];
        reply = `I see ${activeIssuesList.length} active issues in the Jaipur queue. The latest is a ${latest.category.replace('_', ' ')} at "${latest.address.split(',')[0]}", which is currently [${latest.status.toUpperCase()}] and assigned to ${latest.departmentId}.`;
      } else {
        reply = "All reported issues in Jaipur have been resolved! The queue is currently clear.";
      }
    } else if (query.includes('pothole')) {
      const potholes = activeIssuesList.filter(i => i.category === 'pothole');
      reply = `There are currently ${potholes.length} active potholes in the queue. PWD crews are dispatched to handle high severity spots on Ashok Marg.`;
    } else if (query.includes('water') || query.includes('leak')) {
      const leaks = activeIssuesList.filter(i => i.category === 'water_leak');
      reply = `We have ${leaks.length} active water leaks in Sector W-07. Jaipur BWSSB is working to resolve main line pressure spikes.`;
    } else if (query.includes('saving') || query.includes('saved') || query.includes('money') || query.includes('rupee') || query.includes('cost')) {
      reply = `CivSight's autonomous resolution tracker estimates Jaipur has saved ₹${estimatedSavings.toLocaleString('en-IN')} by deploying field teams before escalation.`;
    } else if (query.includes('sla') || query.includes('overdue') || query.includes('breach')) {
      const breaches = activeIssuesList.filter(i => i.slaDeadline && new Date(i.slaDeadline).getTime() < Date.now());
      reply = breaches.length > 0 
        ? `There are currently ${breaches.length} SLA breaches in progress. Escalation flags have been broadcasted to the respective department heads.`
        : `Excellent news: all active issues are currently within their SLA boundaries. SLA compliance is at 100% this week.`;
    } else if (query.includes('hi') || query.includes('hello') || query.includes('hey') || query.includes('namaste')) {
      reply = `Namaste! I am the CivSight AI Assistant. How can I help you with Jaipur's municipal stats, active reports, or department workloads?`;
    } else {
      reply = `Running on edge database node. Ward 7 is reporting normal metrics: ${activeIssuesList.length} pending issues and ₹${estimatedSavings.toLocaleString('en-IN')} saved. Ask me about "status", "water leaks", "SLA compliance", or "taxpayer savings"!`;
    }

    setChatMessages(prev => [...prev, { role: 'assistant', content: reply }]);
  };

  const handleSendChatMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setChatLoading(true);

    try {
      // Calculate active stats
      const totalIssues = issues.length;
      const resCount = issues.filter(i => i.status === 'resolved').length;
      const resRate = totalIssues > 0 ? Math.round((resCount / totalIssues) * 100) : 0;
      const critCount = issues.filter(i => i.status !== 'resolved' && (i.severity || 0) >= 8).length;
      const breachCount = issues.filter(i => i.status !== 'resolved' && i.slaDeadline && new Date(i.slaDeadline).getTime() < Date.now()).length;
      
      const resolved = issues.filter(i => i.status === 'resolved' && i.resolvedAt && i.createdAt);
      const avgResDays = resolved.length > 0
        ? Number((resolved.reduce((sum, i) => sum + (new Date(i.resolvedAt!).getTime() - new Date(i.createdAt).getTime()), 0) / resolved.length / (1000 * 60 * 60 * 24)).toFixed(1))
        : 0;

      const stats = {
        totalIssues,
        resolvedCount: resCount,
        resolutionRate: resRate,
        criticalCount: critCount,
        slaBreachCount: breachCount,
        avgResolutionDays: avgResDays,
        estimatedSavings,
        citizensEngaged: totalCitizensEngaged
      };

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...chatMessages, { role: 'user', content: userMsg }],
          issues,
          stats
        })
      });

      if (!res.ok) {
        console.warn("Gemini API returned error: " + res.status + ". Using local chatbot rules fallback.");
        runLocalFallbackChat(userMsg);
        return;
      }
      
      const data = await res.json();
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      console.warn("Network error during chat. Using local chatbot rules fallback:", err);
      runLocalFallbackChat(userMsg);
    } finally {
      setChatLoading(false);
    }
  };

  // Historical agent events derived from already-existing issues
  const syntheticAgentEvents = React.useMemo<AgentLog[]>(() => {
    const events: AgentLog[] = [];
    (issues || []).forEach(issue => {
      if (!issue) return;
      const base = new Date(issue.createdAt || Date.now()).getTime();
      events.push({ id: `${issue.id}-a1`, timestamp: new Date(base + 2000).toISOString(), agentName: 'Agent 1: Vision Classifier', agentNum: 1, action: `Classified: ${(issue.category || 'other').replace('_', ' ')} · Severity ${issue.severity}/10 · Confidence ~92%`, issueId: issue.id, status: 'success', model: 'gemini-3.5-flash' });
      if (['verified', 'assigned', 'in_progress', 'resolved'].includes(issue.status)) {
        events.push({ id: `${issue.id}-a3`, timestamp: new Date(base + 12000).toISOString(), agentName: 'Agent 3: Community Validation', agentNum: 3, action: `Validated by ${issue.confirmations || 1} community nodes`, issueId: issue.id, status: 'success' });
      }
      if (['assigned', 'in_progress', 'resolved'].includes(issue.status)) {
        events.push({ id: `${issue.id}-a4`, timestamp: new Date(base + 15000).toISOString(), agentName: 'Agent 4: Priority & Routing', agentNum: 4, action: `Dispatched → ${issue.departmentId || 'Dept'} · Priority ${(issue.priorityScore || issue.severity || 0).toFixed(1)}/40`, issueId: issue.id, status: 'success' });
      }
      if (issue.status === 'resolved') {
        events.push({ id: `${issue.id}-a5`, timestamp: new Date(issue.resolvedAt || new Date(base + 86400000).toISOString()).toISOString(), agentName: 'Agent 5: Resolution Tracker', agentNum: 5, action: `Issue resolved · SLA met · Citizen XP awarded`, issueId: issue.id, status: 'success' });
      }
    });
    return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 20);
  }, [issues]);

  const allAgentLogs = [...liveAgentLogs, ...syntheticAgentEvents].slice(0, 25);


  // Fetch browser location on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setUserCoordinates(coords);
          setReportLocation(coords);
        },
        (error) => {
          console.warn("Geolocation permission denied or failed:", error);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  }, []);

  // Close notification panel on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (target && !document.body.contains(target)) {
        return;
      }
      
      const clickedOutsideDesktop = !desktopNotifRef.current || !desktopNotifRef.current.contains(target);
      const clickedOutsideMobile = !mobileNotifRef.current || !mobileNotifRef.current.contains(target);
      
      if (clickedOutsideDesktop && clickedOutsideMobile) {
        setNotifPanelOpen(false);
      }
    }
    if (notifPanelOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [notifPanelOpen]);

  // ── Predictive SLA Breach Notifications — scans every 60s, zero API cost ──
  const notifiedSlaRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    const scan = () => {
      (issues || []).forEach(issue => {
        if (issue.status === 'resolved') return;
        if (!issue.slaDeadline) return;
        const remaining = new Date(issue.slaDeadline).getTime() - Date.now();
        const id6 = issue.id.slice(-6).toUpperCase();
        if (remaining < 0 && !notifiedSlaRef.current.has(`breach_${issue.id}`)) {
          notifiedSlaRef.current.add(`breach_${issue.id}`);
          pushNotification(
            'SLA Breached',
            `Issue #${id6} (${(issue.category || 'other').replace('_', ' ')}) has exceeded its SLA deadline — ${issue.departmentId || 'dept'} must escalate.`,
            'warning'
          );
        } else if (remaining > 0 && remaining < TWO_HOURS && !notifiedSlaRef.current.has(`warn_${issue.id}`)) {
          notifiedSlaRef.current.add(`warn_${issue.id}`);
          pushNotification(
            'SLA Warning',
            `Issue #${id6} (${(issue.category || 'other').replace('_', ' ')}) has under 2h before SLA breach — ${issue.departmentId || 'dept'} notified.`,
            'warning'
          );
        }
      });
    };
    scan();
    const id = setInterval(scan, 60_000);
    return () => clearInterval(id);
  }, [issues]);

  // Real-time sync subscription
  useEffect(() => {
    const unsubIssues = db.subscribeIssues((updatedIssues: Issue[]) => {
      setIssues(prev => {
        if (prev && prev.length > 0) {
          updatedIssues.forEach(fresh => {
            const old = prev.find(o => o && o.id === fresh.id);
            if (old && old.status !== fresh.status) {
              const idText = fresh.id.substring(Math.max(0, fresh.id.length - 6)).toUpperCase();
              let title = 'Status Update';
              let message = `Issue #${idText} updated to ${fresh.status.replace('_', ' ')}`;
              let type: 'info' | 'success' | 'warning' = 'info';
              if (fresh.status === 'resolved') {
                title = 'Incident Resolved';
                message = `Municipal crew resolved issue #${idText} at ${(fresh.address || '').split(',')[0]}!`;
                type = 'success';
              } else if (fresh.status === 'in_progress') {
                title = 'Work Initiated';
                message = `Maintenance team started work on issue #${idText}.`;
                type = 'warning';
              } else if (fresh.status === 'verified') {
                title = 'Incident Verified';
                message = `Issue #${idText} verified by community nodes.`;
                type = 'success';
              } else if (fresh.status === 'assigned') {
                title = 'Dispatch Assigned';
                message = `Routed to ${fresh.departmentId || 'appropriate department'}.`;
                type = 'info';
              }
              pushNotification(title, message, type);
            }
          });
        }
        return updatedIssues;
      });
    });

    const unsubUsers = db.subscribeUsers((updatedUsers: UserProfile[]) => {
      setUsers(updatedUsers);
      const cur = updatedUsers.find((u: UserProfile) => u.id === 'current_user_1');
      if (cur) setCurrentUser(cur);
    });

    setAlerts(db.getAlerts());

    return () => {
      unsubIssues();
      unsubUsers();
    };
  }, [db]);

  // Sync selected issue details when issues collection updates
  useEffect(() => {
    if (!selectedIssue) return;
    const fresh = issues.find((i: Issue) => i.id === selectedIssue.id);
    if (fresh && (fresh.status !== selectedIssue.status || fresh.confirmations !== selectedIssue.confirmations)) {
      setSelectedIssue(fresh);
    }
  }, [issues, selectedIssue]);

  // Track if user viewed AI analysis for the walkthrough quest
  useEffect(() => {
    if (selectedIssue) {
      setSessionHasViewedAnalysis(true);
    }
  }, [selectedIssue]);

  // Track if user switched to Field Crew role
  useEffect(() => {
    if (currentUser?.role === 'worker') {
      setSessionHasSwitchedToWorker(true);
    }
  }, [currentUser?.role]);

  // Track if user opened Admin Command Center
  useEffect(() => {
    if (currentUser?.role === 'admin' && activeTab === 'dashboard') {
      setSessionHasOpenedDashboard(true);
    }
  }, [currentUser?.role, activeTab]);

  // Sync workerSelectedIssue details when issues collection updates
  useEffect(() => {
    if (!workerSelectedIssue) return;
    const fresh = issues.find((i: Issue) => i.id === workerSelectedIssue.id);
    if (fresh && fresh.status !== workerSelectedIssue.status) {
      setWorkerSelectedIssue(fresh);
    }
  }, [issues, workerSelectedIssue]);

  // Subscribe to status updates of the selected issue
  useEffect(() => {
    if (!selectedIssue) {
      setSelectedIssueUpdates([]);
      return;
    }

    const unsubUpdates = db.subscribeStatusUpdates(selectedIssue.id, (updates: StatusUpdate[]) => {
      setSelectedIssueUpdates(updates);
    });

    return () => {
      unsubUpdates();
    };
  }, [selectedIssue, db]);

  // Load Google Maps JS SDK dynamically
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const apiKey = MAPS_API_KEY;
    if (!apiKey) {
      console.warn("No Google Maps API Key found, using vector grid fallback.");
      setGoogleMapsError(true);
      return;
    }

    import('@googlemaps/js-api-loader').then(({ setOptions, importLibrary }) => {
      setOptions({
        key: apiKey,
        v: 'weekly'
      });

      Promise.all([
        importLibrary('maps'),
        importLibrary('core'),
        importLibrary('marker')
      ]).then(([mapsLib, coreLib, markerLib]) => {
        mapsLibRef.current = mapsLib;
        coreLibRef.current = coreLib;
        markerLibRef.current = markerLib;
        setGoogleMapsLoaded(true);
      }).catch((e: any) => {
        console.error("Google Maps loader failed to load libraries:", e);
        setGoogleMapsError(true);
      });
    }).catch(err => {
      console.error("Failed to import @googlemaps/js-api-loader:", err);
      setGoogleMapsError(true);
    });
  }, []);

  // Initialize Monitor Grid Map
  useEffect(() => {
    if (!googleMapsLoaded || activeTab !== 'map' || !mapRef.current) return;

    const google = (window as any).google;
    if (!google || !google.maps) return;

    const mapsLib = mapsLibRef.current || google.maps;
    if (!mapsLib || !mapsLib.Map) {
      console.warn("Google Maps Library not fully loaded yet.");
      return;
    }

    const center = userCoordinates || { lat: 26.9124, lng: 75.7873 }; // User location or fallback to Jaipur

    const mapStyle = [
      { "featureType": "all", "elementType": "labels.text.fill", "stylers": [{ "color": "#4f5b66" }] },
      { "featureType": "all", "elementType": "labels.text.stroke", "stylers": [{ "visibility": "on" }, { "color": "#ffffff" }, { "weight": 2 }] },
      { "featureType": "administrative", "elementType": "geometry.fill", "stylers": [{ "color": "#fefefe" }] },
      { "featureType": "administrative", "elementType": "geometry.stroke", "stylers": [{ "color": "#e2e8f0" }, { "weight": 1.2 }] },
      { "featureType": "landscape", "elementType": "geometry.fill", "stylers": [{ "color": "#f8fafc" }] },
      { "featureType": "poi", "elementType": "geometry", "stylers": [{ "visibility": "simplified" }, { "color": "#f1f5f9" }] },
      { "featureType": "poi", "elementType": "labels.icon", "stylers": [{ "visibility": "off" }] },
      { "featureType": "road", "elementType": "geometry.fill", "stylers": [{ "color": "#ffffff" }] },
      { "featureType": "road", "elementType": "geometry.stroke", "stylers": [{ "color": "#e2e8f0" }] },
      { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#bae6fd" }] }
    ];

    try {
      const map = new mapsLib.Map(mapRef.current, {
        center: center,
        zoom: 15,
        styles: mapStyle,
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        scaleControl: true,
        streetViewControl: false,
        rotateControl: false,
        fullscreenControl: false
      });

      setActiveMapInstance(map);
    } catch (error) {
      console.error("Error creating Grid Map instance:", error);
      setGoogleMapsError(true);
    }

    return () => {
      setActiveMapInstance(null);
    };
  }, [googleMapsLoaded, activeTab, userCoordinates]);

  // Sync Monitor Grid Map Markers
  useEffect(() => {
    const map = activeMapInstance;
    if (!map) return;

    const google = (window as any).google;
    if (!google || !google.maps) return;

    const markerLib = markerLibRef.current || google.maps;
    const coreLib = coreLibRef.current || google.maps;

    if (!markerLib || !markerLib.Marker || !coreLib || !coreLib.Point) {
      console.warn("Google Maps Marker or Core library not fully loaded yet.");
      return;
    }

    try {
      // Clear old markers
      mapMarkers.current.forEach(m => m && m.setMap && m.setMap(null));
      mapMarkers.current = [];

      const newMarkers = (filteredIssues || [])
        .filter(issue => issue && issue.location && typeof issue.location.lat === 'number' && typeof issue.location.lng === 'number')
        .map(issue => {
          const status = issue.status || 'reported';
          const severity = typeof issue.severity === 'number' ? issue.severity : 1;
          const category = issue.category || 'other';

          let color = '#f59e0b'; // amber
          if (status === 'resolved') {
            color = '#10b981'; // emerald
          } else if (severity >= 8) {
            color = '#ef4444'; // rose
          } else if (severity >= 5) {
            color = '#f97316'; // orange
          }

          const svgMarker = {
            path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
            fillColor: color,
            fillOpacity: 1.0,
            strokeWeight: 1.5,
            strokeColor: "#ffffff",
            scale: 1.4,
            anchor: new coreLib.Point(12, 21),
          };

          const marker = new markerLib.Marker({
            position: { lat: issue.location.lat, lng: issue.location.lng },
            map: map,
            icon: svgMarker,
            title: `${category.replace('_', ' ').toUpperCase()} - Severity ${severity}`,
            optimized: false
          });

          marker.addListener('click', () => {
            setSelectedIssue(issue);
          });

          return marker;
        });

      mapMarkers.current = newMarkers;
    } catch (error) {
      console.error("Error setting/clearing grid map markers:", error);
    }
  }, [filteredIssues, activeTab, googleMapsLoaded, activeMapInstance]);

  // Initialize Dashboard Map
  useEffect(() => {
    if (!googleMapsLoaded || activeTab !== 'dashboard' || !dashboardMapRef.current) return;

    const google = (window as any).google;
    if (!google || !google.maps) return;

    const mapsLib = mapsLibRef.current || google.maps;
    if (!mapsLib || !mapsLib.Map) {
      console.warn("Google Maps Library not fully loaded yet.");
      return;
    }

    const center = userCoordinates || { lat: 26.9124, lng: 75.7873 };

    const mapStyle = [
      { "featureType": "all", "elementType": "labels.text.fill", "stylers": [{ "color": "#4f5b66" }] },
      { "featureType": "all", "elementType": "labels.text.stroke", "stylers": [{ "visibility": "on" }, { "color": "#ffffff" }, { "weight": 2 }] },
      { "featureType": "landscape", "elementType": "geometry.fill", "stylers": [{ "color": "#f8fafc" }] },
      { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#bae6fd" }] }
    ];

    try {
      const map = new mapsLib.Map(dashboardMapRef.current, {
        center: center,
        zoom: 14,
        styles: mapStyle,
        disableDefaultUI: true,
        zoomControl: true
      });

      setActiveDashboardMapInstance(map);
    } catch (error) {
      console.error("Error creating Dashboard Map instance:", error);
      setGoogleMapsError(true);
    }

    return () => {
      setActiveDashboardMapInstance(null);
    };
  }, [googleMapsLoaded, activeTab, userCoordinates]);

  // Sync Dashboard Heatmap and Markers
  useEffect(() => {
    const map = activeDashboardMapInstance;
    if (!map) return;

    const google = (window as any).google;
    if (!google || !google.maps) return;

    const coreLib = coreLibRef.current || google.maps;
    const markerLib = markerLibRef.current || google.maps;

    if (!coreLib || !coreLib.LatLng || !coreLib.Point || !markerLib || !markerLib.Marker) {
      console.warn("Google Maps Core or Marker library not fully loaded yet.");
      return;
    }

    try {
      // Clear old markers
      dashboardMapMarkers.current.forEach(m => m && m.setMap && m.setMap(null));
      dashboardMapMarkers.current = [];

      // Clear old Heatmap Circles
      if (Array.isArray(dashboardHeatmapLayer.current)) {
        dashboardHeatmapLayer.current.forEach(c => c && c.setMap && c.setMap(null));
      } else if (dashboardHeatmapLayer.current && dashboardHeatmapLayer.current.setMap) {
        dashboardHeatmapLayer.current.setMap(null);
      }
      dashboardHeatmapLayer.current = [];

      // Render custom multi-layer heatmap circles for a beautiful heat glow look
      const circles: any[] = [];
      (filteredIssues || [])
        .filter(issue => issue && issue.location && typeof issue.location.lat === 'number' && typeof issue.location.lng === 'number')
        .forEach(issue => {
          // Inner hot glow
          const circleInner = new google.maps.Circle({
            strokeColor: '#C8873A',
            strokeOpacity: 0,
            strokeWeight: 0,
            fillColor: '#C8873A',
            fillOpacity: 0.45,
            map: map,
            center: { lat: issue.location.lat, lng: issue.location.lng },
            radius: 80, // 80 meters
            clickable: false
          });

          // Outer ambient glow
          const circleOuter = new google.maps.Circle({
            strokeColor: '#C8873A',
            strokeOpacity: 0,
            strokeWeight: 0,
            fillColor: '#C8873A',
            fillOpacity: 0.18,
            map: map,
            center: { lat: issue.location.lat, lng: issue.location.lng },
            radius: 180, // 180 meters
            clickable: false
          });

          circles.push(circleInner, circleOuter);
        });
      dashboardHeatmapLayer.current = circles;

      // Render Markers for unresolved critical issues on dashboard map (defensively filtered for location fields)
      const criticalIssuesList = (filteredIssues || []).filter(i => i && i.status !== 'resolved' && (i.severity || 0) >= 8 && i.location && typeof i.location.lat === 'number' && typeof i.location.lng === 'number');
      const newMarkers = criticalIssuesList.map(issue => {
        const severity = typeof issue.severity === 'number' ? issue.severity : 8;
        const svgMarker = {
          path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
          fillColor: "#ef4444", // rose for critical
          fillOpacity: 1.0,
          strokeWeight: 1.5,
          strokeColor: "#ffffff",
          scale: 1.2,
          anchor: new coreLib.Point(12, 21),
        };

        const marker = new markerLib.Marker({
          position: { lat: issue.location.lat, lng: issue.location.lng },
          map: map,
          icon: svgMarker,
          title: `CRITICAL POTHOLE - Severity ${severity}`,
          optimized: false
        });

        marker.addListener('click', () => {
          setActiveTab('map');
          setSelectedIssue(issue);
        });

        return marker;
      });

      dashboardMapMarkers.current = newMarkers;
    } catch (error) {
      console.error("Error setting/clearing dashboard maps and overlays:", error);
    }
  }, [filteredIssues, activeTab, googleMapsLoaded, activeDashboardMapInstance]);

  // Initialize Mini Map for Report Step 3 Location Review
  useEffect(() => {
    if (!googleMapsLoaded || !isReportOpen || reportStep !== 3 || !miniMapRef.current) return;

    const google = (window as any).google;
    if (!google || !google.maps) return;

    const mapsLib = mapsLibRef.current || google.maps;
    const markerLib = markerLibRef.current || google.maps;
    if (!mapsLib || !mapsLib.Map || !markerLib || !markerLib.Marker) {
      console.warn("Google Maps Library or Marker library not fully loaded yet.");
      return;
    }

    try {
      const map = new mapsLib.Map(miniMapRef.current, {
        center: { lat: reportLocation.lat, lng: reportLocation.lng },
        zoom: 16,
        disableDefaultUI: true,
        zoomControl: true
      });

      const marker = new markerLib.Marker({
        position: { lat: reportLocation.lat, lng: reportLocation.lng },
        map: map,
        draggable: true,
        title: "Confirm Location"
      });

      marker.addListener('dragend', () => {
        const pos = marker.getPosition();
        if (pos) {
          setReportLocation({ lat: pos.lat(), lng: pos.lng() });
        }
      });

      activeMiniMapInstance.current = map;
    } catch (error) {
      console.error("Error creating Mini Map instance:", error);
    }

    return () => {
      activeMiniMapInstance.current = null;
    };
  }, [googleMapsLoaded, isReportOpen, reportStep]);

  // Non-blocking side drawer click-outside listener (Desktop only)
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (window.innerWidth < 768) return; // Keep backdrop on mobile

      if (drawerRef.current && !drawerRef.current.contains(event.target as Node)) {
        const target = event.target as HTMLElement;
        if (
          target.closest('.issue-list-item') ||
          target.closest('.map-marker') ||
          target.closest('.nav-button') ||
          target.closest('.reset-button')
        ) {
          return;
        }
        setSelectedIssue(null);
      }
    }

    if (selectedIssue) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedIssue]);

  // Status Badge Class Mapper
  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'reported':
        return 'bg-slate-50 text-slate-600 border-slate-200';
      case 'verified':
        return 'bg-blue-50 text-blue-700 border-blue-100';
      case 'assigned':
        return 'bg-purple-50 text-purple-700 border-purple-100';
      case 'in_progress':
        return 'bg-amber-50 text-amber-800 border-amber-200 animate-pulse';
      case 'resolved':
        return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  // Reset database state (helpful for hackathon demos)
  const handleResetData = () => {
    localStorage.removeItem('civsight_issues');
    localStorage.removeItem('civsight_users');
    localStorage.removeItem('civsight_updates');
    localStorage.removeItem('civsight_alerts');
    window.location.reload();
  };

  // Upvote / Verify an issue
  const handleVerifyIssue = (id: string) => {
    if (!currentUser) return;
    const issue = issues.find(i => i.id === id);
    if (!issue) return;

    if (issue.confirmedBy.includes(currentUser.id)) {
      pushNotification("Already Verified", "You have already confirmed/upvoted this issue!", "warning");
      return;
    }

    const newConfirmedBy = [...issue.confirmedBy, currentUser.id];
    const newConfirmations = issue.confirmations + 1;

    db.updateIssue(id, {
      confirmations: newConfirmations,
      confirmedBy: newConfirmedBy
    });

    // Check if validation threshold (3) is reached
    if (issue.status === 'reported' && newConfirmations >= 3) {
      db.updateIssue(id, { status: 'verified' });
      // Trigger Priority & Routing Agent immediately
      setTimeout(() => {
        const areaWeight = issue.category === 'pothole' ? 1.5 : 1.0;
        const priorityScore = parseFloat((issue.severity * Math.log2(newConfirmations + 1) * areaWeight).toFixed(1));

        const isBengaluru = issue.address.toLowerCase().includes("bengaluru") ||
          issue.address.toLowerCase().includes("karnataka") ||
          (Math.abs(issue.location.lat - 12.971598) < 0.1 && Math.abs(issue.location.lng - 77.594562) < 0.1);

        const isJaipur = issue.address.toLowerCase().includes("jaipur") ||
          issue.address.toLowerCase().includes("rajasthan") ||
          (Math.abs(issue.location.lat - 26.9124) < 0.5 && Math.abs(issue.location.lng - 75.7873) < 0.5);

        let dept = "Municipal Corporation Office";
        if (isBengaluru) {
          dept = "General Ward Office";
          if (issue.category === 'pothole') dept = "BBMP Roads Department";
          else if (issue.category === 'water_leak') dept = "BWSSB (Water Dept)";
          else if (issue.category === 'streetlight') dept = "BESCOM (Electricity)";
          else if (issue.category === 'waste') dept = "BBMP Waste Management";
        } else if (isJaipur) {
          dept = "Jaipur Municipal Corp (JMC)";
          if (issue.category === 'pothole') dept = "JDA Roads Department";
          else if (issue.category === 'water_leak') dept = "PHED (Water Dept)";
          else if (issue.category === 'streetlight') dept = "JVVNL (Electricity)";
          else if (issue.category === 'waste') dept = "Jaipur Municipal Corp (JMC)";
        } else {
          dept = "Municipal Corporation Office";
          if (issue.category === 'pothole') dept = "Municipal PWD (Roads Dept)";
          else if (issue.category === 'water_leak') dept = "Municipal Water Supply Dept";
          else if (issue.category === 'streetlight') dept = "State Electricity Board";
          else if (issue.category === 'waste') dept = "Municipal Waste Management";
        }

        const slaDeadline = new Date(Date.now() + (issue.severity >= 8 ? 24 : 72) * 3600 * 1000).toISOString();

        db.updateIssue(id, {
          priorityScore,
          departmentId: dept,
          slaDeadline,
          status: 'assigned'
        });
      }, 1000);
    }

    // Award points
    db.updateUserProfile(currentUser.id, {
      points: currentUser.points + 15,
      verifiedCount: currentUser.verifiedCount + 1
    });
  };

  // Simulating File Upload/Camera intake
  const handleImageSelect = (base64OrPreset: string, preset?: typeof TEST_PRESETS[0]) => {
    setReportImage(base64OrPreset);
    if (preset) {
      setReportCategory(preset.category);
      setReportLocation({ lat: preset.lat, lng: preset.lng });
      setReportDescription(preset.description);
    } else {
      setReportCategory('');
      setReportDescription('');
      if (userCoordinates) {
        setReportLocation(userCoordinates);
      }
    }
    setReportStep(2);
  };

  // Mock file selector handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        handleImageSelect(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Step 2 Proceed to location confirmation
  const handleConfirmClassification = () => {
    let isDup = false;
    let dist = 0;
    const sameCat = issues.filter(i => i.status !== 'resolved' && i.category === reportCategory);
    for (const issue of sameCat) {
      const lat1 = reportLocation.lat;
      const lng1 = reportLocation.lng;
      const lat2 = issue.location.lat;
      const lng2 = issue.location.lng;

      const dy = (lat2 - lat1) * 111000;
      const dx = (lng2 - lng1) * 108000;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= 200) {
        isDup = true;
        dist = Math.round(distance);
        break;
      }
    }
    setIsDuplicateDetected(isDup);
    setDuplicateDistance(dist);
    setReportStep(3);
  };

  // Run the autonomous agent pipeline
  const handleSubmitReport = async () => {
    if (!reportImage || !currentUser) return;

    setIsPipelineRunning(true);
    setPipelineResult(null);

    const initialSteps = [
      { agentName: "Agent 1: Vision Classifier", status: 'pending' as const, logs: [] },
      { agentName: "Agent 2: Geo-Context Agent", status: 'pending' as const, logs: [] },
      { agentName: "Agent 3: Community Validation", status: 'pending' as const, logs: [] },
      { agentName: "Agent 4: Priority & Routing", status: 'pending' as const, logs: [] },
      { agentName: "Agent 5: Resolution Tracker", status: 'pending' as const, logs: [] }
    ];
    setPipelineSteps(initialSteps);

    try {
      const res = await runCivSightPipeline(
        reportImage,
        reportLocation,
        currentUser.id,
        reportDescription,
        (idx, updatedStep) => {
          setPipelineSteps(prev => {
            const next = [...prev];
            next[idx] = updatedStep;
            return next;
          });
          // Push to the Live Agent Feed when a step completes
          if (updatedStep.status === 'success' || updatedStep.status === 'merged') {
            const agentNums: Record<string, number> = {
              'Agent 1: Vision Classifier': 1,
              'Agent 2: Geo-Context Agent': 2,
              'Agent 3: Community Validation': 3,
              'Agent 4: Priority & Routing': 4,
              'Agent 5: Resolution Tracker': 5
            };
            pushAgentLog({
              timestamp: new Date().toISOString(),
              agentName: updatedStep.agentName,
              agentNum: agentNums[updatedStep.agentName] || 0,
              action: updatedStep.logs[updatedStep.logs.length - 1] || updatedStep.agentName,
              status: updatedStep.status === 'merged' ? 'merged' : 'success',
              model: updatedStep.agentName.includes('Vision') ? 'gemini-3.5-flash' : undefined
            });
          }
        },
        reportCategory as any,
        reportSeverity
      );

      setPipelineResult(res);
    } catch (e) {
      console.error(e);
    }
  };

  const closeReportWizard = () => {
    if (isPipelineRunning) return;
    setIsReportOpen(false);
    setReportStep(1);
    setReportImage(null);
    setReportCategory('');
    setReportSeverity(5);
    setReportDescription('');
    setIsDuplicateDetected(false);
    setDuplicateDistance(0);
    setPipelineResult(null);
    setPipelineSteps([
      { agentName: "Agent 1: Vision Classifier", status: 'pending', logs: [] },
      { agentName: "Agent 2: Geo-Context Agent", status: 'pending', logs: [] },
      { agentName: "Agent 3: Community Validation", status: 'pending', logs: [] },
      { agentName: "Agent 4: Priority & Routing", status: 'pending', logs: [] },
      { agentName: "Agent 5: Resolution Tracker", status: 'pending', logs: [] }
    ]);
  };

  const closePipelineModal = () => {
    setIsPipelineRunning(false);
    setIsReportOpen(false);

    const targetId = pipelineResult?.mergedId || pipelineResult?.issueId;

    setReportStep(1);
    setReportImage(null);
    setReportCategory('');
    setReportSeverity(5);
    setReportDescription('');
    setIsDuplicateDetected(false);
    setDuplicateDistance(0);
    setPipelineResult(null);
    setPipelineSteps([
      { agentName: "Agent 1: Vision Classifier", status: 'pending', logs: [] },
      { agentName: "Agent 2: Geo-Context Agent", status: 'pending', logs: [] },
      { agentName: "Agent 3: Community Validation", status: 'pending', logs: [] },
      { agentName: "Agent 4: Priority & Routing", status: 'pending', logs: [] },
      { agentName: "Agent 5: Resolution Tracker", status: 'pending', logs: [] }
    ]);

    if (targetId) {
      const fresh = db.getIssueById(targetId) || issues.find(i => i.id === targetId);
      if (fresh) setSelectedIssue(fresh);
      setSessionHasReported(true);
    }
  };

  // Close modals on background click (fixes UX bugs)
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setSelectedIssue(null);
    }
  };

  const handleReportOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isPipelineRunning) {
      closeReportWizard();
    }
  };

  // Filters logic declared at the top of Home component

  // A helper that returns the container for Google Maps (if loaded) or the vector fallback
  const renderMapContainer = (containerRef: React.RefObject<HTMLDivElement | null>, mode: 'markers' | 'heatmap') => {
    if (googleMapsError || !MAPS_API_KEY) {
      return renderMockMap();
    }

    return (
      <div className="relative w-full h-full rounded-none overflow-hidden border-none shadow-none bg-stone">
        <div ref={containerRef} className="w-full h-full z-0" />

        {/* Connection status badge */}
        <div className="absolute top-4 left-4 bg-warm-white border border-hairline text-[10px] font-bold text-[#1C1C1E] px-3 py-1.5 rounded-none flex items-center gap-1.5 shadow-none select-none uppercase tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-[#3D6B4F] animate-pulse"></span>
          <span>Google Maps Live API ({mode === 'markers' ? 'GIS Monitor' : 'Heatmap Overlay'})</span>
        </div>
      </div>
    );
  };

  // Clean, professional light-mode styled vector map
  const renderMockMap = () => {
    return (
      <div className="relative w-full h-full bg-[#f8fafc] overflow-hidden rounded-none border-none select-none shadow-none">
        {/* Soft Grid Lines */}
        <div className="absolute inset-0 opacity-[0.4] bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] [background-size:32px_32px]"></div>

        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 800 600">
          <defs>
            <linearGradient id="riverGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#bae6fd" />
              <stop offset="100%" stopColor="#7dd3fc" />
            </linearGradient>
          </defs>

          {/* Elegant river geometry */}
          <path d="M 50,-50 Q 180,100 150,220 T 350,380 T 700,500" fill="none" stroke="url(#riverGradient)" strokeWidth="24" strokeLinecap="round" opacity="0.6" />

          {/* Principal roads */}
          <path d="M 0,250 Q 300,280 400,290 T 800,320" fill="none" stroke="#ffffff" strokeWidth="8" strokeLinecap="round" />
          <path d="M 0,250 Q 300,280 400,290 T 800,320" fill="none" stroke="#cbd5e1" strokeWidth="6" strokeLinecap="round" />

          <path d="M 380,0 Q 400,200 420,380 T 450,600" fill="none" stroke="#ffffff" strokeWidth="8" strokeLinecap="round" />
          <path d="M 380,0 Q 400,200 420,380 T 450,600" fill="none" stroke="#cbd5e1" strokeWidth="6" strokeLinecap="round" />

          {/* Secondary streets */}
          <path d="M 100,50 L 700,180" fill="none" stroke="#e2e8f0" strokeWidth="3" strokeDasharray="3 3" />
          <path d="M 50,450 L 750,420" fill="none" stroke="#e2e8f0" strokeWidth="3" strokeDasharray="3 3" />

          {/* Minimalist sector labels */}
          <text x="80" y="80" fill="#94a3b8" className="text-[10px] font-semibold tracking-wider">SECTOR W-07</text>
          <text x="480" y="80" fill="#94a3b8" className="text-[10px] font-semibold tracking-wider">SECTOR E-08</text>
          <text x="80" y="380" fill="#94a3b8" className="text-[10px] font-semibold tracking-wider">SECTOR W-12</text>
        </svg>

        {/* Heatmap overlay (Render when activeTab is dashboard) */}
        {activeTab === 'dashboard' && (
          <div className="absolute inset-0 pointer-events-none opacity-20 bg-[radial-gradient(circle_220px_at_65%_45%,#ef4444_0%,transparent_70%),radial-gradient(circle_160px_at_25%_65%,#f97316_0%,transparent_70%)]"></div>
        )}

        {/* Elegant Map Pins */}
        {filteredIssues.map((issue) => {
          const latMin = 26.905;
          const latMax = 26.925;
          const lngMin = 75.780;
          const lngMax = 75.795;

          const pctX = (issue.location.lng - lngMin) / (lngMax - lngMin);
          const pctY = 1 - (issue.location.lat - latMin) / (latMax - latMin);

          const x_pct = ((100 + pctX * 600) / 800) * 100;
          const y_pct = ((100 + pctY * 400) / 600) * 100;

          // Severity colors
          let color = '#f59e0b'; // amber
          if (issue.status === 'resolved') {
            color = '#10b981'; // emerald
          } else if (issue.severity >= 8) {
            color = '#ef4444'; // rose
          } else if (issue.severity >= 5) {
            color = '#f97316'; // orange
          }

          return (
            <div
              key={issue.id}
              className="map-marker absolute group cursor-pointer transition-all duration-200 hover:scale-110 z-10"
              style={{ left: `${x_pct}%`, top: `${y_pct}%`, transform: 'translate(-50%, -50%)' }}
              onClick={() => setSelectedIssue(issue)}
            >
              {/* Soft pulse ring for unresolved issues */}
              {issue.status !== 'resolved' && (
                <div
                  className="absolute -inset-2.5 rounded-full map-dot-pulse"
                  style={{ '--color': color } as React.CSSProperties}
                ></div>
              )}

              {/* Sleek map marker circle */}
              <div
                className={`relative flex items-center justify-center w-8 h-8 rounded-full bg-white border transition-all ${selectedIssue?.id === issue.id ? 'ring-2 ring-[#C8873A] ring-offset-1' : ''
                  }`}
                style={{ borderColor: color, borderWidth: '2.5px' }}
              >
                {issue.status === 'resolved' ? (
                  <Check className="w-3.5 h-3.5 stroke-[3.5]" style={{ color: '#3D6B4F' }} />
                ) : (
                  <MapPin className="w-3.5 h-3.5" style={{ color: color }} />
                )}

                {/* Micro severity badge */}
                {issue.status !== 'resolved' && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-charcoal text-[9px] font-mono font-bold text-white border border-white">
                    {issue.severity}
                  </span>
                )}
              </div>

              {/* Tooltip Hover Info */}
              <div className="absolute left-1/2 -bottom-12 -translate-x-1/2 hidden group-hover:block z-20 w-40 bg-slate-900 text-white text-[10px] p-2 rounded-md shadow-lg text-center whitespace-nowrap font-medium">
                <span className="capitalize font-bold text-slate-100">{issue.category.replace('_', ' ')}</span>
                <span className="text-slate-400 block text-[9px] mt-0.5">Status: {issue.status}</span>
              </div>
            </div>
          );
        })}

        {/* Live Maps connection badge */}
        <div className="absolute top-4 left-4 bg-white/95 border border-slate-200 text-[10px] font-medium text-slate-600 px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-soft backdrop-blur-sm">
          <Layers className="w-3.5 h-3.5 text-blue-600" />
          <span>Interactive Vector Grid Mode (Offline Fallback)</span>
        </div>
      </div>
    );
  };

  const getLocalDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371000; // meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const getOptimizedRoute = (unsolvedIssues: Issue[]) => {
    const startLat = 26.9124;
    const startLng = 75.7873;
    const result: { issue: Issue; distFromLast: number }[] = [];
    const pool = [...unsolvedIssues];
    let currLat = startLat;
    let currLng = startLng;
    while (pool.length > 0) {
      let bestIdx = 0;
      let minDist = Infinity;
      for (let i = 0; i < pool.length; i++) {
        const d = getLocalDistance(currLat, currLng, pool[i].location.lat, pool[i].location.lng);
        if (d < minDist) {
          minDist = d;
          bestIdx = i;
        }
      }
      const item = pool.splice(bestIdx, 1)[0];
      result.push({ issue: item, distFromLast: minDist });
      currLat = item.location.lat;
      currLng = item.location.lng;
    }
    return result;
  };

  const renderFieldOpsWorkspace = () => {
    // Filter active issues assigned or in progress for current category
    const activeUnresolved = issues.filter(i => i && i.status !== 'resolved' && i.category === workerDept);
    const optimizedRoute = getOptimizedRoute(activeUnresolved);

    // Categories mapping for visual department display
    const deptLabels: Record<string, string> = {
      pothole: "PWD Roads Division",
      water_leak: "Water Supply Authority (PHED)",
      streetlight: "Electricity Distribution (JVVNL)",
      waste: "Municipal Waste Division (JMC)"
    };

    const handleStartWork = (issueId: string) => {
      db.updateIssue(issueId, { status: 'in_progress' });
      setWorkerSelectedIssue(prev => prev && prev.id === issueId ? { ...prev, status: 'in_progress' } : prev);
      setSessionHasStartedWork(true);
      pushNotification(
        "Job En Route",
        `Field crew is en route to ${deptLabels[workerDept]} reported issue at ${issues.find(i => i.id === issueId)?.address.split(',')[0]}`,
        "warning"
      );
    };

    const handleVerifyRepair = async (issue: Issue) => {
      if (!afterImageProof) {
        pushNotification("Proof Required", "Please select a completed repair image as visual proof.", "warning");
        return;
      }
      setIsVerifyingRepair(true);
      setVerificationResult(null);

      try {
        const isFakeSelected = (AFTER_PRESETS[issue.category] || []).find(p => p.url === afterImageProof)?.isFake || false;
        const res = await fetch('/api/verify-resolution', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            beforeImage: issue.photoUrl,
            afterImage: afterImageProof,
            category: issue.category,
            workerDescription: repairNotes,
            isFake: isFakeSelected
          })
        });

        if (res.ok) {
          const data = await res.json();
          setVerificationResult(data);

          if (data.isResolved) {
            // Resolution Success: Update DB status to resolved
            db.updateIssue(issue.id, {
              status: 'resolved',
              resolvedAt: new Date().toISOString()
            });
            setWorkerSelectedIssue(prev => prev && prev.id === issue.id ? { ...prev, status: 'resolved' } : prev);
            setSessionHasVerified(true);

            // Reward points to worker
            const userProfile = db.getUserProfile(currentUser?.id || '');
            if (userProfile) {
              db.updateUserProfile(userProfile.id, {
                points: userProfile.points + 50, // 50 XP for completing repair!
                resolvedCount: userProfile.resolvedCount + 1
              });
            }

            // Also reward points to original reporter!
            const reporterProfile = db.getUserProfile(issue.reporterId);
            if (reporterProfile && reporterProfile.id !== currentUser?.id) {
              db.updateUserProfile(reporterProfile.id, {
                points: reporterProfile.points + 100, // 100 XP reporter resolution bonus!
                resolvedCount: reporterProfile.resolvedCount + 1
              });
            }

            pushNotification(
              "Repair Quality Approved",
              `AI Inspector approved repairs at ${issue.address.split(',')[0]}! Incident resolved.`,
              "success"
            );
          } else {
            pushNotification(
              "Repair Quality Rejected",
              `AI Inspector identified defects at ${issue.address.split(',')[0]}. Repairs en route again.`,
              "warning"
            );
          }
        } else {
          console.error("Failed to reach resolution verification endpoint.");
        }
      } catch (err) {
        console.error("Error during repair verification:", err);
      } finally {
        setIsVerifyingRepair(false);
      }
    };

    return (
      <div className="flex-1 flex flex-col xl:flex-row gap-6">
        {/* Left Column: Sequenced Route Queue */}
        <div className="w-full xl:w-[380px] bg-warm-white border border-hairline p-5 flex flex-col shrink-0 text-left">
          <div className="border-b border-hairline pb-4 mb-4 select-none">
            <span className="text-[9px] font-extrabold uppercase tracking-widest text-[#A06828]">Smart Routing Optimizer</span>
            <h3 className="text-sm font-bold font-sans text-charcoal uppercase mt-1">Field Crew Dispatch</h3>
            <p className="text-[11px] text-dust mt-1 leading-relaxed">
              Assigned tasks sequenced using the <strong>Nearest-Neighbor TSP Solver</strong> starting from Ward 7 field station.
            </p>
          </div>

          {/* Department Quick Filter */}
          <div className="grid grid-cols-2 gap-2 mb-5">
            {(['pothole', 'water_leak', 'streetlight', 'waste'] as const).map(dept => {
              const active = workerDept === dept;
              return (
                <button
                  key={dept}
                  onClick={() => {
                    setWorkerDept(dept);
                    setWorkerSelectedIssue(null);
                    setVerificationResult(null);
                    setAfterImageProof('');
                    setRepairNotes('');
                  }}
                  className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-center border transition-all ${
                    active
                      ? 'bg-charcoal text-white border-charcoal'
                      : 'bg-white text-charcoal border-hairline hover:bg-stone/20'
                  }`}
                >
                  {dept.replace('_', ' ')}
                </button>
              );
            })}
          </div>

          <div className="bg-[#1C1C1E] text-white p-3.5 mb-4 border border-dark-border select-none">
            <span className="text-[8px] font-mono text-dust tracking-widest uppercase">Assigned Department</span>
            <p className="text-xs font-bold text-[#C8873A] mt-1 uppercase tracking-wide">{deptLabels[workerDept]}</p>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3.5 no-scrollbar max-h-[420px] xl:max-h-[500px]">
            {optimizedRoute.length === 0 ? (
              <div className="p-12 text-center text-[#9A9A9C] text-xs font-mono select-none">
                [ALL COMPLAINTS RESOLVED]
              </div>
            ) : (
              optimizedRoute.map(({ issue, distFromLast }, index) => {
                const isActive = workerSelectedIssue?.id === issue.id;
                const distanceText = distFromLast >= 1000
                  ? `${(distFromLast / 1000).toFixed(1)} km`
                  : `${distFromLast.toFixed(0)}m`;

                return (
                  <div
                    key={issue.id}
                    onClick={() => {
                      setWorkerSelectedIssue(issue);
                      setVerificationResult(null);
                      setAfterImageProof('');
                      setRepairNotes('');
                    }}
                    className={`p-4 border cursor-pointer select-none text-left transition-all relative ${
                      isActive
                        ? 'bg-stone border-charcoal'
                        : 'bg-stone/10 border-hairline hover:bg-stone/30'
                    }`}
                  >
                    {/* Sequence Badge */}
                    <div className="absolute top-3.5 right-3.5 bg-charcoal text-white text-[9px] font-mono font-bold w-5 h-5 flex items-center justify-center rounded-full select-none">
                      {index + 1}
                    </div>

                    <span className="text-[8px] font-mono font-bold text-dust uppercase tracking-wider block">
                      {index === 0 ? "★ CURRENT ROUTE STOP" : `STOP #${index + 1}`}
                    </span>
                    <h4 className="text-xs font-bold font-sans text-charcoal truncate mt-1 w-[80%]">
                      {issue.address.split(',')[0]}
                    </h4>
                    <p className="text-[10px] text-dust mt-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-[#C8873A]" />
                      <span>{distanceText}</span>
                    </p>

                    <div className="flex items-center justify-between border-t border-hairline mt-3 pt-2">
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 border font-mono uppercase ${
                        issue.status === 'in_progress'
                          ? 'bg-[#FEF3E2] text-[#A06828] border-[#C8873A]'
                          : 'bg-stone border-hairline text-dust'
                      }`}>
                        {issue.status.replace('_', ' ')}
                      </span>
                      <SLACountdown deadline={issue.slaDeadline} status={issue.status} size="sm" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Interactive Inspection Panel */}
        <div className="flex-1 bg-warm-white border border-hairline p-6 flex flex-col justify-between text-left">
          {!workerSelectedIssue ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-dust select-none">
              <Activity className="w-10 h-10 mb-2.5 text-dust stroke-[1.5]" />
              <h4 className="font-bold text-charcoal text-sm uppercase tracking-wider">No Active Route Stop Selected</h4>
              <p className="text-xs max-w-xs mt-1.5 leading-relaxed font-sans">
                Select an assigned incident stop from the dynamic routing list to initiate the repair and AI vision quality inspect workflow.
              </p>
            </div>
          ) : (
            <div className="space-y-6 flex-1 flex flex-col justify-between">
              <div>
                {/* Header detail */}
                <div className="flex items-start justify-between border-b border-hairline pb-4 select-none">
                  <div>
                    <span className="text-[9px] font-extrabold uppercase tracking-widest text-[#A06828]">ACTIVE INCIDENT DETAIL</span>
                    <h2 className="text-sm font-bold text-charcoal mt-1 uppercase font-sans truncate max-w-[240px] md:max-w-none">
                      {workerSelectedIssue.category.replace('_', ' ')} — {workerSelectedIssue.address.split(',')[0]}
                    </h2>
                    <p className="text-[11px] text-dust mt-1 font-mono uppercase">ID: #{workerSelectedIssue.id.slice(-6).toUpperCase()}</p>
                  </div>
                  <SeverityRing score={workerSelectedIssue.severity} size="md" />
                </div>

                {/* Split layout: before image and description */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 my-5">
                  <div className="text-left select-none">
                    <span className="text-[9px] font-extrabold uppercase tracking-widest text-dust block mb-2 block">Reported BEFORE Image</span>
                    <img
                      src={workerSelectedIssue.photoUrl}
                      alt="before"
                      referrerPolicy="no-referrer"
                      className="w-full h-36 object-cover border border-hairline rounded-none"
                    />
                  </div>
                  <div className="text-left flex flex-col justify-between h-full py-1">
                    <div>
                      <span className="text-[9px] font-extrabold uppercase tracking-widest text-dust block">Citizen Complaint</span>
                      <p className="text-xs text-charcoal leading-relaxed font-sans font-medium mt-2 bg-stone/25 p-3 border border-hairline">
                        "{workerSelectedIssue.description}"
                      </p>
                    </div>

                    <div className="bg-[#FAFAF8] border border-hairline p-3 text-xs select-none space-y-1.5 mt-4 md:mt-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-dust uppercase tracking-wider">Priority Score</span>
                        <span className="font-mono font-bold text-charcoal">{workerSelectedIssue.priorityScore.toFixed(1)} / 40.0</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-dust uppercase tracking-wider">Report Timeline</span>
                        <span className="font-sans font-medium text-charcoal">{formatLocalDate(workerSelectedIssue.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Workflow state toggles */}
                {workerSelectedIssue.status === 'assigned' && (
                  <div className="bg-stone/10 border border-hairline p-5 text-center mt-6">
                    <h4 className="text-xs font-bold text-charcoal uppercase tracking-wider">STOP NOT IN PROGRESS YET</h4>
                    <p className="text-xs text-dust mt-1.5 max-w-sm mx-auto leading-relaxed font-sans">
                      Acknowledge dispatch of tools and materials, setting this incident stop status to "In Progress".
                    </p>
                    <button
                      onClick={() => handleStartWork(workerSelectedIssue.id)}
                      className="mt-4 px-6 py-3.5 bg-[#C8873A] hover:bg-[#A06828] text-white text-xs font-extrabold uppercase tracking-widest rounded-none border-b-2 border-b-[#A06828] transition-all"
                    >
                      Acknowledge & Begin Work
                    </button>
                  </div>
                )}

                {workerSelectedIssue.status === 'in_progress' && !verificationResult && (
                  <div className="border border-hairline p-5 mt-6 bg-[#FAFAF8] space-y-5 animate-in fade-in duration-200">
                    <div className="border-b border-hairline pb-3 select-none">
                      <span className="text-[9px] font-extrabold uppercase tracking-widest text-blue-600">AI QUALITY ASSURANCE INSPECTION</span>
                      <h4 className="text-xs font-bold text-charcoal mt-1 uppercase">Submit Work Proof for Verification</h4>
                    </div>

                    {/* Camera simulation after proof selector */}
                    <div>
                      <span className="text-[9px] font-extrabold uppercase tracking-widest text-dust block mb-2 select-none block">Select AFTER Repair Image Proof</span>
                      <div className="grid grid-cols-2 gap-3.5">
                        {(AFTER_PRESETS[workerSelectedIssue.category] || []).map((preset, idx) => {
                          const active = afterImageProof === preset.url;
                          return (
                            <div
                              key={idx}
                              onClick={() => {
                                setAfterImageProof(preset.url);
                                setVerificationResult(null);
                              }}
                              className={`p-2 border cursor-pointer select-none bg-white text-left transition-all ${
                                active ? 'ring-2 ring-blue-600 border-transparent' : 'border-hairline hover:bg-stone/20'
                              }`}
                            >
                              <img
                                src={preset.url}
                                alt={preset.name}
                                referrerPolicy="no-referrer"
                                className="w-full h-20 object-cover border border-hairline mb-1.5"
                              />
                              <p className={`text-[9px] font-bold uppercase tracking-wide leading-tight truncate ${preset.isFake ? 'text-red-500' : 'text-charcoal'}`}>
                                {preset.name}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Operator Notes input */}
                    <div className="text-left">
                      <span className="text-[9px] font-extrabold uppercase tracking-widest text-dust block mb-2 select-none block">Field Crew Repair Notes</span>
                      <textarea
                        value={repairNotes}
                        onChange={e => setRepairNotes(e.target.value)}
                        placeholder="Describe the repair materials, team size, and techniques utilized..."
                        className="w-full px-3 py-2.5 text-xs bg-white border border-[#D8D3CE] focus:outline-none focus:border-charcoal text-charcoal font-medium min-h-[70px]"
                      />
                    </div>

                    <button
                      onClick={() => handleVerifyRepair(workerSelectedIssue)}
                      disabled={isVerifyingRepair || !afterImageProof}
                      className={`w-full py-4 text-xs font-extrabold uppercase tracking-wider transition-all select-none flex items-center justify-center gap-2 border-b-2 rounded-none ${
                        isVerifyingRepair || !afterImageProof
                          ? 'bg-[#D8D3CE] text-[#9A9A9C] cursor-not-allowed border-b-transparent'
                          : 'bg-blue-600 hover:bg-blue-700 text-white border-b-blue-800'
                      }`}
                    >
                      {isVerifyingRepair ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-white" />
                          <span>Verifying with Gemini Vision AI...</span>
                        </>
                      ) : (
                        <span>Verify Resolution via Gemini AI Inspector</span>
                      )}
                    </button>
                  </div>
                )}

                {/* AI inspection result card */}
                {verificationResult && (
                  <div className="mt-6 animate-in zoom-in-95 duration-250 select-none">
                    {verificationResult.isResolved ? (
                      <div className="bg-[#EAF1EC] border-l-[4px] border-l-[#3D6B4F] border-y border-r border-[#A8C5AF] p-5 space-y-4">
                        <div className="flex items-start gap-4">
                          <div className="bg-[#3D6B4F] text-white p-2.5 rounded-full">
                            <Check className="w-6 h-6 stroke-[3]" />
                          </div>
                          <div className="text-left flex-1">
                            <span className="text-[9px] font-extrabold uppercase tracking-widest text-[#3D6B4F]">QUALITY INSPECTION: APPROVED</span>
                            <h4 className="text-sm font-extrabold text-charcoal mt-1 uppercase font-sans">Resolution Verified</h4>
                            <p className="text-[11px] font-mono text-[#3D6B4F] font-bold mt-0.5">CONFIDENCE LEVEL: {(verificationResult.confidence * 100).toFixed(0)}%</p>
                          </div>
                        </div>

                        <p className="text-xs font-sans text-[#2E4F39] leading-relaxed italic bg-white/40 p-3.5 border border-[#3D6B4F]/25 font-medium">
                          "{verificationResult.aiVerificationReport}"
                        </p>

                        <div className="bg-white/60 p-3.5 border border-[#3D6B4F]/20 text-[10px] font-medium text-[#2E4F39] uppercase tracking-wide flex justify-between items-center flex-wrap gap-2">
                          <span>+50 XP Field Operator Rewards points added</span>
                          <span>+100 XP Reporter resolution points added</span>
                        </div>

                        <button
                          onClick={() => {
                            setWorkerSelectedIssue(null);
                            setVerificationResult(null);
                            setAfterImageProof('');
                            setRepairNotes('');
                          }}
                          className="w-full py-3.5 bg-[#3D6B4F] hover:bg-[#2E4F39] text-white text-xs font-extrabold uppercase tracking-widest border-b-2 border-b-[#2E4F39]"
                        >
                          Clear stop & Proceed Next
                        </button>
                      </div>
                    ) : (
                      <div className="bg-[#FDECEA] border-l-[4px] border-l-[#B03A2E] border-y border-r border-[#E07A73] p-5 space-y-4">
                        <div className="flex items-start gap-4">
                          <div className="bg-[#B03A2E] text-white p-2.5 rounded-full">
                            <X className="w-6 h-6 stroke-[3]" />
                          </div>
                          <div className="text-left flex-1">
                            <span className="text-[9px] font-extrabold uppercase tracking-widest text-[#B03A2E]">QUALITY INSPECTION: FAILED</span>
                            <h4 className="text-sm font-extrabold text-charcoal mt-1 uppercase font-sans">Defects Identified</h4>
                            <p className="text-[11px] font-mono text-[#B03A2E] font-bold mt-0.5">VERDICT CONFIDENCE: {(verificationResult.confidence * 100).toFixed(0)}%</p>
                          </div>
                        </div>

                        <p className="text-xs font-sans text-[#78241C] leading-relaxed italic bg-white/40 p-3.5 border border-[#B03A2E]/25 font-medium">
                          "{verificationResult.aiVerificationReport || 'The AFTER image still contains the reported civic defect. Site remains unresolved.'}"
                        </p>

                        <div className="bg-white/60 p-3.5 border border-[#B03A2E]/20 text-[10px] font-medium text-[#78241C] uppercase tracking-wide">
                          Resolution rejected. Operator must carry out actual repairs and resubmit correct visual proof.
                        </div>

                        <button
                          onClick={() => {
                            setVerificationResult(null);
                            setAfterImageProof('');
                          }}
                          className="w-full py-3.5 bg-[#B03A2E] hover:bg-[#8B2C24] text-white text-xs font-extrabold uppercase tracking-widest border-b-2 border-b-[#8B2C24]"
                        >
                          Re-Inspect & Try Again
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const handleQuestRoleSwitch = (newRole: 'citizen' | 'worker' | 'admin') => {
    if (!currentUser) return;
    db.updateUserProfile(currentUser.id, { role: newRole });
    if (newRole === 'citizen') {
      setActiveTab('map');
    } else if (newRole === 'worker') {
      setActiveTab('worker');
    } else if (newRole === 'admin') {
      setActiveTab('dashboard');
    }
  };

  const renderWalkthroughWidget = (isMobile = false) => {
    const questSteps = [
      {
        id: 1,
        title: 'Report Incident',
        role: 'Citizen',
        desc: 'Submit a new report on the map with a test photo.',
        done: sessionHasReported,
        actionLabel: 'Report',
        onClick: () => {
          handleQuestRoleSwitch('citizen');
          setIsReportOpen(true);
        }
      },
      {
        id: 2,
        title: 'View Triage',
        role: 'Citizen',
        desc: 'Select your incident to see Gemini\'s priority & SLA.',
        done: sessionHasViewedAnalysis,
        actionLabel: 'Inspect',
        onClick: () => {
          handleQuestRoleSwitch('citizen');
          if (issues.length > 0) {
            setSelectedIssue(issues[issues.length - 1]);
          }
        }
      },
      {
        id: 3,
        title: 'Deploy Crew',
        role: 'Crew',
        desc: 'Switch role to "Field Crew" in the selector above.',
        done: sessionHasSwitchedToWorker,
        actionLabel: 'Deploy',
        onClick: () => {
          handleQuestRoleSwitch('worker');
        }
      },
      {
        id: 4,
        title: 'Acknowledge Work',
        role: 'Crew',
        desc: 'In Field Ops, pick a task and click "Begin Work".',
        done: sessionHasStartedWork,
        actionLabel: 'Start Work',
        onClick: () => {
          handleQuestRoleSwitch('worker');
        }
      },
      {
        id: 5,
        title: 'AI Verification',
        role: 'Crew',
        desc: 'Upload/choose AFTER image & run Gemini Visual Check.',
        done: sessionHasVerified,
        actionLabel: 'Verify',
        onClick: () => {
          handleQuestRoleSwitch('worker');
          const inProg = issues.find(i => i.status === 'in_progress');
          if (inProg) {
            setWorkerSelectedIssue(inProg);
          } else {
            const assigned = issues.find(i => i.status === 'assigned');
            if (assigned) setWorkerSelectedIssue(assigned);
          }
        }
      },
      {
        id: 6,
        title: 'Admin Analytics',
        role: 'Admin',
        desc: 'Open Command Center to query Gemini municipal strategist.',
        done: sessionHasOpenedDashboard,
        actionLabel: 'Insights',
        onClick: () => {
          handleQuestRoleSwitch('admin');
        }
      }
    ];

    const completedCount = questSteps.filter(s => s.done).length;
    const progressPercent = Math.round((completedCount / questSteps.length) * 100);
    const isQuestComplete = completedCount === questSteps.length;

    if (isWalkthroughCollapsed) {
      return (
        <div className="border-b border-hairline p-2.5 bg-stone/10 hover:bg-stone/20 transition-all cursor-pointer flex items-center justify-between select-none" onClick={() => setIsWalkthroughCollapsed(false)}>
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-amber" />
            <span className="text-[9px] font-extrabold uppercase tracking-widest text-charcoal">Civic Quest Guide</span>
            <span className="text-[9px] font-mono bg-[#C8873A]/10 text-[#A06828] px-1.5 py-0.5 rounded-chip font-bold">
              {completedCount}/{questSteps.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[8px] font-extrabold text-[#A06828] uppercase tracking-wider">Expand</span>
            <ChevronDown className="w-3.5 h-3.5 text-[#A06828]" />
          </div>
        </div>
      );
    }

    return (
      <div className={`border-b border-hairline bg-[#FAFAF8] ${isMobile ? 'p-4 border-t' : 'p-4'}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber animate-pulse" />
            <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-charcoal">Interactive Quest</h4>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono bg-[#C8873A]/10 text-[#A06828] px-1.5 py-0.5 rounded-chip font-extrabold">
              {progressPercent}%
            </span>
            <button onClick={() => setIsWalkthroughCollapsed(true)} className="text-dust hover:text-charcoal p-0.5" title="Collapse Guide">
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Short Instructions */}
        <p className="text-[9px] font-medium text-[#4A4A4C] leading-normal mb-3 font-sans uppercase tracking-wider">
          Experience the autonomous multi-agent pipeline step-by-step:
        </p>

        {/* Progress Bar */}
        <div className="w-full h-1 bg-stone rounded-none mb-4 overflow-hidden">
          <div className="h-full bg-amber transition-all duration-500 ease-out" style={{ width: `${progressPercent}%` }} />
        </div>

        {/* Quick Role Switcher Panel */}
        <div className="bg-stone/30 border border-hairline p-2.5 mb-4 rounded-none">
          <div className="text-[8px] font-extrabold text-dust tracking-wider uppercase mb-1.5">Quick Role Switcher</div>
          <div className="grid grid-cols-3 gap-1">
            {[
              { role: 'citizen' as const, label: 'Citizen', icon: User },
              { role: 'worker' as const, label: 'Crew', icon: Activity },
              { role: 'admin' as const, label: 'Admin', icon: ShieldCheck }
            ].map((btn) => {
              const isSelected = currentUser?.role === btn.role;
              return (
                <button
                  key={btn.role}
                  onClick={() => handleQuestRoleSwitch(btn.role)}
                  className={`py-1.5 px-1 flex flex-col items-center justify-center gap-1 transition-all border ${
                    isSelected
                      ? 'bg-charcoal text-white border-charcoal font-bold'
                      : 'bg-warm-white text-dust hover:text-charcoal hover:bg-stone/20 border-hairline font-medium'
                  }`}
                >
                  <btn.icon className={`w-3.5 h-3.5 ${isSelected ? 'text-amber' : 'text-dust'}`} />
                  <span className="text-[8px] uppercase tracking-wider">{btn.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Steps List */}
        <div className="space-y-2.5 max-h-[220px] overflow-y-auto no-scrollbar pr-1">
          {questSteps.map((step) => (
            <div key={step.id} className="flex gap-2 text-left items-start border-b border-stone/30 pb-2 last:border-0 last:pb-0">
              <button
                onClick={step.onClick}
                className="mt-0.5 shrink-0 focus:outline-none"
              >
                {step.done ? (
                  <CheckCircle className="w-4 h-4 text-[#3D6B4F] fill-[#3D6B4F]/10 stroke-[2.5]" />
                ) : (
                  <div className="w-4 h-4 rounded-none border-[1.5px] border-dust/60 hover:border-amber transition-all flex items-center justify-center bg-white" />
                )}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-[9px] font-extrabold uppercase tracking-wider truncate leading-tight ${step.done ? 'line-through text-dust' : 'text-charcoal'}`}>
                    {step.id}. {step.title}
                  </span>
                  {!step.done && (
                    <button
                      onClick={step.onClick}
                      className="text-[8px] font-extrabold uppercase tracking-widest text-amber hover:text-amber-dark shrink-0 border border-amber/20 px-1 py-0.5 bg-amber/5 font-mono"
                    >
                      {step.actionLabel}
                    </button>
                  )}
                </div>
                <p className="text-[9px] text-[#4A4A4C] leading-normal font-sans mt-0.5 font-medium">
                  {step.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        {isQuestComplete && (
          <div className="mt-3.5 bg-resolved/10 border border-resolved/30 p-2.5 flex items-center gap-2 animate-fade-in">
            <Award className="w-4 h-4 text-resolved shrink-0 animate-bounce" />
            <div className="text-left">
              <p className="text-[9px] font-extrabold text-resolved uppercase tracking-wider">Quest Completed!</p>
              <p className="text-[8px] text-resolved/80 font-semibold font-sans mt-0.2">You have successfully explored the entire municipal multi-agent system workflow.</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-stone text-charcoal font-sans md:flex-row flex-col">

      {/* Responsive Sidebar - Visible on Desktop, Hidden on Mobile */}
      <aside className="hidden md:flex flex-col w-64 bg-warm-white h-full shrink-0 z-10 select-none rounded-none shadow-none justify-between text-left">
        {/* Branding & Logo */}
        <div className="relative p-4 bg-charcoal border-b border-dark-border border-r border-dark-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* SVG Logo Icon */}
            <svg className="w-9 h-9 shrink-0" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="49" fill="#1C1C1E" />
              <circle cx="50" cy="50" r="39" stroke="#C8873A" strokeWidth="2" fill="none" />
              <line x1="50" y1="6" x2="50" y2="16" stroke="#C8873A" strokeWidth="2" />
              <line x1="50" y1="84" x2="50" y2="94" stroke="#C8873A" strokeWidth="2" />
              <line x1="6" y1="50" x2="16" y2="50" stroke="#C8873A" strokeWidth="2" />
              <line x1="84" y1="50" x2="94" y2="50" stroke="#C8873A" strokeWidth="2" />
              <circle cx="50" cy="50" r="22" stroke="#FFFFFF" strokeWidth="1.5" strokeDasharray="3 3" fill="none" />
              <circle cx="50" cy="50" r="8" fill="#C8873A" />
            </svg>
            
            <div className="flex flex-col text-left">
              <h1 className="text-[17px] font-serif leading-none tracking-normal">
                <span className="font-bold text-white">Civ</span>
                <span className="font-normal text-[#C8873A]">Sight</span>
              </h1>
              <span className="text-[7.5px] font-sans font-medium uppercase tracking-[0.16em] text-dust mt-1 leading-none select-none whitespace-nowrap">
                SEE IT.&nbsp;&nbsp;PROVE IT.&nbsp;&nbsp;FIX IT.
              </span>
            </div>
          </div>

          <div className="absolute top-4 right-4 flex items-center gap-1.5">
            <span className="text-[9px] font-mono text-dust">v1.0</span>
            {/* Notification Bell */}
            <div className="relative" ref={desktopNotifRef}>
              <button
                onClick={() => { setNotifPanelOpen(v => !v); }}
                className="relative p-1.5 rounded-none hover:bg-white/10 transition-colors text-dust hover:text-white"
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#C8873A] text-[9px] font-bold text-white border border-charcoal select-none">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown Panel */}
              {notifPanelOpen && (
                <div 
                  className="fixed w-80 bg-warm-white border border-hairline shadow-none z-50 flex flex-col rounded-none animate-slide-in" 
                  style={{ top: '60px', left: '256px', maxHeight: '440px' }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="p-3 border-b border-hairline flex items-center justify-between bg-stone/30">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-charcoal select-none">Notifications</span>
                    <button onClick={markAllRead} className="text-[9px] font-bold text-[#A06828] hover:text-[#C8873A] uppercase tracking-wider select-none">
                      Mark all read
                    </button>
                  </div>
                  <div className="overflow-y-auto flex-1 divide-y divide-hairline no-scrollbar">
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center text-[11px] text-dust font-mono select-none">[NO ALERTS]</div>
                    ) : (
                      notifications.map(n => (
                        <div
                          key={n.id}
                          className={`p-3 flex items-start gap-2.5 text-left transition-colors ${
                            n.read ? 'bg-warm-white' : 'bg-stone/50'
                          }`}
                        >
                          <div className="mt-0.5 shrink-0">
                            {n.type === 'success' ? (
                              <CheckCircle className="w-3.5 h-3.5 text-[#3D6B4F]" />
                            ) : n.type === 'warning' ? (
                              <AlertTriangle className="w-3.5 h-3.5 text-[#C8873A]" />
                            ) : (
                              <Bell className="w-3.5 h-3.5 text-[#9A9A9C]" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-[#C8873A] inline-block mr-1.5 mb-0.5" />}
                            <p className="text-[10px] font-bold text-charcoal uppercase tracking-wide leading-tight">{n.title}</p>
                            <p className="text-[11px] text-[#4A4A4C] mt-0.5 leading-relaxed font-sans">{n.message}</p>
                            <p className="text-[9px] text-dust font-mono mt-1">{formatLocalTime(n.timestamp)}</p>
                          </div>
                          <button
                            onClick={() => dismissNotification(n.id)}
                            className="p-0.5 hover:bg-stone/30 rounded-none transition-colors shrink-0"
                          >
                            <X className="w-3 h-3 text-dust" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable Container for Sidebar Content */}
        <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col justify-between">
          <div className="flex flex-col flex-1">
            {/* Walkthrough Quest & Quick Switcher Widget */}
            {renderWalkthroughWidget(false)}

            {/* Navigation Tabs Links */}
            <div className="flex-1 py-6 px-4 space-y-1 border-r border-hairline">
              {[
                { id: 'map', label: 'Map', icon: MapPin },
                { id: 'reports', label: 'Reports', icon: List },
                ...(currentUser?.role === 'worker' ? [{ id: 'worker', label: 'Field Ops', icon: Activity }] : []),
                ...(currentUser?.role === 'admin' ? [{ id: 'dashboard', label: 'Dashboard', icon: TrendingUp }] : []),
                { id: 'profile', label: 'Profile', icon: User }
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id as any);
                      setSelectedIssue(null);
                    }}
                    className={`nav-button w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold tracking-wider uppercase transition-all border border-transparent rounded-none ${isActive
                        ? 'text-charcoal bg-stone'
                        : 'text-dust hover:text-charcoal hover:bg-stone/50'
                      }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-amber' : 'text-dust'}`} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* User profile & Reset DB widget at the bottom */}
          <div className="p-6 border-t border-hairline border-r border-hairline space-y-4 bg-stone/20">
            {currentUser && (
              <div className="flex items-center gap-3 bg-warm-white p-3 border border-hairline rounded-none shadow-none">
                {renderUserAvatar(currentUser, "w-8 h-8 text-[10px] shrink-0")}
                <div className="text-left min-w-0">
                  <p className="text-xs font-bold text-charcoal leading-tight truncate">{currentUser.displayName}</p>
                  <p className="text-[9px] text-amber-dark font-extrabold flex items-center gap-0.5 mt-0.5 tracking-wide uppercase">
                    <Award className="w-3 h-3 text-amber" />
                    {currentUser.points} XP
                  </p>
                </div>
              </div>
            )}
            <button
              onClick={handleResetData}
              className="reset-button w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-warm-white hover:bg-stone/20 border border-charcoal text-charcoal text-[11px] font-bold tracking-wide uppercase transition-all shadow-none rounded-none"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reset Database</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile-Only Header bar */}
      <header className="flex md:hidden items-center justify-between p-4 bg-charcoal border-b border-dark-border z-10 shrink-0 shadow-none w-full">
        <div className="flex items-center gap-2">
          {/* SVG Logo Icon */}
          <svg className="w-7 h-7 shrink-0" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="49" fill="#1C1C1E" />
            <circle cx="50" cy="50" r="39" stroke="#C8873A" strokeWidth="2" fill="none" />
            <line x1="50" y1="6" x2="50" y2="16" stroke="#C8873A" strokeWidth="2" />
            <line x1="50" y1="84" x2="50" y2="94" stroke="#C8873A" strokeWidth="2" />
            <line x1="6" y1="50" x2="16" y2="50" stroke="#C8873A" strokeWidth="2" />
            <line x1="84" y1="50" x2="94" y2="50" stroke="#C8873A" strokeWidth="2" />
            <circle cx="50" cy="50" r="22" stroke="#FFFFFF" strokeWidth="1.5" strokeDasharray="3 3" fill="none" />
            <circle cx="50" cy="50" r="8" fill="#C8873A" />
          </svg>
          <h1 className="text-[17px] font-serif leading-none tracking-normal">
            <span className="font-bold text-white">Civ</span>
            <span className="font-normal text-[#C8873A]">Sight</span>
          </h1>
        </div>
        <div className="flex items-center gap-3.5">
          <button
            onClick={() => {
              const searchEl = document.querySelector('input[placeholder="Search address..."]');
              if (searchEl) (searchEl as HTMLInputElement).focus();
            }}
            className="text-white hover:text-[#C8873A] transition-colors p-1"
          >
            <Search className="w-5 h-5" />
          </button>
          {/* Mobile Bell */}
          <div className="relative" ref={mobileNotifRef}>
            <button
              onClick={() => setNotifPanelOpen(v => !v)}
              className="text-white hover:text-[#C8873A] transition-colors p-1 relative"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#C8873A] text-[9px] font-bold text-white border border-charcoal select-none">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {/* Mobile notification panel */}
            {notifPanelOpen && (
              <div 
                className="absolute top-full right-0 mt-2 w-72 bg-warm-white border border-hairline z-50 flex flex-col rounded-none animate-slide-in" 
                style={{ maxHeight: '380px' }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="p-3 border-b border-hairline flex items-center justify-between bg-stone/30">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-charcoal">Notifications</span>
                  <button onClick={markAllRead} className="text-[9px] font-bold text-[#A06828] uppercase tracking-wider">Mark all read</button>
                </div>
                <div className="overflow-y-auto flex-1 divide-y divide-hairline no-scrollbar">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center text-[11px] text-dust font-mono select-none">[NO ALERTS]</div>
                  ) : (
                    notifications.map(n => (
                      <div key={n.id} className={`p-3 flex items-start gap-2.5 text-left ${n.read ? 'bg-warm-white' : 'bg-stone/50'}`}>
                        <div className="mt-0.5 shrink-0">
                          {n.type === 'success' ? <CheckCircle className="w-3.5 h-3.5 text-[#3D6B4F]" /> : n.type === 'warning' ? <AlertTriangle className="w-3.5 h-3.5 text-[#C8873A]" /> : <Bell className="w-3.5 h-3.5 text-[#9A9A9C]" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-[#C8873A] inline-block mr-1.5 mb-0.5" />}
                          <p className="text-[10px] font-bold text-charcoal uppercase tracking-wide">{n.title}</p>
                          <p className="text-[11px] text-[#4A4A4C] mt-0.5 font-sans">{n.message}</p>
                        </div>
                        <button onClick={() => dismissNotification(n.id)} className="p-0.5 shrink-0">
                          <X className="w-3 h-3 text-dust" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={handleResetData}
            className="text-white hover:text-[#C8873A] transition-colors p-1"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Workspace Frame */}
      <div className={`flex-1 flex flex-col overflow-hidden relative min-h-0 ${isReportOpen || chatOpen ? 'z-20' : 'z-0'}`}>

        {/* ── Demo Mode Banner ── */}
        {isDemoBannerVisible && (
          <div className="shrink-0 bg-amber-light border-b border-amber/40 px-4 py-2 flex items-center gap-3 z-10">
            <Zap className="w-3.5 h-3.5 text-amber-dark shrink-0" />
            <p className="text-[10px] font-bold text-amber-dark uppercase tracking-wider flex-1 select-none">
              Demo Mode Active — pre-seeded with realistic Jaipur incidents. Submit a new report or reset the database to start fresh.
            </p>
            <button
              onClick={() => {
                setIsDemoBannerVisible(false);
                if (typeof window !== 'undefined') localStorage.setItem('civsight_demo_dismissed', '1');
              }}
              className="text-amber-dark hover:text-charcoal transition-colors p-0.5 shrink-0"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {/* Statistics Ticker / Banner */}
        <div className="shrink-0 bg-[#1C1C1E] border-b border-dark-border px-4 py-2 flex items-center justify-between text-[10px] font-mono uppercase tracking-wider z-10 select-none h-9.5 overflow-hidden">
          {/* MOBILE & TABLET: Cycling Animated Ticker */}
          <div className="flex md:hidden items-center justify-between w-full h-full">
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[#C8873A] font-bold flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-[#C8873A] animate-pulse" />
                <span>CivSight</span>
              </span>
              <span className="flex items-center gap-1 px-1 py-0.5 rounded bg-red-950/40 text-red-500 border border-red-900/40 font-bold text-[7px] tracking-wider animate-pulse">
                <span className="w-1 h-1 rounded-full bg-red-500" />
                LIVE
              </span>
            </div>

            <div className="flex-1 flex items-center justify-end h-full overflow-hidden pl-3.5 relative">
              <AnimatePresence mode="wait">
                {currentStatIdx === 0 && (
                  <motion.div
                    key="resolved"
                    initial={{ y: 15, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -15, opacity: 0 }}
                    transition={{ duration: 0.35, ease: "easeInOut" }}
                    className="flex items-center gap-1 text-white text-[9px]"
                  >
                    <CheckCircle className="w-3.5 h-3.5 text-[#3D6B4F]" />
                    <span className="text-[#777]">Resolved:</span>
                    <span className="font-bold text-white ml-0.5">{resolvedCount}</span>
                  </motion.div>
                )}
                {currentStatIdx === 1 && (
                  <motion.div
                    key="citizens"
                    initial={{ y: 15, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -15, opacity: 0 }}
                    transition={{ duration: 0.35, ease: "easeInOut" }}
                    className="flex items-center gap-1 text-white text-[9px]"
                  >
                    <User className="w-3.5 h-3.5 text-[#C8873A]" />
                    <span className="text-[#777]">Citizens:</span>
                    <span className="font-bold text-white ml-0.5">{totalCitizensEngaged}</span>
                  </motion.div>
                )}
                {currentStatIdx === 2 && (
                  <motion.div
                    key="analyses"
                    initial={{ y: 15, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -15, opacity: 0 }}
                    transition={{ duration: 0.35, ease: "easeInOut" }}
                    className="flex items-center gap-1 text-white text-[9px]"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#9C6EDB]" />
                    <span className="text-[#777]">AI Analyses:</span>
                    <span className="font-bold text-white ml-0.5">{issues.length}</span>
                  </motion.div>
                )}
                {currentStatIdx === 3 && (
                  <motion.div
                    key="savings"
                    initial={{ y: 15, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -15, opacity: 0 }}
                    transition={{ duration: 0.35, ease: "easeInOut" }}
                    className="flex items-center gap-1 text-white text-[9px]"
                  >
                    <TrendingUp className="w-3.5 h-3.5 text-[#C8873A]" />
                    <span className="text-[#777]">Est. Saved:</span>
                    <span className="text-[#C8873A] font-bold ml-0.5">₹{estimatedSavings.toLocaleString('en-IN')}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* DESKTOP: Static row of all stats */}
          <div className="hidden md:flex items-center justify-between w-full h-full">
            <div className="flex items-center gap-5">
              <span className="text-[#C8873A] font-bold flex items-center gap-1.5 shrink-0">
                <Zap className="w-3 h-3" />CivSight Live
              </span>
              <span className="flex items-center gap-1.5 text-white shrink-0">
                <CheckCircle className="w-3 h-3 text-[#3D6B4F]" />
                <span className="text-[#777]">Resolved:</span>&nbsp;<span className="font-bold">{resolvedCount}</span>
              </span>
              <span className="flex items-center gap-1.5 text-white shrink-0">
                <User className="w-3 h-3 text-[#C8873A]" />
                <span className="text-[#777]">Citizens:</span>&nbsp;<span className="font-bold">{totalCitizensEngaged}</span>
              </span>
              <span className="flex items-center gap-1.5 text-white shrink-0">
                <Sparkles className="w-3 h-3 text-[#9C6EDB]" />
                <span className="text-[#777]">AI Analyses:</span>&nbsp;<span className="font-bold">{issues.length}</span>
              </span>
              <span className="flex items-center gap-1.5 shrink-0">
                <TrendingUp className="w-3 h-3 text-[#C8873A]" />
                <span className="text-[#777]">Est. Saved:</span>&nbsp;
                <span className="text-[#C8873A] font-bold">₹{estimatedSavings.toLocaleString('en-IN')}</span>
              </span>
            </div>
            <span className="hidden lg:flex ml-auto items-center gap-1.5 text-dust shrink-0">
              <Sparkles className="w-3 h-3 text-[#C8873A]" />Powered by Gemini 2.0 Flash · Google Maps · Firebase
            </span>
          </div>
        </div>

        {/* Main Content Workspace */}
        <main className={`flex-1 p-3.5 sm:p-5 md:p-6 min-h-0 flex flex-col gap-4 md:gap-6 no-scrollbar overflow-y-auto ${activeTab === 'map' ? 'md:overflow-hidden' : ''}`}>

          {/* Mobile Walkthrough Quest Widget */}
          <div className="block md:hidden shrink-0 z-10">
            {renderWalkthroughWidget(true)}
          </div>

          {/* TAB 1: Live Map View */}
          {activeTab === 'map' && (
            <div className="flex-1 flex flex-col lg:flex-row gap-4 md:gap-6 lg:h-full lg:min-h-0">

              {/* Map block */}
              <div className="flex-1 relative h-[45vh] lg:h-full min-h-0 shrink-0 lg:shrink">
                {renderMapContainer(mapRef, 'markers')}

                {/* Floating Plus Report FAB Button on map */}
                <button
                  onClick={() => setIsReportOpen(true)}
                  className="absolute bottom-4 right-[72px] lg:bottom-6 lg:right-6 flex items-center justify-center w-14 h-14 rounded-full bg-[#C8873A] hover:bg-[#A06828] text-white shadow-none border-none z-10 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
                >
                  <Plus className="w-6 h-6 stroke-[2.5]" />
                </button>
              </div>

              {/* Recent reported issues list side panel */}
              <div className="w-full lg:w-[360px] h-[400px] lg:h-full flex flex-col bg-warm-white border border-hairline shadow-none shrink-0 lg:min-h-0 overflow-hidden rounded-none flex-1 lg:flex-initial">
                <div className="p-4.5 border-b border-hairline flex items-center justify-between bg-stone/20">
                  <h3 className="font-bold text-charcoal flex items-center gap-2 text-xs uppercase tracking-wider">
                    <List className="w-4 h-4 text-[#C8873A]" />
                    Incident Queue ({filteredIssues.length})
                  </h3>

                  {/* Inline search */}
                  <div className="relative w-40">
                    <input
                      type="text"
                      placeholder="Search address..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-2.5 py-1.5 text-[11px] bg-white border border-hairline rounded-none focus:outline-none focus:border-charcoal text-charcoal font-medium"
                    />
                    <Search className="w-3.5 h-3.5 text-dust absolute left-2.5 top-2.5" />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-hairline no-scrollbar bg-warm-white border-t border-hairline">
                  {filteredIssues.length === 0 ? (
                    <div className="p-12 text-center text-[#9A9A9C] text-xs font-mono">
                      [NO INCIDENTS FILED]
                    </div>
                  ) : (
                    filteredIssues.map((issue) => (
                      <IssueCard
                        key={issue.id}
                        issue={issue}
                        isActive={selectedIssue?.id === issue.id}
                        onClick={() => setSelectedIssue(issue)}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: My Reports */}
          {activeTab === 'reports' && (
            <div className="flex-1 flex flex-col gap-6 text-left">
              <div className="bg-warm-white p-6 border border-hairline">
                <h2 className="text-sm font-bold font-sans text-[#1C1C1E] flex items-center gap-2 uppercase tracking-wider">
                  <List className="w-5 h-5 text-[#C8873A]" />
                  Logged Incidents Log
                </h2>
                <p className="text-xs text-[#4A4A4C] mt-1">Verify updates, priority scoring, and logs of active issues in the local database.</p>
              </div>

              <div className="bg-warm-white border border-hairline divide-y divide-hairline">
                {issues.map((issue) => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    isActive={selectedIssue?.id === issue.id}
                    onClick={() => setSelectedIssue(issue)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* TAB 2.5: Field Operator Workspace */}
          {activeTab === 'worker' && (
            <div className="flex-1 flex flex-col gap-6 text-left animate-in fade-in duration-200">
              {renderFieldOpsWorkspace()}
            </div>
          )}

          {/* TAB 3: Admin Dashboard & Heatmap */}
          {activeTab === 'dashboard' && (
            <div className="flex-1 flex flex-col gap-6 text-left">

              {/* Analytics row (flat premium style, responsive grids to avoid overflow) */}
              <div className="bg-[#F2EDE8] border border-[#D8D3CE] grid grid-cols-2 md:grid-cols-4 p-0 select-none shadow-none rounded-none w-full">
                <div className="p-3.5 text-center flex flex-col justify-center min-h-[70px] border-b border-r border-[#D8D3CE] md:border-b-0">
                  <span className="text-[22px] font-sans font-bold text-[#1C1C1E]">{totalOpen}</span>
                  <span className="text-[11px] font-sans text-[#9A9A9C] uppercase tracking-wider mt-0.5">Open</span>
                </div>
                <div className="p-3.5 text-center flex flex-col justify-center min-h-[70px] border-b border-[#D8D3CE] md:border-b-0 md:border-r">
                  <span className="text-[22px] font-sans font-bold text-[#B03A2E]">{criticalIssues}</span>
                  <span className="text-[11px] font-sans text-[#9A9A9C] uppercase tracking-wider mt-0.5">Critical</span>
                </div>
                <div className="p-3.5 text-center flex flex-col justify-center min-h-[70px] border-r border-[#D8D3CE]">
                  <span className="text-[22px] font-sans font-bold text-[#3D6B4F]">{resolvedCount}</span>
                  <span className="text-[11px] font-sans text-[#9A9A9C] uppercase tracking-wider mt-0.5">Resolved</span>
                </div>
                <div className="p-3.5 text-center flex flex-col justify-center min-h-[70px]">
                  <span className="text-[22px] font-sans font-bold text-[#1C1C1E]">
                    {(() => {
                      const resolved = issues.filter(i => i.status === 'resolved' && i.resolvedAt && i.createdAt);
                      if (!resolved.length) return 'N/A';
                      const avgMs = resolved.reduce((sum, i) => sum + (new Date(i.resolvedAt!).getTime() - new Date(i.createdAt).getTime()), 0) / resolved.length;
                      return `${(avgMs / (1000 * 60 * 60 * 24)).toFixed(1)}d`;
                    })()}
                  </span>
                  <span className="text-[11px] font-sans text-[#9A9A9C] uppercase tracking-wider mt-0.5">Avg Time</span>
                </div>
              </div>

              {/* AI City Intelligence Report Card */}
              <div className="bg-warm-white border border-[#D8D3CE] p-6 rounded-none shadow-none text-left flex flex-col gap-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-[#9C6EDB]" />
                    <h3 className="text-sm font-bold text-charcoal uppercase tracking-widest font-sans">
                      AI City Intelligence Report
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono text-[#9C6EDB] bg-[#9C6EDB]/10 border border-[#9C6EDB]/30 px-2 py-0.5 rounded-full select-none flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5" /> Powered by Gemini 2.0 Flash
                    </span>
                    {aiInsights?.generatedAt && (
                      <span className="text-[9px] font-mono text-dust">
                        Gen: {formatLocalTime(aiInsights.generatedAt)}
                      </span>
                    )}
                  </div>
                </div>

                {!aiInsights && !isGeneratingInsights ? (
                  <div className="p-8 text-center bg-[#FAFAF8] border border-dashed border-[#D8D3CE] flex flex-col items-center justify-center gap-3">
                    <Database className="w-8 h-8 text-dust" />
                    <p className="text-xs font-sans text-[#4A4A4C]">No intelligence report generated for current municipal state.</p>
                    <button
                      onClick={handleGenerateInsights}
                      className="px-4 py-2 bg-[#C8873A] hover:bg-[#A06828] text-white text-xs font-bold uppercase tracking-wider transition-all select-none"
                    >
                      Generate AI Report
                    </button>
                  </div>
                ) : isGeneratingInsights ? (
                  <div className="p-12 text-center bg-[#FAFAF8] border border-dashed border-[#D8D3CE] flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-8 h-8 text-[#C8873A] animate-spin" />
                    <p className="text-xs font-mono text-amber-dark uppercase tracking-wider select-none animate-pulse">Running semantic analysis on municipal queues...</p>
                  </div>
                ) : (
                  <div className="space-y-5 animate-fade-in">

                    {/* ── Live Stats Strip (always current, zero API cost) ── */}
                    <div className="bg-stone border border-hairline grid grid-cols-4 divide-x divide-hairline select-none">
                      <div className="p-3 text-center flex flex-col gap-0.5">
                        <span className={`text-lg font-mono font-bold ${liveSlaBreaches > 0 ? 'text-[#B03A2E]' : 'text-resolved'}`}>{liveSlaBreaches}</span>
                        <span className="text-[8px] font-bold uppercase tracking-widest text-dust">SLA Breached</span>
                      </div>
                      <div className="p-3 text-center flex flex-col gap-0.5">
                        <span className={`text-lg font-mono font-bold ${criticalIssues > 0 ? 'text-[#B03A2E]' : 'text-charcoal'}`}>{criticalIssues}</span>
                        <span className="text-[8px] font-bold uppercase tracking-widest text-dust">Critical Open</span>
                      </div>
                      <div className="p-3 text-center flex flex-col gap-0.5">
                        <span className="text-lg font-mono font-bold text-charcoal">{liveResolutionRate}%</span>
                        <span className="text-[8px] font-bold uppercase tracking-widest text-dust">Resolution Rate</span>
                      </div>
                      <div className="p-3 text-center flex flex-col gap-0.5">
                        <span className="text-lg font-mono font-bold text-charcoal">{totalOpen}</span>
                        <span className="text-[8px] font-bold uppercase tracking-widest text-dust">Open Issues</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 -mt-2">
                      <span className="inline-flex items-center gap-1 text-[8px] font-bold text-resolved bg-[#EAF1EC] border border-[#A8C5AF] px-2 py-0.5 uppercase tracking-wider select-none">
                        <span className="w-1.5 h-1.5 rounded-full bg-resolved inline-block animate-pulse" />
                        Live — updates with database
                      </span>
                      <span className="text-[8px] text-dust font-mono select-none">AI narrative is a snapshot from last generate</span>
                    </div>

                    {/* Alert Banner / Metrics block */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Alert status block */}
                      <div className={`p-4 border border-hairline flex flex-col justify-between ${
                        aiInsights.alertLevel === 'critical' ? 'bg-[#FDECEA] border-[#E07A73]' :
                        aiInsights.alertLevel === 'elevated' ? 'bg-[#FEF3E2] border-[#C8873A]' :
                        'bg-[#EAF1EC] border-[#A8C5AF]'
                      }`}>
                        <div>
                          <span className="text-[8px] font-bold uppercase tracking-widest text-dust">Alert Level</span>
                          <span className={`block font-bold text-sm uppercase mt-0.5 ${
                            aiInsights.alertLevel === 'critical' ? 'text-[#B03A2E]' :
                            aiInsights.alertLevel === 'elevated' ? 'text-[#A06828]' :
                            'text-[#3D6B4F]'
                          }`}>
                            {aiInsights.alertLevel}
                          </span>
                        </div>
                        <p className="text-[10px] text-[#4A4A4C] mt-2 leading-relaxed">{aiInsights.alertReason}</p>
                      </div>

                      {/* Key Metric Highlight */}
                      <div className="p-4 bg-[#FAFAF8] border border-[#D8D3CE] flex flex-col justify-between">
                        <div>
                          <span className="text-[8px] font-bold uppercase tracking-widest text-dust">Critical KPI</span>
                          <span className="block font-bold text-xs text-charcoal mt-1 font-mono uppercase tracking-wide leading-tight">
                            {aiInsights.keyMetric}
                          </span>
                        </div>
                        <span className="text-[9px] text-[#9A9A9C] font-mono mt-2">URGENT ACTION RECOMMENDED</span>
                      </div>

                      {/* Top Risk Dept */}
                      <div className="p-4 bg-[#FAFAF8] border border-[#D8D3CE] flex flex-col justify-between">
                        <div>
                          <span className="text-[8px] font-bold uppercase tracking-widest text-dust">Highest Risk Dept</span>
                          <span className="block font-bold text-xs text-[#B03A2E] mt-1 uppercase tracking-wide">
                            {aiInsights.topRiskDepartment}
                          </span>
                        </div>
                        <p className="text-[9px] text-dust font-mono mt-2">SLA / RESOLUTION RATIO ANOMALY</p>
                      </div>
                    </div>

                    {/* Summary Narrative */}
                    <div className="p-4.5 bg-[#FAFAF8] border-l-[3px] border-l-[#9C6EDB] border-y border-r border-[#D8D3CE]">
                      <span className="text-[9px] font-bold text-[#9C6EDB] uppercase tracking-widest block mb-1">Executive Summary</span>
                      <p className="text-xs text-[#4A4A4C] leading-relaxed font-sans font-medium">{aiInsights.summary}</p>
                    </div>

                    {/* Recommendations List */}
                    <div className="space-y-2.5">
                      <span className="text-[9px] font-bold text-dust uppercase tracking-widest block">Recommended Action Matrix</span>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {(aiInsights.recommendations || []).map((rec: string, idx: number) => (
                          <div key={idx} className="p-4 bg-[#FAFAF8] border border-[#D8D3CE] flex gap-3 text-left">
                            <span className="w-5 h-5 rounded-full bg-[#F5E6D3] text-[#A06828] font-bold font-mono text-[10px] flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <p className="text-xs text-[#4A4A4C] leading-relaxed font-sans">{rec}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Predicted Escalation */}
                    <div className="p-4 bg-[#FAFAF8] border-l-[3px] border-l-[#B03A2E] border-y border-r border-[#D8D3CE] flex gap-3 items-center">
                      <ShieldAlert className="w-4 h-4 text-[#B03A2E] shrink-0" />
                      <div>
                        <span className="text-[9px] font-bold text-[#B03A2E] uppercase tracking-widest block">48h Predictive Risk Projection</span>
                        <p className="text-xs text-[#4A4A4C] mt-0.5 leading-relaxed font-sans">{aiInsights.predictedEscalation}</p>
                      </div>
                    </div>

                    {/* Control Buttons */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        onClick={handleGenerateInsights}
                        disabled={isGeneratingInsights}
                        className="px-4 py-2 bg-transparent hover:bg-stone/20 text-charcoal border border-charcoal text-xs font-bold uppercase tracking-wider transition-all select-none flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingInsights ? 'animate-spin' : ''}`} />
                        <span>Regenerate Analysis</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Anomaly Predictive alert card */}
              <div className="bg-[#FAFAF8] border-l-[3px] border-l-[#C8873A] border-y border-r border-[#D8D3CE] p-4.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-left shadow-none rounded-none animate-fade-in">
                <div>
                  <span className="text-[10px] font-semibold font-sans text-[#A06828] tracking-widest uppercase block mb-1">PREDICTIVE ANOMALY DETECTED</span>
                  <h4 className="text-sm font-semibold font-sans text-[#1C1C1E]">Water Leakage Spike — Sector W-07</h4>
                  <p className="text-[13px] font-sans text-[#4A4A4C] mt-1 leading-relaxed">Water leak reports are 2.5x above standard 4-week baseline. Pipeline grid pressure warnings detected.</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className="text-[10px] bg-[#F5E6D3] text-[#A06828] border border-[#C8873A] px-3 py-1.5 rounded-chip font-bold uppercase tracking-wider select-none whitespace-nowrap">
                    Vertex AI Flagged
                  </span>
                  <span className="text-[9px] flex items-center gap-1 text-[#9A9A9C] font-mono select-none">
                    <Sparkles className="w-3 h-3 text-[#9C6EDB]" />Gemini 2.0 Flash
                  </span>
                </div>
              </div>

              {/* ═══ Live Agent Network Feed ═══ */}
              <div className="bg-[#0E0E10] border border-[#2A2A2E] rounded-none overflow-hidden">
                {/* Header */}
                <div className="px-4 py-3 border-b border-[#2A2A2E] flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <Activity className="w-4 h-4 text-[#C8873A] shrink-0" />
                    <span className="text-[11px] font-bold text-white uppercase tracking-widest select-none whitespace-nowrap">Live Agent Network Feed</span>
                    <span className="flex items-center gap-1 text-[8px] font-mono text-[#3D6B4F] bg-[#3D6B4F]/10 border border-[#3D6B4F]/30 px-2 py-0.5 rounded-full animate-pulse select-none shrink-0">● LIVE</span>
                  </div>
                  <span className="text-[9px] font-mono text-[#777] select-none">{allAgentLogs.length} events · 5-agent mesh</span>
                </div>

                {/* Event stream */}
                <div className="divide-y divide-[#1A1A1E] max-h-72 overflow-y-auto no-scrollbar">
                  {allAgentLogs.length === 0 ? (
                    <div className="p-8 text-center text-[#444] font-mono text-[10px]">[AWAITING AGENT EVENTS — SUBMIT A REPORT TO ACTIVATE]</div>
                  ) : allAgentLogs.map(log => {
                    const agentColors: Record<number, string> = { 1: '#9C6EDB', 2: '#3B9EDE', 3: '#3D6B4F', 4: '#C8873A', 5: '#B03A2E' };
                    const color = agentColors[log.agentNum] || '#9A9A9C';
                    return (
                      <div key={log.id} className="px-4 py-2.5 flex items-start gap-3 hover:bg-[#161618] transition-colors cursor-default">
                        <span className="w-1.5 h-1.5 rounded-full mt-2 shrink-0" style={{ backgroundColor: color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[9px] font-bold uppercase tracking-wider font-mono shrink-0" style={{ color }}>{log.agentName}</span>
                            {log.model && (
                              <span className="text-[8px] flex items-center gap-0.5 text-[#9C6EDB] font-mono">
                                <Sparkles className="w-2 h-2" />{log.model}
                              </span>
                            )}
                            <span className="text-[8px] text-[#444] font-mono ml-auto shrink-0">{formatLocalTime(log.timestamp)}</span>
                          </div>
                          <p className="text-[10px] text-[#888] mt-0.5 font-sans leading-relaxed truncate">{log.action}</p>
                          {log.issueId && <span className="text-[8px] font-mono text-[#444]">Issue #{log.issueId.slice(-6).toUpperCase()}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Agent legend footer */}
                <div className="px-4 py-2.5 border-t border-[#2A2A2E] flex items-center gap-4 text-[8px] font-mono text-[#444] select-none flex-wrap bg-[#111113]">
                  {[{n:1,l:'Vision Classifier',c:'#9C6EDB'},{n:2,l:'Geo-Context',c:'#3B9EDE'},{n:3,l:'Community Validation',c:'#3D6B4F'},{n:4,l:'Priority & Routing',c:'#C8873A'},{n:5,l:'Resolution Tracker',c:'#B03A2E'}].map(a => (
                    <span key={a.n} className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full inline-block" style={{backgroundColor:a.c}} />A{a.n}: {a.l}</span>
                  ))}
                </div>
              </div>

              {/* ── Department SLA Performance Chart ── */}
              {(() => {
                // Compute dept stats live from issues
                const deptMap: Record<string, { name: string; assigned: number; resolved: number; breached: number }> = {};
                (issues || []).forEach(i => {
                  const d = i.departmentId || 'Unassigned';
                  if (!deptMap[d]) deptMap[d] = { name: d, assigned: 0, resolved: 0, breached: 0 };
                  deptMap[d].assigned++;
                  if (i.status === 'resolved') deptMap[d].resolved++;
                  if (i.status !== 'resolved' && i.slaDeadline && new Date(i.slaDeadline).getTime() < Date.now()) deptMap[d].breached++;
                });
                const depts = Object.values(deptMap).sort((a, b) => b.assigned - a.assigned);
                if (!depts.length) return null;
                return (
                  <div className="bg-warm-white border border-hairline rounded-none shadow-none overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-hairline flex items-center justify-between bg-stone/20">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-amber" />
                        <span className="text-[11px] font-bold text-charcoal uppercase tracking-widest select-none">Department SLA Performance</span>
                      </div>
                      <div className="flex items-center gap-3 text-[8px] font-bold uppercase tracking-wider select-none">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-none bg-resolved inline-block" />Resolved</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-none bg-amber inline-block" />Open</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-none bg-critical inline-block" />Breached</span>
                      </div>
                    </div>
                    <div className="p-5 space-y-3">
                      {depts.map(dept => {
                        const resRate = dept.assigned > 0 ? Math.round((dept.resolved / dept.assigned) * 100) : 0;
                        const barColor = dept.breached > 0 ? '#B03A2E' : resRate >= 70 ? '#3D6B4F' : '#C8873A';
                        return (
                          <div key={dept.name} className="space-y-1">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="font-bold text-charcoal uppercase tracking-wide font-sans truncate max-w-[180px]">{dept.name}</span>
                              <div className="flex items-center gap-3 font-mono text-dust shrink-0 ml-4">
                                <span className="text-resolved font-bold">{dept.resolved} resolved</span>
                                {dept.breached > 0 && <span className="text-critical font-bold">{dept.breached} breached</span>}
                                <span>{resRate}%</span>
                              </div>
                            </div>
                            <div className="h-2 bg-stone rounded-none overflow-hidden">
                              <div
                                className="h-full rounded-none transition-all duration-500"
                                style={{ width: `${resRate}%`, backgroundColor: barColor }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="px-5 py-2.5 border-t border-hairline bg-stone/10 text-[8px] font-mono text-dust select-none">
                      LIVE — computed from {issues.length} issues · zero API cost
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-[380px]">
                {/* Visual Heatmap view */}
                <div className="lg:col-span-2 flex flex-col bg-warm-white border border-[#D8D3CE] p-5 rounded-none shadow-none">
                  <h3 className="text-xs font-semibold text-[#1C1C1E] mb-4 flex items-center gap-2 uppercase tracking-wider select-none font-sans">
                    <MapPin className="w-4 h-4 text-[#C8873A]" />
                    Ward Hotspot Heatmap Overlay
                  </h3>
                  <div className="flex-1 relative min-h-[320px] rounded-none overflow-hidden">
                    {renderMapContainer(dashboardMapRef, 'heatmap')}
                  </div>
                </div>

                {/* Hotspot list */}
                <div className="bg-warm-white border border-[#D8D3CE] p-5 flex flex-col justify-between text-left rounded-none shadow-none">
                  <div>
                    <h3 className="text-xs font-semibold text-[#1C1C1E] mb-4 flex items-center gap-2 uppercase tracking-wider font-sans">
                      <TrendingUp className="w-4 h-4 text-[#C8873A]" />
                      Model-Flagged Hotspots
                    </h3>
                    <div className="space-y-3.5">
                      {alerts.map((alert) => (
                        <div
                          key={alert.id}
                          className="bg-[#FAFAF8] border-l-[3px] border-l-[#C8873A] border-y border-r border-[#D8D3CE] p-3 flex flex-col text-left transition-colors hover:bg-stone/20"
                        >
                          <span className="text-[9px] font-semibold font-sans text-[#A06828] tracking-widest uppercase block mb-0.5">PREDICTIVE ALERT — {alert.zone}</span>
                          <h4 className="text-xs font-semibold font-sans text-[#1C1C1E]">{alert.title}</h4>
                          <p className="text-[11px] font-sans text-[#4A4A4C] mt-1 leading-relaxed">{alert.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-hairline pt-4 text-center select-none mt-4">
                    <span className="text-[9px] text-[#9A9A9C] font-bold uppercase tracking-wider font-mono">Predictive clustering model v1.4</span>
                  </div>
                </div>
              </div>

              {/* Data Table */}
              <div className="bg-warm-white border border-[#D8D3CE] overflow-hidden rounded-none shadow-none">
                <div className="p-4.5 border-b border-[#D8D3CE] bg-stone/20 flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
                  <h3 className="font-semibold text-[#1C1C1E] text-xs uppercase tracking-wider font-sans">Autonomous Department Dispatch Queue</h3>

                  {/* Filters selectors */}
                  <div className="flex items-center gap-3 text-[10px]">
                    <select
                      value={categoryFilter}
                      onChange={e => setCategoryFilter(e.target.value)}
                      className="px-2.5 py-1.5 bg-white border border-[#D8D3CE] rounded-none font-bold text-[#1C1C1E] focus:outline-none focus:border-[#C8873A] uppercase text-[10px] tracking-wider"
                    >
                      <option value="all">ALL CATEGORIES</option>
                      <option value="pothole">POTHOLE</option>
                      <option value="water_leak">WATER LEAK</option>
                      <option value="streetlight">STREETLIGHT</option>
                      <option value="waste">WASTE</option>
                    </select>

                    <select
                      value={statusFilter}
                      onChange={e => setStatusFilter(e.target.value)}
                      className="px-2.5 py-1.5 bg-white border border-[#D8D3CE] rounded-none font-bold text-[#1C1C1E] focus:outline-none focus:border-[#C8873A] uppercase text-[10px] tracking-wider"
                    >
                      <option value="all">ALL STATUSES</option>
                      <option value="reported">REPORTED</option>
                      <option value="verified">VERIFIED</option>
                      <option value="assigned">ASSIGNED</option>
                      <option value="in_progress">IN PROGRESS</option>
                      <option value="resolved">RESOLVED</option>
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left text-[#4A4A4C] divide-y divide-[#D8D3CE]">
                    <thead className="bg-[#F2EDE8] font-semibold uppercase tracking-wider text-[#9A9A9C] border-b border-[#D8D3CE]">
                      <tr>
                        <th className="p-4">Issue</th>
                        <th className="p-4 text-center">Severity</th>
                        <th className="p-4">Status</th>
                        <th className="p-4">SLA</th>
                        <th className="p-4">Dept.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D8D3CE] bg-white">
                      {(filteredIssues || []).map((issue) => {
                        if (!issue) return null;
                        const status = issue.status || 'reported';
                        const severity = typeof issue.severity === 'number' ? issue.severity : 1;
                        const category = issue.category || 'other';
                        const id = issue.id || 'unknown';
                        const slaDeadline = issue.slaDeadline || new Date().toISOString();
                        const departmentId = issue.departmentId || 'Unassigned';

                        let statusColor = '#9A9A9C';
                        let statusText = 'Pending';
                        if (status === 'resolved') {
                          statusColor = '#3D6B4F'; // resolved green
                          statusText = 'Done';
                        } else if (status === 'in_progress' || status === 'assigned') {
                          statusColor = '#C8873A'; // amber
                          statusText = 'In Progress';
                        }

                        const isOverdue = status !== 'resolved' && !isNaN(new Date(slaDeadline).getTime()) && new Date(slaDeadline).getTime() < Date.now();
                        const slaColor = isOverdue ? '#B03A2E' : '#9A9A9C';

                        return (
                          <tr
                            key={id}
                            className="hover:bg-stone/20 cursor-pointer transition-colors"
                            onClick={() => setSelectedIssue(issue)}
                          >
                            <td className="p-4 font-mono font-bold text-[#1C1C1E]">
                              #{id.substring(Math.max(0, id.length - 6)).toUpperCase()}
                              <span className="block text-[10px] font-sans font-medium text-[#4A4A4C] capitalize mt-0.5">
                                {category.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="p-4 flex justify-center items-center">
                              <SeverityRing score={severity} size="sm" />
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
                                <span className="text-xs font-sans font-medium text-charcoal">{statusText}</span>
                              </div>
                            </td>
                            <td className="p-4">
                              <SLACountdown deadline={slaDeadline} status={status} size="sm" />
                            </td>
                            <td className="p-4 text-[#4A4A4C] font-medium">{departmentId}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ============================================================
                  Department Accountability Scorecard
                  Computed live from issues array
              ============================================================ */}
              {(() => {
                type DeptStat = { name: string; assigned: number; resolved: number; breached: number; totalResolutionMs: number };
                const deptMap: Record<string, DeptStat> = {};
                issues.forEach(issue => {
                  const dept = issue.departmentId || 'Unassigned';
                  if (dept === 'Pending Assignment') return;
                  if (!deptMap[dept]) deptMap[dept] = { name: dept, assigned: 0, resolved: 0, breached: 0, totalResolutionMs: 0 };
                  deptMap[dept].assigned++;
                  if (issue.status === 'resolved') {
                    deptMap[dept].resolved++;
                    if (issue.resolvedAt && issue.createdAt) {
                      deptMap[dept].totalResolutionMs += new Date(issue.resolvedAt).getTime() - new Date(issue.createdAt).getTime();
                    }
                  }
                  if (issue.status !== 'resolved' && issue.slaDeadline && new Date(issue.slaDeadline).getTime() < Date.now()) {
                    deptMap[dept].breached++;
                  }
                });
                const depts = Object.values(deptMap).sort((a, b) => b.assigned - a.assigned);
                if (!depts.length) return null;

                return (
                  <div className="bg-warm-white border border-[#D8D3CE] rounded-none shadow-none overflow-hidden">
                    {/* Header */}
                    <div className="p-4 border-b border-[#D8D3CE] bg-stone/20 flex items-center justify-between">
                      <h3 className="font-bold text-charcoal text-xs uppercase tracking-wider flex items-center gap-2 select-none">
                        <ShieldCheck className="w-4 h-4 text-[#C8873A]" />
                        Department Accountability Scorecard
                      </h3>
                      <span className="text-[9px] font-mono text-dust uppercase tracking-wider select-none">Live · Auto-computed</span>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left divide-y divide-[#D8D3CE]">
                        <thead className="bg-[#F2EDE8] text-[#9A9A9C] text-[9px] font-bold uppercase tracking-wider">
                          <tr>
                            <th className="p-3.5">Department</th>
                            <th className="p-3.5 text-center">Assigned</th>
                            <th className="p-3.5 text-center">Resolved</th>
                            <th className="p-3.5 text-center">Resolution Rate</th>
                            <th className="p-3.5 text-center">Avg. Time</th>
                            <th className="p-3.5 text-center">SLA Breaches</th>
                            <th className="p-3.5 text-center">Performance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#D8D3CE] bg-white">
                          {depts.map(dept => {
                            const rate = dept.assigned > 0 ? (dept.resolved / dept.assigned) * 100 : 0;
                            const avgDaysNum = dept.resolved > 0 ? dept.totalResolutionMs / dept.resolved / (1000 * 60 * 60 * 24) : 7;
                            const avgDaysStr = dept.resolved > 0 ? `${avgDaysNum.toFixed(1)}d` : '—';
                            const breachRate = dept.assigned > 0 ? (dept.breached / dept.assigned) * 100 : 0;
                            // Score: starts at 100, penalises breaches and long resolution times, rewards resolution rate
                            const score = Math.max(0, Math.min(100, Math.round(100 - (breachRate * 1.5) - (avgDaysNum * 4) + (rate * 0.4))));

                            let badge = { label: 'EXCELLENT', bg: 'bg-[#EAF1EC]', text: 'text-[#3D6B4F]', border: 'border-[#A8C5AF]' };
                            if (score < 40) badge = { label: 'FAILING', bg: 'bg-[#FDECEA]', text: 'text-[#B03A2E]', border: 'border-[#E07A73]' };
                            else if (score < 70) badge = { label: 'AT RISK', bg: 'bg-[#FEF3E2]', text: 'text-[#A06828]', border: 'border-[#C8873A]' };

                            return (
                              <tr key={dept.name} className="hover:bg-stone/10 transition-colors">
                                <td className="p-3.5 font-semibold text-charcoal" style={{ maxWidth: 180 }}>
                                  <span className="block truncate text-[11px]">{dept.name}</span>
                                </td>
                                <td className="p-3.5 text-center font-mono font-bold text-charcoal">{dept.assigned}</td>
                                <td className="p-3.5 text-center font-mono font-bold text-[#3D6B4F]">{dept.resolved}</td>
                                <td className="p-3.5 text-center">
                                  <div className="flex items-center gap-2 justify-center">
                                    <div className="w-16 h-1.5 bg-[#D8D3CE] rounded-none overflow-hidden">
                                      <div
                                        className="h-full bg-[#3D6B4F] transition-all duration-700"
                                        style={{ width: `${rate}%` }}
                                      />
                                    </div>
                                    <span className="font-mono font-bold text-charcoal text-[10px] w-8">{rate.toFixed(0)}%</span>
                                  </div>
                                </td>
                                <td className="p-3.5 text-center font-mono text-charcoal">{avgDaysStr}</td>
                                <td className="p-3.5 text-center">
                                  {dept.breached > 0 ? (
                                    <span className="inline-flex items-center gap-1 text-[#B03A2E] font-bold font-mono">
                                      <AlertTriangle className="w-3 h-3" />{dept.breached}
                                    </span>
                                  ) : (
                                    <span className="text-[#3D6B4F] font-bold font-mono">0 ✓</span>
                                  )}
                                </td>
                                <td className="p-3.5 text-center">
                                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 border text-[9px] font-bold uppercase tracking-wide rounded-none select-none ${badge.bg} ${badge.text} ${badge.border}`}>
                                    {badge.label}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Legend */}
                    <div className="p-3 border-t border-[#D8D3CE] bg-stone/10 flex flex-wrap items-center gap-4 text-[9px] font-mono text-dust select-none">
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-[#EAF1EC] border border-[#A8C5AF] inline-block" />EXCELLENT: Score ≥ 70</span>
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-[#FEF3E2] border border-[#C8873A] inline-block" />AT RISK: 40–69</span>
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-[#FDECEA] border border-[#E07A73] inline-block" />FAILING: &lt; 40</span>
                      <span className="ml-auto">Score = f(resolution rate, avg time, SLA breaches)</span>
                    </div>
                  </div>
                );
              })()}

            </div>
          )}


          {/* TAB 4: Profile & Leaderboard */}
          {activeTab === 'profile' && (() => {
              const sortedUsers = [...(users || [])].sort((a, b) => (b.points || 0) - (a.points || 0));
              const currentUserRankIndex = currentUser ? sortedUsers.findIndex(u => u.id === currentUser.id) : -1;
              const currentUserRank = currentUserRankIndex !== -1 ? currentUserRankIndex + 1 : 1;
              const rankDetails = currentUser ? getRankDetails(currentUser.points, currentUser.role) : null;

              return (
                <div className="flex-1 flex flex-col lg:flex-row gap-6 text-left">

                  {/* Profile Card (styled flat premium) */}
                  {currentUser && (
                    <div className="w-full lg:w-[360px] bg-warm-white rounded-none border border-hairline shadow-none p-6 shrink-0 flex flex-col justify-between text-left">
                      <div>
                        <div className="flex items-center gap-4">
                          <div className="relative">
                            {renderUserAvatar(currentUser, "w-16 h-16 text-sm")}
                            <span className="absolute -bottom-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-charcoal text-[10px] font-mono font-bold text-white border border-white select-none">
                              #{currentUserRank}
                            </span>
                          </div>
                          <div>
                            <h3 className="font-bold text-charcoal text-base font-sans">{currentUser.displayName || 'Anonymous'}</h3>
                            <p className="text-[10px] text-[#A06828] font-bold uppercase tracking-wider mt-0.5">
                              {rankDetails?.levelName || 'CITIZEN NODE LEVEL 1'}
                            </p>
                          </div>
                        </div>

                    <div className="grid grid-cols-3 gap-3 my-6 text-center border-y border-hairline py-4 bg-stone/20 rounded-none select-none">
                      <div>
                        <h4 className="font-bold text-charcoal text-sm">{currentUser.reportsCount || 0}</h4>
                        <p className="text-[9px] text-dust font-bold uppercase mt-0.5">Reports</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-[#3D6B4F] text-sm">{currentUser.verifiedCount || 0}</h4>
                        <p className="text-[9px] text-dust font-bold uppercase mt-0.5">Verified</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-charcoal text-sm">{currentUser.resolvedCount || 0}</h4>
                        <p className="text-[9px] text-dust font-bold uppercase mt-0.5">Resolved</p>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-dust mb-3 select-none">Earned Badges</h4>
                      <div className="flex flex-wrap gap-2">
                        {(currentUser.badges || []).map((badge, idx) => (
                          <span
                            key={idx}
                            className="bg-[#F5E6D3] text-[#A06828] border border-[#C8873A] text-[9px] font-bold px-3 py-1 rounded-chip flex items-center gap-1.5 select-none uppercase tracking-wide"
                          >
                            <Award className="w-3.5 h-3.5 text-[#C8873A]" />
                            {badge.toUpperCase()}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Role badge + demo toggle */}
                  <div className="mt-4 border border-hairline p-3 bg-stone/20 rounded-none flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {currentUser.role === 'admin' ? (
                        <ShieldCheck className="w-4.5 h-4.5 text-[#C8873A]" />
                      ) : currentUser.role === 'worker' ? (
                        <Activity className="w-4.5 h-4.5 text-blue-600 animate-pulse" />
                      ) : (
                        <UserCheck className="w-4.5 h-4.5 text-dust" />
                      )}
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-wider text-dust">Current Role</p>
                        <p className={`text-xs font-bold capitalize ${
                          currentUser.role === 'admin' ? 'text-[#C8873A]' : currentUser.role === 'worker' ? 'text-blue-600' : 'text-charcoal'
                        }`}>
                          {currentUser.role === 'worker' ? 'Field Operator' : currentUser.role}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        let newRole: 'citizen' | 'worker' | 'admin' = 'citizen';
                        if (currentUser.role === 'citizen') newRole = 'worker';
                        else if (currentUser.role === 'worker') newRole = 'admin';
                        else newRole = 'citizen';

                        db.updateUserProfile(currentUser.id, { role: newRole });
                        if (newRole === 'citizen' && ((activeTab as string) === 'dashboard' || (activeTab as string) === 'worker')) {
                          setActiveTab('map');
                        } else if (newRole === 'worker') {
                          setActiveTab('worker' as any);
                        }
                      }}
                      className="text-[9px] font-bold uppercase tracking-wider px-3 py-1.5 border border-hairline bg-warm-white hover:bg-stone/40 text-charcoal rounded-none transition-colors select-none"
                    >
                      Cycle Role
                    </button>
                  </div>

                  <div className="mt-4 border-t border-hairline pt-4 flex justify-between items-center">
                    <div>
                      <p className="text-[9px] text-dust font-bold uppercase tracking-wider select-none">Total XP Points</p>
                      <p className="text-lg font-bold text-[#C8873A] flex items-center gap-1 mt-1 font-mono">
                        <Award className="w-5 h-5" />
                        {currentUser.points || 0} Pts
                      </p>
                    </div>
                    <span className="text-[9px] bg-stone border border-hairline text-charcoal px-3 py-1.5 font-bold select-none uppercase tracking-wide rounded-none">
                      {rankDetails?.nextRankText}
                    </span>
                  </div>
                </div>
              )}

              {/* Leaderboard (styled flat premium) */}
              <div className="flex-1 bg-warm-white rounded-none border border-hairline shadow-none p-6">
                <h3 className="font-bold text-charcoal text-xs mb-4 flex items-center gap-2 uppercase tracking-wider select-none">
                  <Award className="w-5 h-5 text-[#C8873A]" />
                  Ward 7 Node Rankings
                </h3>

                <div className="divide-y divide-hairline">
                  {sortedUsers.map((u, index) => {
                    if (!u) return null;
                    const displayName = u.displayName || 'Anonymous';
                    const points = u.points || 0;
                    const reportsCount = u.reportsCount || 0;
                    const verifiedCount = u.verifiedCount || 0;
                    const badges = u.badges || [];

                    return (
                      <div key={u.id} className="py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3.5">
                          <span className={`w-6 text-center font-bold text-sm font-mono select-none ${index === 0 ? 'text-[#C8873A]' : index === 1 ? 'text-dust' : 'text-charcoal'}`}>
                            #{index + 1}
                          </span>

                          {renderUserAvatar(u, "w-9 h-9 text-[11px]")}

                          <div>
                            <p className="text-xs font-bold text-charcoal">{displayName}</p>
                            <p className="text-[10px] text-dust font-medium mt-0.5">
                              {reportsCount} reported • {verifiedCount} verified
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-bold font-mono text-charcoal">{points} XP</span>
                          <div className="flex gap-1 mt-1 justify-end select-none">
                            {badges.slice(0, 1).map((b, bIdx) => (
                              <span key={bIdx} className="text-[8px] bg-stone text-charcoal border border-hairline px-1.5 py-0.5 rounded-chip uppercase font-semibold">
                                {b}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
              );
            })()}

        </main>

        {/* Sliding Side Drawer for Incident Details Overlay (slide-over layout fixes UX bugs) */}
        {selectedIssue && (
          <>
            {/* Mobile-only backdrop overlay */}
            <div
              onClick={() => setSelectedIssue(null)}
              className="block md:hidden absolute inset-0 bg-charcoal/20 backdrop-blur-xs z-30 animate-fade-in"
            />

            {/* Slide drawer container (non-blocking on desktop) */}
            <div
              ref={drawerRef}
              className="absolute top-0 right-0 h-full w-full md:w-[440px] bg-warm-white z-30 border-l border-hairline flex flex-col text-left animate-slide-in shadow-none rounded-none"
            >

              {/* Details header */}
              <div className="p-4 border-b border-hairline flex justify-between items-center bg-stone">
                <div>
                  <h3 className="font-bold text-charcoal text-xs uppercase tracking-wider flex items-center gap-2">
                    Incident Dossier
                    <span className="text-[9px] font-mono text-[#C8873A] bg-[#F5E6D3] px-2 py-0.5 border border-[#C8873A]">
                      ID-{selectedIssue.id.substr(-6).toUpperCase()}
                    </span>
                  </h3>
                  <p className="text-[9px] text-[#9A9A9C] mt-0.5 font-medium uppercase">AUDIT TRAIL & STATUS</p>
                </div>

                <button
                  onClick={() => setSelectedIssue(null)}
                  className="p-2 hover:bg-stone/55 border border-hairline bg-warm-white transition-colors rounded-none shadow-none"
                >
                  <X className="w-4 h-4 text-charcoal" />
                </button>
              </div>

              {/* Details body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">

                {/* Image panel */}
                <div className="relative h-48 bg-stone border border-hairline overflow-hidden rounded-none shadow-none">
                  <img src={selectedIssue.photoUrl} alt="issue" referrerPolicy="no-referrer" className="w-full h-full object-cover" />

                  <span className="absolute top-3.5 left-3.5 bg-[#FAFAF8] text-charcoal text-[9px] font-bold uppercase tracking-wider px-3 py-1 border border-hairline rounded-none shadow-none">
                    {selectedIssue.category.replace('_', ' ')}
                  </span>

                  <div className="absolute top-3.5 right-3.5 bg-[#FAFAF8] border border-[#D8D3CE] p-1.5 rounded-none shadow-none">
                    <SeverityRing score={selectedIssue.severity} size="md" />
                  </div>
                </div>

                {/* Status stepper timeline */}
                <StatusStepper
                  status={selectedIssue.status}
                  updates={selectedIssueUpdates}
                  createdAt={selectedIssue.createdAt}
                  resolvedAt={selectedIssue.resolvedAt}
                />

                {/* Details Table */}
                <div className="bg-[#FAFAF8] border border-hairline p-4 space-y-3 text-xs text-[#4A4A4C] rounded-none">
                  <div className="flex justify-between items-start">
                    <span className="font-bold text-[#9A9A9C] uppercase tracking-wider text-[9px]">Address:</span>
                    <span className="font-semibold text-[#1C1C1E] text-right max-w-[240px]">{selectedIssue.address || 'Unknown'}</span>
                  </div>

                  <div className="flex justify-between items-start border-t border-hairline pt-3">
                    <span className="font-bold text-[#9A9A9C] uppercase tracking-wider text-[9px]">Description:</span>
                    <span className="font-semibold text-[#1C1C1E] text-right max-w-[240px]">{selectedIssue.description || ''}</span>
                  </div>

                  <div className="flex justify-between items-center border-t border-hairline pt-3">
                    <span className="font-bold text-[#9A9A9C] uppercase tracking-wider text-[9px]">Routing Department:</span>
                    <span className="font-bold text-[#C8873A]">{selectedIssue.departmentId || 'AWAITING VERIFY'}</span>
                  </div>

                  {selectedIssue.status !== 'resolved' && (
                    <div className="flex justify-between items-center border-t border-hairline pt-3">
                      <span className="font-bold text-[#9A9A9C] uppercase tracking-wider text-[9px]">Priority Score:</span>
                      <span className="font-bold text-[#B03A2E] bg-red-50 border border-red-100 px-2 py-0.5 font-mono">
                        {selectedIssue.priorityScore ? selectedIssue.priorityScore.toFixed(1) : (selectedIssue.severity || 0).toFixed(1)} / 40.0
                      </span>
                    </div>
                  )}

                  {selectedIssue.status !== 'resolved' && (
                    <div className="flex justify-between items-center border-t border-hairline pt-3">
                      <span className="font-bold text-[#9A9A9C] uppercase tracking-wider text-[9px]">SLA Deadline:</span>
                      <span className="font-semibold text-[#1C1C1E]">{formatLocalDate(selectedIssue.slaDeadline)}</span>
                    </div>
                  )}

                  {selectedIssue.status !== 'resolved' && selectedIssue.slaDeadline && (
                    <SLACountdown deadline={selectedIssue.slaDeadline} status={selectedIssue.status} size="md" />
                  )}

                  {selectedIssue.status === 'resolved' && selectedIssue.resolvedAt && (
                    <div className="flex justify-between items-center border-t border-hairline pt-3">
                      <span className="font-bold text-[#9A9A9C] uppercase tracking-wider text-[9px]">Resolved Date:</span>
                      <span className="font-bold text-[#3D6B4F] bg-green-50 px-2.5 py-0.5 border border-green-100">
                        {formatLocalDate(selectedIssue.resolvedAt)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Verification upvote control */}
                <div className="bg-[#F5E6D3] border border-[#C8873A] p-4 flex justify-between items-center rounded-none shadow-none">
                  <div>
                    <h5 className="font-bold text-[#A06828] text-xs uppercase tracking-wider">Community Verification</h5>
                    <p className="text-[10px] text-[#4A4A4C] mt-1">
                      Confirmed by {selectedIssue.confirmations || 0} citizen{selectedIssue.confirmations !== 1 ? 's' : ''}.
                    </p>
                  </div>

                  {currentUser && (selectedIssue.confirmedBy || []).includes(currentUser.id) ? (
                    <span className="text-[9px] bg-white text-[#A06828] border border-[#C8873A] px-3 py-1.5 font-bold flex items-center gap-1 uppercase tracking-wider select-none">
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Confirmed by You</span>
                    </span>
                  ) : selectedIssue.status !== 'resolved' ? (
                    <button
                      onClick={() => handleVerifyIssue(selectedIssue.id)}
                      className="flex items-center gap-1.5 bg-[#C8873A] hover:bg-[#A06828] text-white font-bold px-4 py-2 border border-[#A06828] rounded-none text-[10px] transition-all uppercase tracking-wider"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span>Confirm Issue (+15 XP)</span>
                    </button>
                  ) : (
                    <span className="text-[9px] bg-white text-[#A06828] border border-[#C8873A] px-3 py-1.5 font-bold flex items-center gap-1 uppercase tracking-wider select-none">
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Resolved</span>
                    </span>
                  )}
                </div>

                {/* Audit Logs stream */}
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#9A9A9C] mb-3 select-none">Handoff & Audit Logs</h4>
                  <div className="space-y-3 max-h-52 overflow-y-auto no-scrollbar pr-1.5 divide-y divide-[#D8D3CE]">
                    {(selectedIssueUpdates || []).map((log) => {
                      if (!log) return null;
                      const updatedBy = log.updatedBy || 'System';
                      const timestamp = log.timestamp || new Date().toISOString();
                      const message = log.message || '';
                      const id = log.id || Math.random().toString();
                      return (
                        <div key={id} className="pt-3 first:pt-0 flex items-start gap-2.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#C8873A] mt-2 shrink-0"></span>
                          <div className="flex-1 text-left">
                            <div className="flex justify-between items-center">
                              <span className="text-[8px] font-bold text-[#9A9A9C] uppercase tracking-widest">{updatedBy}</span>
                              <span className="text-[8px] text-[#9A9A9C]">{formatLocalTime(timestamp)}</span>
                            </div>
                            <p className="text-[11px] font-medium text-charcoal mt-1">{message}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Immersive centered Report Wizard Overlay */}
        {isReportOpen && (
          <div
            onClick={handleReportOverlayClick}
            className="absolute inset-0 bg-charcoal/20 backdrop-blur-xs z-30 flex justify-center items-start overflow-y-auto p-4 md:py-8 animate-fade-in animate-in duration-200"
          >
            <div className="w-full max-w-lg bg-warm-white rounded-none shadow-none flex flex-col overflow-hidden max-h-[90vh] text-left border border-hairline animate-in zoom-in-95 duration-200">

              {/* Wizard Header */}
              <div className="p-4 border-b border-hairline flex justify-between items-center bg-stone/20">
                <div>
                  <h3 className="font-bold text-charcoal text-xs uppercase tracking-wider font-sans">File Incident Dossier</h3>
                  <p className="text-[9px] text-dust font-medium uppercase mt-0.5">3-Step Ingestion Wizard</p>
                </div>

                {!isPipelineRunning && (
                  <button
                    onClick={closeReportWizard}
                    className="p-2 hover:bg-stone/20 rounded-none transition-colors border border-hairline bg-warm-white"
                  >
                    <X className="w-4 h-4 text-charcoal" />
                  </button>
                )}
              </div>

              {/* Wizard Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">

                {/* Steps tracker */}
                {!isPipelineRunning && (
                  <div className="flex justify-between items-center pb-4 border-b border-hairline text-[10px] font-bold select-none">
                    {[
                      { step: 1, label: 'Intake' },
                      { step: 2, label: 'AI Review' },
                      { step: 3, label: 'Location' }
                    ].map((s) => (
                      <div key={s.step} className="flex items-center gap-2">
                        <span className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${reportStep === s.step ? 'bg-charcoal text-white' :
                            reportStep > s.step ? 'bg-stone text-charcoal border border-hairline' : 'bg-stone/30 text-dust border border-hairline/50'
                          }`}>
                          {reportStep > s.step ? <Check className="w-3.5 h-3.5" /> : s.step}
                        </span>
                        <span className={`uppercase tracking-wider ${reportStep === s.step ? 'text-charcoal' : 'text-dust'}`}>{s.label}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pipeline logs overlay during execution */}
                {isPipelineRunning ? (
                  <div className="space-y-6 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-8 h-8 text-amber animate-spin" />
                      <h4 className="font-bold text-charcoal text-xs uppercase tracking-widest select-none font-sans">Executing Agent Pipeline</h4>
                      <p className="text-[10px] text-dust font-mono uppercase tracking-wider select-none font-sans">Autonomous Multi-Agent Ingestion Active</p>
                    </div>

                    {/* Progress timeline log tracker */}
                    <div className="bg-stone/20 rounded-none p-5 text-left border border-hairline space-y-4">
                      {pipelineSteps.map((step, idx) => (
                        <div key={idx} className="flex items-start gap-3 pb-3 border-b border-hairline last:border-b-0 last:pb-0">
                          <div className="mt-0.5 shrink-0">
                            {step.status === 'success' || step.status === 'merged' ? (
                              <CheckCircle className="w-4 h-4 text-resolved animate-fade-in" />
                            ) : step.status === 'running' ? (
                              <Loader2 className="w-4 h-4 text-amber animate-spin" />
                            ) : step.status === 'failed' ? (
                              <AlertTriangle className="w-4 h-4 text-critical animate-fade-in" />
                            ) : (
                              <div className="w-4 h-4 rounded-full border-2 border-hairline" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-charcoal text-[11px] font-sans">{step.agentName}</span>
                              <span className={`px-2 py-0.5 rounded-chip text-[8px] font-bold uppercase border ${step.status === 'success' ? 'bg-stone text-resolved border-hairline' :
                                  step.status === 'merged' ? 'bg-amber-light text-amber-dark border-amber-light' :
                                    step.status === 'running' ? 'bg-stone text-charcoal border-hairline animate-pulse' :
                                      step.status === 'failed' ? 'bg-[#FADBD8] text-[#78281F] border-[#FDEDEC]' : 'bg-stone/30 text-dust border-hairline/50'
                                }`}>
                                {step.status}
                              </span>
                            </div>

                            {(step.status === 'running' || step.status === 'success' || step.status === 'merged') && (
                              <div className="mt-1.5 space-y-1 font-mono text-[9px] text-[#4A4A4C] bg-warm-white p-2.5 rounded-none border border-hairline">
                                {step.logs.map((log, lIdx) => (
                                  <p key={lIdx} className="leading-relaxed">
                                    &gt; {log}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {pipelineResult && (
                      <button
                        onClick={closePipelineModal}
                        className="w-full flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-xs border border-blue-700 transition-all hover:scale-[1.01] active:scale-95 shadow-md font-mono uppercase tracking-wider"
                      >
                        <span>View Registered Incident</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Step 1: Camera / Preset selection */}
                    {reportStep === 1 && (
                      <div className="space-y-6">
                        {/* File upload dragbox */}
                        <div className="border-2 border-dashed border-hairline hover:border-charcoal rounded-none p-6 text-center cursor-pointer transition-colors relative bg-stone/20">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                          />
                          <Upload className="w-7 h-7 text-charcoal mx-auto mb-2" />
                          <h4 className="font-bold text-charcoal text-xs uppercase tracking-wider font-sans">Ingest Photograph</h4>
                          <p className="text-[9px] text-dust mt-1 uppercase font-semibold">DRAG FILE OR CLICK TO ACCESS CAPTURE UNIT</p>
                        </div>

                        {/* Presets Grid */}
                        <div>
                          <h5 className="text-[9px] font-bold uppercase tracking-wider text-dust mb-3 select-none">Presets (For Hackathon Simulation)</h5>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {TEST_PRESETS.map((preset, idx) => (
                              <div
                                key={idx}
                                onClick={() => handleImageSelect(preset.url, preset)}
                                className="border border-hairline hover:border-charcoal rounded-chip overflow-hidden cursor-pointer transition-all flex flex-col text-left bg-warm-white"
                              >
                                <div className="h-24 bg-stone relative shrink-0">
                                  <img src={preset.url} alt={preset.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                                </div>
                                <div className="p-3 flex-1 flex flex-col justify-between">
                                  <span className="text-[8px] font-bold text-amber-dark uppercase tracking-wider">{preset.category.replace('_', ' ')}</span>
                                  <h4 className="text-xs font-bold text-charcoal mt-1 leading-snug font-sans">{preset.name}</h4>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Step 2: AI Classification Review */}
                    {reportStep === 2 && reportImage && (
                      <div className="space-y-4 text-center animate-in fade-in duration-200">
                        {/* Image Preview Behind */}
                        <div className="relative h-44 w-full bg-stone overflow-hidden border border-hairline rounded-none shadow-none">
                          <img src={reportImage} alt="report preview" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                        </div>

                        {/* Flat Card Body */}
                        <div className="bg-warm-white border border-hairline p-4.5 text-left space-y-4 text-xs font-semibold rounded-none shadow-none min-h-[280px]">
                          <div>
                            <span className="font-semibold text-[#A06828] text-[10px] tracking-widest uppercase block mb-2 font-sans">AI ANALYSIS</span>

                            {/* Category chips selector */}
                            <div className="flex gap-2 flex-wrap mt-1">
                              {['pothole', 'water_leak', 'streetlight', 'waste'].map((cat) => (
                                <button
                                  key={cat}
                                  type="button"
                                  onClick={() => setReportCategory(cat)}
                                  className={`px-3 py-1.5 text-xs font-sans font-medium uppercase tracking-wider border transition-all rounded-chip ${reportCategory === cat
                                      ? 'bg-charcoal text-white border-charcoal'
                                      : 'bg-white text-charcoal border-charcoal'
                                    }`}
                                  style={{ borderWidth: '0.8px' }}
                                >
                                  {cat.replace('_', ' ')}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Severity verification in a row */}
                          <div className="flex items-center gap-4 border-t border-hairline pt-3">
                            <SeverityRing score={reportSeverity} size="md" />
                            <div className="flex-1 text-left">
                              <span className="font-semibold text-[#A06828] text-[10px] tracking-wider uppercase block mb-1">Verify Severity Score</span>
                              <input
                                type="range"
                                min="1"
                                max="10"
                                value={reportSeverity}
                                onChange={e => setReportSeverity(Number(e.target.value))}
                                className="w-full accent-amber cursor-pointer h-1 bg-[#D8D3CE] appearance-none rounded-none outline-none"
                              />
                            </div>
                            <span className="font-mono font-bold text-lg text-charcoal w-6 text-right">{reportSeverity}</span>
                          </div>

                          {/* Description context bottom border only textarea */}
                          <div className="border-t border-hairline pt-3 text-left">
                            <span className="font-semibold text-[#A06828] text-[10px] tracking-wider uppercase block mb-1">Description context</span>
                            <textarea
                              value={reportDescription}
                              onChange={e => setReportDescription(e.target.value)}
                              className="w-full p-2 bg-transparent border-b border-[#D8D3CE] focus:outline-none focus:border-charcoal font-sans font-medium text-xs text-charcoal h-16 resize-none rounded-none border-t-0 border-x-0 outline-none"
                              placeholder="Describe the issue in your own words..."
                            />
                          </div>
                        </div>

                        <PrimaryButton
                          label="Looks Right → Confirm Location"
                          onClick={handleConfirmClassification}
                        />
                      </div>
                    )}

                    {/* Step 3: Location / Duplicate validation */}
                    {reportStep === 3 && (
                      <div className="space-y-6 animate-in fade-in duration-200">
                        {googleMapsLoaded && !googleMapsError && MAPS_API_KEY ? (
                          <div className="relative h-44 w-full bg-stone overflow-hidden border border-hairline rounded-none shadow-none">
                            <div ref={miniMapRef} className="w-full h-full" />
                            <div className="absolute top-2.5 right-2.5 bg-charcoal/90 text-white text-[9px] font-bold px-2 py-1 rounded-none shadow-none pointer-events-none select-none uppercase tracking-wide">
                              Drag Pin to Adjust
                            </div>
                          </div>
                        ) : (
                          <div className="bg-stone h-28 flex flex-col items-center justify-center border border-hairline text-dust select-none rounded-none">
                            <MapPin className="w-6 h-6 mb-1 text-dust" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Vector Coordinates Pinpoint</span>
                          </div>
                        )}

                        {/* Telemetry info box */}
                        <div className="bg-[#FAFAF8] p-4.5 border border-hairline rounded-none shadow-none space-y-3 text-xs text-charcoal font-semibold">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[#9A9A9C] uppercase tracking-wider text-[9px]">Category</span>
                            <span className="font-bold text-charcoal capitalize">{reportCategory ? reportCategory.replace('_', ' ') : 'other'}</span>
                          </div>

                          <div className="flex items-center justify-between border-t border-hairline pt-3">
                            <span className="font-bold text-[#9A9A9C] uppercase tracking-wider text-[9px]">Severity Tier</span>
                            <div className="flex items-center gap-2">
                              <SeverityRing score={reportSeverity} size="sm" />
                              <span className="font-bold text-charcoal font-mono">{reportSeverity}/10</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between border-t border-hairline pt-3">
                            <span className="font-bold text-[#9A9A9C] uppercase tracking-wider text-[9px]">Coordinates</span>
                            <span className="font-mono text-charcoal">
                              ({reportLocation ? reportLocation.lat.toFixed(6) : '0.000000'}, {reportLocation ? reportLocation.lng.toFixed(6) : '0.000000'})
                            </span>
                          </div>
                        </div>

                        {/* Duplicate Alert Banner */}
                        {isDuplicateDetected ? (
                          <div className="bg-[#F5E6D3] border border-[#C8873A] p-4 flex gap-3.5 text-left font-sans rounded-none shadow-none">
                            <AlertTriangle className="w-5 h-5 text-[#A06828] mt-0.5 shrink-0" />
                            <div>
                              <h4 className="font-bold text-[#A06828] text-xs uppercase tracking-wider">Duplicate Incident Alert</h4>
                              <p className="text-[13px] text-[#4A4A4C] mt-1 leading-relaxed">
                                Merging with a nearby report ({duplicateDistance}m away). Submitting will merge telemetry with the active issue to consolidate routing queues.
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-[#F2EDE8] border border-[#D8D3CE] p-4 flex gap-3.5 text-left font-sans rounded-none shadow-none">
                            <CheckCircle className="w-5 h-5 text-[#7A8C5E] mt-0.5 shrink-0" />
                            <div>
                              <h4 className="font-bold text-[#7A8C5E] text-xs uppercase tracking-wider">Coordinates Verified</h4>
                              <p className="text-[13px] text-[#4A4A4C] mt-1 leading-relaxed font-normal">
                                Area resolved. No conflicts identified within 200m boundaries. Commencing initial pipeline broadcast.
                              </p>
                            </div>
                          </div>
                        )}

                        <PrimaryButton
                          label={isDuplicateDetected ? 'Merge & Submit Report' : 'Submit Report'}
                          onClick={handleSubmitReport}
                        />
                      </div>
                    )}
                  </>
                )}

              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating AI Chat Assistant Widget */}
      <div className="select-none">
        {chatOpen && (
          <div className="fixed bottom-36 md:bottom-20 right-4 left-4 md:left-auto md:right-6 md:w-96 h-[340px] md:h-[460px] z-50 bg-warm-white border border-[#D8D3CE] flex flex-col overflow-hidden animate-slide-in shadow-none rounded-none text-left">
            {/* Chat Header */}
            <div className="bg-charcoal text-white p-3.5 flex items-center justify-between border-b border-dark-border shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#9C6EDB]" />
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider font-sans">City AI Assistant</h4>
                  <p className="text-[8px] font-mono text-dust uppercase tracking-widest mt-0.5">Gemini 2.0 Flash Connected</p>
                </div>
              </div>
              <button 
                onClick={() => setChatOpen(false)}
                className="p-1 hover:bg-white/10 text-dust hover:text-white transition-colors cursor-pointer"
                type="button"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar bg-stone/10 flex flex-col">
              {chatMessages.map((msg, idx) => {
                const isAI = msg.role === 'assistant';
                return (
                  <div 
                    key={idx} 
                    className={`flex flex-col max-w-[85%] ${isAI ? 'self-start mr-auto text-left' : 'self-end ml-auto text-right'}`}
                    style={{ alignSelf: isAI ? 'flex-start' : 'flex-end' }}
                  >
                    <span className="text-[8px] font-bold text-dust uppercase tracking-wider mb-1 px-1">
                      {isAI ? 'CivSight AI' : 'You'}
                    </span>
                    <div className={`p-3 text-xs leading-relaxed font-sans ${
                      isAI 
                        ? 'bg-warm-white text-charcoal border border-[#D8D3CE] rounded-none' 
                        : 'bg-[#F5E6D3] text-charcoal border border-[#C8873A] rounded-none'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                );
              })}
              {chatLoading && (
                <div className="flex flex-col max-w-[85%] self-start mr-auto text-left" style={{ alignSelf: 'flex-start' }}>
                  <span className="text-[8px] font-bold text-dust uppercase tracking-wider mb-1 px-1">CivSight AI</span>
                  <div className="p-3 bg-warm-white text-dust border border-[#D8D3CE] rounded-none flex items-center gap-2 text-xs font-mono select-none">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C8873A]" />
                    <span>Analyzing database metrics...</span>
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Chat Input form */}
            <form onSubmit={handleSendChatMessage} className="p-3 border-t border-[#D8D3CE] bg-[#FAFAF8] flex gap-2 shrink-0">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Ask about active alerts, SLAs, or workload..."
                className="flex-1 px-3 py-2 text-xs bg-white border border-[#D8D3CE] rounded-none focus:outline-none focus:border-charcoal text-charcoal font-medium"
                disabled={chatLoading}
              />
              <button
                type="submit"
                disabled={chatLoading || !chatInput.trim()}
                className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border rounded-none transition-all cursor-pointer ${
                  chatLoading || !chatInput.trim()
                    ? 'bg-[#D8D3CE] text-[#9A9A9C] border-transparent'
                    : 'bg-[#C8873A] hover:bg-[#A06828] text-white border-[#A06828]'
                }`}
              >
                Ask
              </button>
            </form>
          </div>
        )}

        {/* Floating Bubble Button */}
        <button
          onClick={() => setChatOpen(prev => !prev)}
          className={`fixed bottom-20 md:bottom-6 right-6 flex items-center justify-center w-12 h-12 rounded-full text-white shadow-none transition-all hover:scale-105 active:scale-95 cursor-pointer z-50 ${
            chatOpen ? 'bg-charcoal' : 'bg-[#9C6EDB] hover:bg-[#8552C4]'
          }`}
          title="Ask AI Intelligence Assistant"
        >
          {chatOpen ? (
            <X className="w-5 h-5 stroke-[2.5]" />
          ) : (
            <MessageSquare className="w-5 h-5 stroke-[2.5]" />
          )}
        </button>
      </div>

      {/* Mobile-Only Bottom Navigation Bar */}
      <nav className="flex md:hidden bg-warm-white border-t-[0.4px] border-[#D8D3CE] px-6 py-2.5 justify-around items-center shrink-0 z-10 text-[#9A9A9C] shadow-none rounded-none w-full">
        {[
          { id: 'map', label: 'Map', icon: MapPin },
          { id: 'reports', label: 'Reports', icon: List },
          ...(currentUser?.role === 'worker' ? [{ id: 'worker', label: 'Field Ops', icon: Activity }] : []),
          ...(currentUser?.role === 'admin' ? [{ id: 'dashboard', label: 'Dashboard', icon: TrendingUp }] : []),
          { id: 'profile', label: 'Profile', icon: User }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any);
                setSelectedIssue(null);
              }}
              className={`flex flex-col items-center gap-1 transition-all py-1.5 px-3 rounded-none ${isActive ? 'text-[#C8873A] font-semibold font-sans' : 'text-[#9A9A9C] hover:text-[#1C1C1E] font-sans'
                }`}
            >
              <Icon className="w-[18px] h-[18px]" style={{ color: isActive ? '#C8873A' : '#9A9A9C' }} />
              <span className="text-[11px] font-sans font-medium tracking-wide">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
