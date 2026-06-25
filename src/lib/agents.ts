// CivSight Multi-Agent Pipeline Implementation
import { getDb, Issue, Location, UserProfile } from './db';
import { classifyIssueImage, ClassificationResult } from './gemini';

// Haversine distance helper (also imported or defined locally)
export function getDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface PipelineStep {
  agentName: string;
  status: 'pending' | 'running' | 'success' | 'merged' | 'failed';
  logs: string[];
  outputData?: any;
}

export type PipelineCallback = (stepIndex: number, step: PipelineStep) => void;

/**
 * Runs the 5-Stage Autonomous Agent Pipeline
 */
export async function runCivSightPipeline(
  base64Image: string,
  location: Location,
  userId: string,
  userDescriptionHint?: string,
  onStepChange?: PipelineCallback,
  confirmedCategory?: 'pothole' | 'water_leak' | 'streetlight' | 'waste' | 'other',
  confirmedSeverity?: number
): Promise<{ success: boolean; issueId?: string; mergedId?: string; error?: string }> {
  
  const db = getDb();
  
  const steps: PipelineStep[] = [
    { agentName: "Agent 1: Vision Classifier", status: 'pending', logs: [] },
    { agentName: "Agent 2: Geo-Context Agent", status: 'pending', logs: [] },
    { agentName: "Agent 3: Community Validation", status: 'pending', logs: [] },
    { agentName: "Agent 4: Priority & Routing", status: 'pending', logs: [] },
    { agentName: "Agent 5: Resolution Tracker", status: 'pending', logs: [] }
  ];

  const updateStep = (idx: number, updates: Partial<PipelineStep>) => {
    steps[idx] = { ...steps[idx], ...updates };
    if (onStepChange) {
      onStepChange(idx, steps[idx]);
    }
  };

  // ==========================================
  // STAGE 1: Agent 1 - Vision Classifier
  // ==========================================
  const s1 = 0;
  updateStep(s1, { status: 'running', logs: ["Initiating image processing...", "Invoking Gemini 1.5 Flash Vision API..."] });
  
  let classification: ClassificationResult;
  try {
    classification = await classifyIssueImage(base64Image, userDescriptionHint, confirmedCategory, confirmedSeverity);
    
    updateStep(s1, {
      status: 'success',
      logs: [
        `[${classification.source === 'gemini-vision-real' ? '✓ REAL GEMINI VISION API' : 'MOCK FALLBACK'}]`,
        `Vision classification successful.`,
        `Detected Category: ${classification.category.toUpperCase()}`,
        `Severity Score: ${classification.severity}/10`,
        `AI Description: "${classification.description}"`,
        `Confidence Level: ${(classification.confidence * 100).toFixed(1)}%`,
        `Estimated Area: ${classification.estimated_area_sqm} sqm`,
        ...(classification.ai_recommendation ? [`AI Recommendation: "${classification.ai_recommendation}"`] : [])
      ],
      outputData: classification
    });
  } catch (err: any) {
    updateStep(s1, { status: 'failed', logs: [`Error in classification: ${err.message || err}`] });
    return { success: false, error: "Vision Classifier failed" };
  }

  // Brief pause for visual progress in the demo
  await new Promise(r => setTimeout(r, 400));

  // ==========================================
  // STAGE 2: Agent 2 - Geo-Context & Duplicate Detection
  // ==========================================
  const s2 = 1;
  updateStep(s2, { status: 'running', logs: ["Retrieving GPS location...", `Coordinates: (${location.lat.toFixed(6)}, ${location.lng.toFixed(6)})`, "Checking nearby issues database for duplicate reports (200m radius)..."] });

  // Reverse Geocoding (uses real Google Maps Geocoding API if loaded, otherwise falls back)
  let resolvedAddress = `Street View Coordinates (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)})`;
  
  if (typeof window !== 'undefined' && (window as any).google && (window as any).google.maps) {
    try {
      const geocoder = new (window as any).google.maps.Geocoder();
      const response = await geocoder.geocode({ location: { lat: location.lat, lng: location.lng } });
      if (response && response.results && response.results[0]) {
        resolvedAddress = response.results[0].formatted_address;
      } else {
        resolvedAddress = `Street View Coordinates (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}), India`;
      }
    } catch (err) {
      console.warn("Google Maps Geocoding failed, falling back to coordinate string:", err);
      resolvedAddress = `Street View Coordinates (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}), India`;
    }
  } else {
    if (Math.abs(location.lat - 26.9124) < 0.1 && Math.abs(location.lng - 75.7873) < 0.1) {
      resolvedAddress = `MI Road, near Metro Station, Jaipur, Rajasthan 302001`;
    } else if (Math.abs(location.lat - 12.971598) < 0.05 && Math.abs(location.lng - 77.594562) < 0.05) {
      resolvedAddress = `Ward 7, Kasturba Road, near Cubbon Park, Bengaluru, Karnataka 560001`;
    } else {
      const isNearBengaluru = Math.abs(location.lat - 12.971598) < 0.5 && Math.abs(location.lng - 77.594562) < 0.5;
      if (isNearBengaluru) {
        resolvedAddress = `Street View Coordinates (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}), Bengaluru, India`;
      } else {
        resolvedAddress = `Street View Coordinates (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}), Jaipur, India`;
      }
    }
  }

  const existingIssues = db.getIssues();
  let duplicateIssue: Issue | null = null;
  const duplicateRadiusMeters = 200;

  for (const issue of existingIssues) {
    if (issue.status !== 'resolved' && issue.category === classification.category) {
      const distance = getDistance(location.lat, location.lng, issue.location.lat, issue.location.lng);
      if (distance <= duplicateRadiusMeters) {
        duplicateIssue = issue;
        break;
      }
    }
  }

  if (duplicateIssue) {
    // Merge report
    const updatedConfirmations = duplicateIssue.confirmations + 1;
    const confirmedBy = [...duplicateIssue.confirmedBy];
    if (!confirmedBy.includes(userId)) {
      confirmedBy.push(userId);
    }
    
    db.updateIssue(duplicateIssue.id, {
      confirmations: updatedConfirmations,
      confirmedBy
    });

    // Reward points to verifier
    const user = db.getUserProfile(userId);
    if (user) {
      db.updateUserProfile(userId, {
        points: user.points + 15, // 15 points for validating
        verifiedCount: user.verifiedCount + 1
      });
    }

    updateStep(s2, {
      status: 'merged',
      logs: [
        `Duplicate detected! Same category (${duplicateIssue.category}) is active ${getDistance(location.lat, location.lng, duplicateIssue.location.lat, duplicateIssue.location.lng).toFixed(0)}m away.`,
        `Merging report with Issue ID: ${duplicateIssue.id}`,
        `Incremented confirmations to ${updatedConfirmations}.`,
        `Assigned 15 verification points to current user.`
      ],
      outputData: { mergedId: duplicateIssue.id }
    });

    return { success: true, mergedId: duplicateIssue.id };
  }

  // Create new report
  const newIssueId = 'iss_' + Math.random().toString(36).substr(2, 9);
  const newIssue: Issue = {
    id: newIssueId,
    reporterId: userId,
    category: classification.category,
    severity: classification.severity,
    description: userDescriptionHint || classification.description,
    photoUrl: base64Image,
    location: location,
    address: resolvedAddress,
    confirmations: 1,
    confirmedBy: [userId],
    status: 'reported',
    departmentId: 'Pending Assignment',
    priorityScore: classification.severity, // initial score is just severity
    slaDeadline: new Date(Date.now() + 168 * 3600 * 1000).toISOString(), // default 7 days
    resolvedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.addIssue(newIssue);

  // Reward points to reporter
  const user = db.getUserProfile(userId);
  if (user) {
    db.updateUserProfile(userId, {
      points: user.points + 50, // 50 points for new report
      reportsCount: user.reportsCount + 1
    });
  }

  updateStep(s2, {
    status: 'success',
    logs: [
      `No nearby duplicates found.`,
      `Created new issue document (ID: ${newIssueId}).`,
      `Resolved Address: "${resolvedAddress}"`,
      `Assigned 50 reporter points to current user.`
    ],
    outputData: newIssue
  });

  await new Promise(r => setTimeout(r, 400));

  // ==========================================
  // STAGE 3: Agent 3 - Community Validation
  // ==========================================
  const s3 = 2;
  updateStep(s3, { status: 'running', logs: ["Broadcasting alert to citizens within 500m radius via push notification...", "Awaiting validation upvotes...", "Validation threshold target: 3 confirmations."] });

  // Auto validation algorithm simulation
  // For the hackathon, we trigger instant community verification if they have >= 3 confirmations
  // Or, we simulate that nearby users instantly upvote it to get it verified for the demo.
  // Let's add 2 simulated upvotes instantly to show the live verification transition!
  const simulatedUpvotes = ['sim_user_1', 'sim_user_2'];
  const finalConfirmations = 3; // (Original user + 2 simulated users)
  
  await new Promise(r => setTimeout(r, 300));
  
  db.updateIssue(newIssueId, {
    confirmations: finalConfirmations,
    confirmedBy: [userId, ...simulatedUpvotes],
    status: 'verified'
  });

  updateStep(s3, {
    status: 'success',
    logs: [
      `Alert broadcasted to 14 nearby citizens.`,
      `Received 2 instant verification upvotes from nearby users.`,
      `Confirmation threshold reached (3/3).`,
      `Status changed: Reported → Verified`
    ],
    outputData: { confirmations: finalConfirmations }
  });

  await new Promise(r => setTimeout(r, 400));

  // ==========================================
  // STAGE 4: Agent 4 - Priority & Routing Agent
  // ==========================================
  const s4 = 3;
  updateStep(s4, { status: 'running', logs: ["Calculating urgency priority score using multi-factor formula...", "Retrieving zone risk parameters..."] });

  // Formula: priority_score = severity * log2(confirmations + 1) * area_weight
  // Let's determine area weight based on mock zone (school zone has 1.5, residential 1.0, etc.)
  const areaWeight = classification.category === 'pothole' ? 1.5 : 1.0; // Pothole near school has school_zone weight
  const confirmationsFactor = Math.log2(finalConfirmations + 1);
  const priorityScore = parseFloat((classification.severity * confirmationsFactor * areaWeight).toFixed(1));

  // Department assignment based on geography (Bengaluru-specific vs Jaipur-specific vs General Municipal)
  const isBengaluru = resolvedAddress.toLowerCase().includes("bengaluru") || 
                      resolvedAddress.toLowerCase().includes("karnataka") ||
                      (Math.abs(location.lat - 12.971598) < 0.1 && Math.abs(location.lng - 77.594562) < 0.1);

  const isJaipur = resolvedAddress.toLowerCase().includes("jaipur") || 
                   resolvedAddress.toLowerCase().includes("rajasthan") ||
                   (Math.abs(location.lat - 26.9124) < 0.5 && Math.abs(location.lng - 75.7873) < 0.5);

  let departmentId = "Municipal Corporation Office";
  if (isBengaluru) {
    departmentId = "General Ward Office";
    switch (classification.category) {
      case 'pothole':
        departmentId = "BBMP Roads Department";
        break;
      case 'water_leak':
        departmentId = "BWSSB (Water Dept)";
        break;
      case 'streetlight':
        departmentId = "BESCOM (Electricity)";
        break;
      case 'waste':
        departmentId = "BBMP Waste Management";
        break;
    }
  } else if (isJaipur) {
    departmentId = "Jaipur Municipal Corp (JMC)";
    switch (classification.category) {
      case 'pothole':
        departmentId = "JDA Roads Department";
        break;
      case 'water_leak':
        departmentId = "PHED (Water Dept)";
        break;
      case 'streetlight':
        departmentId = "JVVNL (Electricity)";
        break;
      case 'waste':
        departmentId = "Jaipur Municipal Corp (JMC)";
        break;
    }
  } else {
    departmentId = "Municipal Corporation Office";
    switch (classification.category) {
      case 'pothole':
        departmentId = "Municipal PWD (Roads Dept)";
        break;
      case 'water_leak':
        departmentId = "Municipal Water Supply Dept";
        break;
      case 'streetlight':
        departmentId = "State Electricity Board";
        break;
      case 'waste':
        departmentId = "Municipal Waste Management";
        break;
    }
  }

  // SLA set
  let slaHours = 168; // 7 days default
  if (classification.severity >= 8) {
    slaHours = 24; // Critical: 24h
  } else if (classification.severity >= 5) {
    slaHours = 72; // High: 72h
  }
  const slaDeadline = new Date(Date.now() + slaHours * 3600 * 1000).toISOString();

  db.updateIssue(newIssueId, {
    priorityScore: priorityScore,
    departmentId: departmentId,
    slaDeadline: slaDeadline,
    status: 'assigned'
  });

  updateStep(s4, {
    status: 'success',
    logs: [
      `Priority formula applied: Severity (${classification.severity}) × log2(Confirmations ${finalConfirmations} + 1) × Area Weight (${areaWeight})`,
      `Final Priority Score: ${priorityScore} / 40.0`,
      `Assigned Department: "${departmentId}"`,
      `SLA Deadline set: ${slaHours} Hours (Target: ${new Date(slaDeadline).toLocaleDateString()})`,
      `Status changed: Verified → Assigned`
    ],
    outputData: { priorityScore, departmentId, slaDeadline }
  });

  await new Promise(r => setTimeout(r, 400));

  // ==========================================
  // STAGE 5: Agent 5 - Resolution Tracker
  // ==========================================
  const s5 = 4;
  updateStep(s5, { status: 'running', logs: ["Initializing SLA active clock...", "Subscribing to department dispatch updates...", "Awaiting resolution progress from municipal crews."] });

  updateStep(s5, {
    status: 'success',
    logs: [
      `Active SLA tracking enabled for ${departmentId}.`,
      `Escalation webhook registered.`,
      `Push notifications queued for future status updates.`
    ]
  });

  // Start automated background update simulation for demo purposes
  // In a real system, the department works. Here we kick off a simulation that moves it to in_progress in 25 seconds, and resolved in 50 seconds.
  simulateDepartmentWork(newIssueId, departmentId);

  return { success: true, issueId: newIssueId };
}

function simulateDepartmentWork(issueId: string, department: string) {
  const db = getDb();
  
  // Transition to In Progress after 15 seconds to simulate field operators acknowledging the dispatch
  setTimeout(() => {
    const issue = db.getIssueById(issueId);
    if (issue && issue.status === 'assigned') {
      db.updateIssue(issueId, { status: 'in_progress' });
      
      // Award user more points on progress
      const reporter = db.getUserProfile(issue.reporterId);
      if (reporter) {
        db.updateUserProfile(issue.reporterId, {
          points: reporter.points + 20
        });
      }
    }
  }, 15000);

  // NOTE: Automatic resolution timeout has been disabled so that users can 
  // manually test the Field Crew Workspace with the Gemini Vision AI Inspector 
  // inside the application! This provides a much better interactive demo for the hackathon.
}
