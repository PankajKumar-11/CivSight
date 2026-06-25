// Gemini API Integration for CivSight (Agent 1: Vision Classifier)
// Calls the server-side /api/classify route which holds the API key securely.

export interface ClassificationResult {
  category: 'pothole' | 'water_leak' | 'streetlight' | 'waste' | 'other';
  severity: number; // 1-10
  description: string;
  confidence: number; // 0-1
  estimated_area_sqm: number;
  ai_recommendation?: string;
  source?: 'gemini-vision-real' | 'mock';
}

// Mock classifications for fallback when API is unavailable
const mockClassifications: Array<ClassificationResult & { keywords: string[] }> = [
  {
    category: 'pothole',
    severity: 8,
    description: 'Deep road depression / pothole detected. Poses high risk for two-wheelers and night commuters.',
    confidence: 0.94,
    estimated_area_sqm: 1.2,
    ai_recommendation: 'Deploy road repair crew within 24h; barricade area immediately.',
    source: 'mock',
    keywords: ['pothole', 'road', 'asphalt', 'crater', 'street', 'driveway']
  },
  {
    category: 'water_leak',
    severity: 7,
    description: 'Fresh clean water leakage detected. Spilling across the walkway, potential drinking water line burst.',
    confidence: 0.89,
    estimated_area_sqm: 3.5,
    ai_recommendation: 'Contact water dept to shut valve and inspect main supply line.',
    source: 'mock',
    keywords: ['water', 'leak', 'pipe', 'wet', 'drain', 'puddle', 'splash']
  },
  {
    category: 'streetlight',
    severity: 5,
    description: 'Broken streetlight unit detected. Housing appears damaged, electrical wiring may be exposed.',
    confidence: 0.92,
    estimated_area_sqm: 0.1,
    ai_recommendation: 'Rope off area near pole and dispatch electrician for nighttime repair.',
    source: 'mock',
    keywords: ['light', 'lamp', 'dark', 'bulb', 'streetlight', 'electricity', 'wire']
  },
  {
    category: 'waste',
    severity: 6,
    description: 'Pile of unsorted solid municipal waste dumped on the roadside. Breeding ground for stray animals.',
    confidence: 0.96,
    estimated_area_sqm: 4.2,
    ai_recommendation: 'Schedule emergency sweeper unit pickup and issue area violation notice.',
    source: 'mock',
    keywords: ['garbage', 'waste', 'trash', 'plastic', 'dump', 'rubbish', 'pile']
  }
];

export async function classifyIssueImage(
  base64Image: string,
  userHintText?: string,
  confirmedCategory?: 'pothole' | 'water_leak' | 'streetlight' | 'waste' | 'other',
  confirmedSeverity?: number
): Promise<ClassificationResult> {
  
  // Try the server-side API route first (uses real Gemini API key)
  try {
    const response = await fetch('/api/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Image, userHint: userHintText })
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.category) {
        console.log(`[CivSight Vision] Real Gemini API classification: ${data.category} (confidence: ${data.confidence})`);
        const result = data as ClassificationResult;
        if (confirmedCategory) {
          result.category = confirmedCategory;
        }
        if (confirmedSeverity !== undefined) {
          result.severity = confirmedSeverity;
        }
        return result;
      }
    } else {
      console.warn('[CivSight Vision] API route returned error, falling back to mock:', await response.text());
    }
  } catch (fetchError) {
    console.warn('[CivSight Vision] Could not reach /api/classify, falling back to mock:', fetchError);
  }

  // Fallback: simulate delay then return mock result
  await new Promise(resolve => setTimeout(resolve, 1500));

  // If there is a confirmed category from the wizard, find the corresponding mock classification template
  if (confirmedCategory) {
    const match = mockClassifications.find(m => m.category === confirmedCategory);
    if (match) {
      const { keywords, ...cleanResult } = match;
      return {
        ...cleanResult,
        severity: confirmedSeverity !== undefined ? confirmedSeverity : cleanResult.severity
      };
    }
  }

  const hint = (userHintText || '').toLowerCase();
  const match = mockClassifications.find(m =>
    m.keywords.some(kw => hint.includes(kw))
  );

  if (match) {
    const { keywords, ...cleanResult } = match;
    return {
      ...cleanResult,
      severity: confirmedSeverity !== undefined ? confirmedSeverity : cleanResult.severity
    };
  }

  const randomIdx = Math.floor(Math.random() * mockClassifications.length);
  const { keywords, ...result } = mockClassifications[randomIdx];
  return {
    ...result,
    severity: confirmedSeverity !== undefined ? confirmedSeverity : Math.min(10, Math.max(1, result.severity + Math.floor(Math.random() * 3) - 1)),
    estimated_area_sqm: parseFloat((result.estimated_area_sqm * (0.8 + Math.random() * 0.4)).toFixed(1))
  };
}
