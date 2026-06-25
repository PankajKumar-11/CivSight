// Real-world Database Adapter for CivSight
// Integrates with Firestore if config is provided, otherwise falls back to local storage with real-time listeners.
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, collection, doc, addDoc, updateDoc, setDoc,
  onSnapshot, query, getDocs, orderBy, where, limit 
} from 'firebase/firestore';

export interface Location {
  lat: number;
  lng: number;
}

export interface Issue {
  id: string;
  reporterId: string;
  category: 'pothole' | 'water_leak' | 'streetlight' | 'waste' | 'other';
  severity: number; // 1-10
  description: string;
  photoUrl: string;
  location: Location;
  address: string;
  confirmations: number;
  confirmedBy: string[];
  status: 'reported' | 'verified' | 'assigned' | 'in_progress' | 'resolved';
  departmentId: string;
  priorityScore: number;
  slaDeadline: string; // ISO String
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  displayName: string;
  photoURL: string;
  role: 'admin' | 'citizen' | 'worker';
  points: number;
  badges: string[];
  reportsCount: number;
  verifiedCount: number;
  resolvedCount: number;
}

export interface StatusUpdate {
  id: string;
  issueId: string;
  status: 'reported' | 'verified' | 'assigned' | 'in_progress' | 'resolved';
  message: string;
  updatedBy: string; // "System", "Roads Department", etc.
  timestamp: string;
}

export interface PredictiveAlert {
  id: string;
  title: string;
  message: string;
  zone: string;
  category: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: string;
}

type Listener<T> = (data: T) => void;

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const isFirebaseConfigured = !!(
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
);

let app: any;
let firestoreDb: any;

if (isFirebaseConfigured && typeof window !== 'undefined') {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    firestoreDb = getFirestore(app);
    console.log("Firebase Firestore initialized successfully in CivSight DB adapter.");
  } catch (e) {
    console.error("Failed to initialize Firebase", e);
  }
}

class LocalDatabase {
  private issues: Issue[] = [];
  private users: UserProfile[] = [];
  private statusUpdates: StatusUpdate[] = [];
  private alerts: PredictiveAlert[] = [];
  private issueListeners = new Set<Listener<Issue[]>>();
  private userListeners = new Set<Listener<UserProfile[]>>();
  private statusListeners = new Map<string, Set<Listener<StatusUpdate[]>>>();

  constructor() {
    this.loadFromStorage();
    if (this.issues.length === 0) {
      this.seedInitialData();
    }
  }

  private loadFromStorage() {
    if (typeof window === 'undefined') return;
    try {
      this.issues = JSON.parse(localStorage.getItem('civsight_issues') || '[]');
      this.users = JSON.parse(localStorage.getItem('civsight_users') || '[]');
      this.statusUpdates = JSON.parse(localStorage.getItem('civsight_updates') || '[]');
      this.alerts = JSON.parse(localStorage.getItem('civsight_alerts') || '[]');

      // Migrate old, low-quality/incorrect or broken seed images to the polished, descriptive ones
      let migrated = false;
      this.issues = this.issues.map(issue => {
        let url = issue.photoUrl;
        if (url) {
          if (url.includes('photo-1541888946425-d81bb19240f5') || url.includes('photo-1599740831633-93a0dc951dc8')) {
            url = 'https://images.unsplash.com/photo-1515162305285-0293e4767cc2?w=500';
            migrated = true;
          } else if (url.includes('photo-1504280390367-361c6d9f38f4') || url.includes('photo-1518173946687-a4c8a383392e')) {
            url = 'https://images.unsplash.com/photo-1486016006115-74a41448aea2?w=500';
            migrated = true;
          } else if (url.includes('photo-1518005020951-eccb494ad742')) {
            url = 'https://images.unsplash.com/photo-1509114397022-ed747cca3f65?w=500';
            migrated = true;
          } else if (url.includes('photo-1611284446314-60a58ac0deb9')) {
            url = 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?w=500';
            migrated = true;
          }
        }
        return url !== issue.photoUrl ? { ...issue, photoUrl: url } : issue;
      });

      if (migrated) {
        this.saveToStorage();
      }
    } catch (e) {
      console.error('Error loading from local storage', e);
    }
  }

  private saveToStorage() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('civsight_issues', JSON.stringify(this.issues));
      localStorage.setItem('civsight_users', JSON.stringify(this.users));
      localStorage.setItem('civsight_updates', JSON.stringify(this.statusUpdates));
      localStorage.setItem('civsight_alerts', JSON.stringify(this.alerts));
    } catch (e) {
      console.error('Error saving to local storage', e);
    }
  }

  private seedInitialData() {
    const defaultUser: UserProfile = {
      id: 'current_user_1',
      displayName: 'Arjun Sharma',
      photoURL: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
      role: 'admin',
      points: 120,
      badges: ['Pothole Patrol', 'Early Citizen'],
      reportsCount: 3,
      verifiedCount: 12,
      resolvedCount: 2
    };
    
    const issue1: Issue = {
      id: 'issue_101',
      reporterId: 'user_99',
      category: 'water_leak',
      severity: 7,
      description: 'Major water leakage from the main pipeline. Drinking water is being wasted on the road.',
      photoUrl: 'https://images.unsplash.com/photo-1486016006115-74a41448aea2?w=500',
      location: { lat: 26.9124, lng: 75.7873 },
      address: 'MI Road, near Metro Station, Jaipur, Rajasthan 302001',
      confirmations: 2,
      confirmedBy: ['user_98', 'user_97'],
      status: 'assigned',
      departmentId: 'PHED (Water Dept)',
      priorityScore: 14.5,
      slaDeadline: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
      resolvedAt: null,
      createdAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
    };

    const issue2: Issue = {
      id: 'issue_102',
      reporterId: 'user_99',
      category: 'pothole',
      severity: 9,
      description: 'Huge crater-sized pothole right in the middle of the school zone. High risk for children.',
      photoUrl: 'https://images.unsplash.com/photo-1515162305285-0293e4767cc2?w=500',
      location: { lat: 26.9154, lng: 75.7894 },
      address: 'Ashok Marg, C-Scheme, Jaipur, Rajasthan 302001',
      confirmations: 5,
      confirmedBy: ['user_98', 'user_97', 'current_user_1', 'user_95', 'user_94'],
      status: 'in_progress',
      departmentId: 'JDA Roads Department',
      priorityScore: 32.4,
      slaDeadline: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      resolvedAt: null,
      createdAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    };

    const issue3: Issue = {
      id: 'issue_103',
      reporterId: 'user_98',
      category: 'streetlight',
      severity: 4,
      description: 'Streetlight has been flickering and is now completely out. Area is unsafe at night.',
      photoUrl: 'https://images.unsplash.com/photo-1509114397022-ed747cca3f65?w=500',
      location: { lat: 26.9104, lng: 75.7854 },
      address: 'Civil Lines Road, Jaipur, Rajasthan 302006',
      confirmations: 0,
      confirmedBy: [],
      status: 'reported',
      departmentId: 'JVVNL (Electricity)',
      priorityScore: 4,
      slaDeadline: new Date(Date.now() + 168 * 3600 * 1000).toISOString(),
      resolvedAt: null,
      createdAt: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
    };

    const issue4: Issue = {
      id: 'issue_104',
      reporterId: 'current_user_1',
      category: 'waste',
      severity: 8,
      description: 'Illegal garbage dumping spot near the park. Smells terrible and attracts pests.',
      photoUrl: 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?w=500',
      location: { lat: 26.9204, lng: 75.7834 },
      address: 'Raja Park Main Market Road, Jaipur, Rajasthan 302004',
      confirmations: 3,
      confirmedBy: ['user_98', 'user_97', 'user_96'],
      status: 'resolved',
      departmentId: 'Jaipur Municipal Corp (JMC)',
      priorityScore: 24,
      slaDeadline: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      resolvedAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    };

    this.issues = [issue1, issue2, issue3, issue4];

    this.statusUpdates = [
      { id: 'u_1', issueId: 'issue_101', status: 'reported', message: 'Issue reported by citizen. Analysis triggered.', updatedBy: 'System', timestamp: new Date(Date.now() - 12 * 3600 * 1000).toISOString() },
      { id: 'u_2', issueId: 'issue_101', status: 'verified', message: 'Community verification threshold reached (3/3 approvals).', updatedBy: 'System', timestamp: new Date(Date.now() - 10 * 3600 * 1000).toISOString() },
      { id: 'u_3', issueId: 'issue_101', status: 'assigned', message: 'Issue auto-routed to PHED (Water Dept). SLA set to 72 Hours.', updatedBy: 'Priority & Routing Agent', timestamp: new Date(Date.now() - 6 * 3600 * 1000).toISOString() },
      
      { id: 'u_4', issueId: 'issue_102', status: 'reported', message: 'Issue reported by citizen. Visual analysis categorized: Pothole, Severity 9/10.', updatedBy: 'System', timestamp: new Date(Date.now() - 24 * 3600 * 1000).toISOString() },
      { id: 'u_5', issueId: 'issue_102', status: 'verified', message: 'Community verified with 5 confirmations.', updatedBy: 'System', timestamp: new Date(Date.now() - 20 * 3600 * 1000).toISOString() },
      { id: 'u_6', issueId: 'issue_102', status: 'assigned', message: 'Routed to JDA Roads Department. SLA priority deadline: 24 Hours.', updatedBy: 'Priority & Routing Agent', timestamp: new Date(Date.now() - 18 * 3600 * 1000).toISOString() },
      { id: 'u_7', issueId: 'issue_102', status: 'in_progress', message: 'Road maintenance crew dispatched to Ashok Marg.', updatedBy: 'JDA Roads Department', timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString() },

      { id: 'u_8', issueId: 'issue_103', status: 'reported', message: 'Streetlight outage reported. Awaiting community upvotes.', updatedBy: 'System', timestamp: new Date(Date.now() - 1 * 3600 * 1000).toISOString() },
      
      { id: 'u_9', issueId: 'issue_104', status: 'reported', message: 'Garbage dump reported. Severity 8/10.', updatedBy: 'System', timestamp: new Date(Date.now() - 48 * 3600 * 1000).toISOString() },
      { id: 'u_10', issueId: 'issue_104', status: 'verified', message: 'Community validation completed.', updatedBy: 'System', timestamp: new Date(Date.now() - 40 * 3600 * 1000).toISOString() },
      { id: 'u_11', issueId: 'issue_104', status: 'assigned', message: 'Routed to JMC Waste Management.', updatedBy: 'Priority & Routing Agent', timestamp: new Date(Date.now() - 38 * 3600 * 1000).toISOString() },
      { id: 'u_12', issueId: 'issue_104', status: 'in_progress', message: 'Cleaning crew assigned.', updatedBy: 'Jaipur Municipal Corp (JMC)', timestamp: new Date(Date.now() - 20 * 3600 * 1000).toISOString() },
      { id: 'u_13', issueId: 'issue_104', status: 'resolved', message: 'Garbage cleared and spot sanitized. Before-after verified.', updatedBy: 'Jaipur Municipal Corp (JMC)', timestamp: new Date(Date.now() - 4 * 3600 * 1000).toISOString() }
    ];

    this.users = [
      defaultUser,
      { id: 'user_98', displayName: 'Ravi Kumar', photoURL: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', role: 'citizen' as const, points: 280, badges: ['Civic Leader', 'Trash Buster'], reportsCount: 12, verifiedCount: 45, resolvedCount: 8 },
      { id: 'user_97', displayName: 'Priya Narayanan', photoURL: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150', role: 'citizen' as const, points: 410, badges: ['Water Guardian', 'Super Voter'], reportsCount: 8, verifiedCount: 92, resolvedCount: 5 }
    ];

    this.alerts = [
      { id: 'a_1', title: 'Pothole Cluster Spotted', message: '3 new potholes reported in school zone on Ashok Marg within 48h. Critical hazard.', zone: 'Ward 7', category: 'pothole', severity: 'critical', timestamp: new Date(Date.now() - 3 * 3600 * 1000).toISOString() },
      { id: 'a_2', title: 'Water Leak Anomaly', message: 'Water leak reports are 2.5x above baseline in MI Road area. Potential main pipe rupture.', zone: 'Ward 7', category: 'water_leak', severity: 'warning', timestamp: new Date().toISOString() }
    ];

    this.saveToStorage();
  }

  // --- Issues API ---
  getIssues(): Issue[] {
    return [...this.issues];
  }

  getIssueById(id: string): Issue | undefined {
    return this.issues.find(i => i.id === id);
  }

  addIssue(issue: Issue): Issue {
    this.issues.unshift(issue);
    this.saveToStorage();
    this.notifyIssues();
    
    this.addStatusUpdate({
      id: 'up_' + Math.random().toString(36).substr(2, 9),
      issueId: issue.id,
      status: 'reported',
      message: `Issue reported: ${issue.category} at ${issue.address}. Agent visual classification complete.`,
      updatedBy: 'System',
      timestamp: new Date().toISOString()
    });

    return issue;
  }

  updateIssue(id: string, updates: Partial<Issue>): Issue | undefined {
    const idx = this.issues.findIndex(i => i.id === id);
    if (idx === -1) return undefined;
    
    const oldStatus = this.issues[idx].status;
    this.issues[idx] = { ...this.issues[idx], ...updates, updatedAt: new Date().toISOString() };
    this.saveToStorage();
    this.notifyIssues();

    if (updates.status && updates.status !== oldStatus) {
      let message = `Status changed to ${updates.status}`;
      let actor = 'System';
      if (updates.status === 'verified') {
        message = `Community validation complete. Minimum upvote threshold reached.`;
        actor = 'Community Validation Agent';
      } else if (updates.status === 'assigned') {
        message = `Routed to ${this.issues[idx].departmentId}. SLA set to ${updates.slaDeadline ? 'appropriate level' : '72 hours'}.`;
        actor = 'Priority & Routing Agent';
      } else if (updates.status === 'in_progress') {
        message = `Work in progress. Maintenance crew assigned.`;
        actor = this.issues[idx].departmentId || 'Department';
      } else if (updates.status === 'resolved') {
        message = `Issue resolved and confirmed. Verification closed.`;
        actor = this.issues[idx].departmentId || 'Department';
      }

      this.addStatusUpdate({
        id: 'up_' + Math.random().toString(36).substr(2, 9),
        issueId: id,
        status: updates.status,
        message,
        updatedBy: actor,
        timestamp: new Date().toISOString()
      });
    }

    return this.issues[idx];
  }

  subscribeIssues(callback: Listener<Issue[]>): () => void {
    this.issueListeners.add(callback);
    callback(this.getIssues());
    return () => {
      this.issueListeners.delete(callback);
    };
  }

  private notifyIssues() {
    const list = this.getIssues();
    this.issueListeners.forEach(listener => listener(list));
  }

  // --- Status Updates API ---
  getStatusUpdates(issueId: string): StatusUpdate[] {
    return this.statusUpdates
      .filter(u => u.issueId === issueId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  addStatusUpdate(update: StatusUpdate) {
    this.statusUpdates.push(update);
    this.saveToStorage();
    
    const set = this.statusListeners.get(update.issueId);
    if (set) {
      const list = this.getStatusUpdates(update.issueId);
      set.forEach(listener => listener(list));
    }
  }

  subscribeStatusUpdates(issueId: string, callback: Listener<StatusUpdate[]>): () => void {
    if (!this.statusListeners.has(issueId)) {
      this.statusListeners.set(issueId, new Set());
    }
    const set = this.statusListeners.get(issueId)!;
    set.add(callback);
    callback(this.getStatusUpdates(issueId));
    return () => {
      set.delete(callback);
      if (set.size === 0) {
        this.statusListeners.delete(issueId);
      }
    };
  }

  // --- Users API ---
  getUserProfile(id: string): UserProfile | undefined {
    return this.users.find(u => u.id === id);
  }

  getUsers(): UserProfile[] {
    return [...this.users].sort((a, b) => b.points - a.points);
  }

  updateUserProfile(id: string, updates: Partial<UserProfile>): UserProfile | undefined {
    const idx = this.users.findIndex(u => u.id === id);
    if (idx === -1) return undefined;
    this.users[idx] = { ...this.users[idx], ...updates };
    this.saveToStorage();
    this.notifyUsers();
    return this.users[idx];
  }

  subscribeUsers(callback: Listener<UserProfile[]>): () => void {
    this.userListeners.add(callback);
    callback(this.getUsers());
    return () => {
      this.userListeners.delete(callback);
    };
  }

  private notifyUsers() {
    const list = this.getUsers();
    this.userListeners.forEach(l => l(list));
  }

  // --- Alerts API ---
  getAlerts(): PredictiveAlert[] {
    return [...this.alerts].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  addAlert(alert: PredictiveAlert) {
    this.alerts.unshift(alert);
    this.saveToStorage();
  }
}

class FirebaseDatabaseWrapper {
  private issuesCache: Issue[] = [];
  private usersCache: UserProfile[] = [];
  private localDb = new LocalDatabase();
  private useFallback = false;

  constructor() {
    this.checkAndSeedFirestore();
    
    // Maintain internal caches for synchronous queries
    try {
      this.subscribeIssues((updatedIssues) => {
        if (!this.useFallback) this.issuesCache = updatedIssues;
      });

      this.subscribeUsers((updatedUsers) => {
        if (!this.useFallback) this.usersCache = updatedUsers;
      });
    } catch (e) {
      this.handleFirebaseError(e);
    }
  }

  private handleFirebaseError(error: any) {
    console.error("Firebase database error encountered. Falling back to LocalStorage Database wrapper:", error);
    this.useFallback = true;
  }

  async checkAndSeedFirestore() {
    if (!firestoreDb || this.useFallback) return;
    try {
      // Seed users collection first
      const usersSnap = await getDocs(query(collection(firestoreDb, 'users'), limit(1)));
      if (usersSnap.empty) {
        console.log("Firestore users collection is empty. Seeding initial users...");
        const seedUsers = [
          {
            displayName: 'Arjun Sharma',
            photoURL: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
            role: 'admin',
            points: 120,
            badges: ['Pothole Patrol', 'Early Citizen'],
            reportsCount: 3,
            verifiedCount: 12,
            resolvedCount: 2
          },
          { id: 'user_98', displayName: 'Ravi Kumar', photoURL: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', role: 'citizen', points: 280, badges: ['Civic Leader', 'Trash Buster'], reportsCount: 12, verifiedCount: 45, resolvedCount: 8 },
          { id: 'user_97', displayName: 'Priya Narayanan', photoURL: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150', role: 'citizen', points: 410, badges: ['Water Guardian', 'Super Voter'], reportsCount: 8, verifiedCount: 92, resolvedCount: 5 }
        ];

        for (const u of seedUsers) {
          const id = u.id || 'current_user_1';
          const { id: _, ...uData } = u as any;
          await setDoc(doc(firestoreDb, 'users', id), uData);
        }
      }

      // Seed issues and statusUpdates
      const issuesSnap = await getDocs(query(collection(firestoreDb, 'issues'), limit(1)));
      if (issuesSnap.empty) {
        console.log("Firestore issues collection is empty. Seeding initial issues...");
        const seedIssues: Issue[] = [
          {
            id: 'issue_101',
            reporterId: 'user_99',
            category: 'water_leak',
            severity: 7,
            description: 'Major water leakage from the main pipeline. Drinking water is being wasted on the road.',
            photoUrl: 'https://images.unsplash.com/photo-1486016006115-74a41448aea2?w=500',
            location: { lat: 26.9124, lng: 75.7873 },
            address: 'MI Road, near Metro Station, Jaipur, Rajasthan 302001',
            confirmations: 2,
            confirmedBy: ['user_98', 'user_97'],
            status: 'assigned',
            departmentId: 'PHED (Water Dept)',
            priorityScore: 14.5,
            slaDeadline: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
            resolvedAt: null,
            createdAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
            updatedAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
          },
          {
            id: 'issue_102',
            reporterId: 'user_99',
            category: 'pothole',
            severity: 9,
            description: 'Huge crater-sized pothole right in the middle of the school zone. High risk for children.',
            photoUrl: 'https://images.unsplash.com/photo-1515162305285-0293e4767cc2?w=500',
            location: { lat: 26.9154, lng: 75.7894 },
            address: 'Ashok Marg, C-Scheme, Jaipur, Rajasthan 302001',
            confirmations: 5,
            confirmedBy: ['user_98', 'user_97', 'current_user_1', 'user_95', 'user_94'],
            status: 'in_progress',
            departmentId: 'JDA Roads Department',
            priorityScore: 32.4,
            slaDeadline: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
            resolvedAt: null,
            createdAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
            updatedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
          },
          {
            id: 'issue_103',
            reporterId: 'user_98',
            category: 'streetlight',
            severity: 4,
            description: 'Streetlight has been flickering and is now completely out. Area is unsafe at night.',
            photoUrl: 'https://images.unsplash.com/photo-1509114397022-ed747cca3f65?w=500',
            location: { lat: 26.9104, lng: 75.7854 },
            address: 'Civil Lines Road, Jaipur, Rajasthan 302006',
            confirmations: 0,
            confirmedBy: [],
            status: 'reported',
            departmentId: 'JVVNL (Electricity)',
            priorityScore: 4,
            slaDeadline: new Date(Date.now() + 168 * 3600 * 1000).toISOString(),
            resolvedAt: null,
            createdAt: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
            updatedAt: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
          },
          {
            id: 'issue_104',
            reporterId: 'current_user_1',
            category: 'waste',
            severity: 8,
            description: 'Illegal garbage dumping spot near the park. Smells terrible and attracts pests.',
            photoUrl: 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?w=500',
            location: { lat: 26.9204, lng: 75.7834 },
            address: 'Raja Park Main Market Road, Jaipur, Rajasthan 302004',
            confirmations: 3,
            confirmedBy: ['user_98', 'user_97', 'user_96'],
            status: 'resolved',
            departmentId: 'Jaipur Municipal Corp (JMC)',
            priorityScore: 24,
            slaDeadline: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
            resolvedAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
            createdAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
            updatedAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
          }
        ];

        for (const iss of seedIssues) {
          const { id, ...issData } = iss;
          await setDoc(doc(firestoreDb, 'issues', id), issData);
        }

        const seedUpdates = [
          { id: 'u_1', issueId: 'issue_101', status: 'reported', message: 'Issue reported by citizen. Analysis triggered.', updatedBy: 'System', timestamp: new Date(Date.now() - 12 * 3600 * 1000).toISOString() },
          { id: 'u_2', issueId: 'issue_101', status: 'verified', message: 'Community verification threshold reached (3/3 approvals).', updatedBy: 'System', timestamp: new Date(Date.now() - 10 * 3600 * 1000).toISOString() },
          { id: 'u_3', issueId: 'issue_101', status: 'assigned', message: 'Issue auto-routed to PHED (Water Dept). SLA set to 72 Hours.', updatedBy: 'Priority & Routing Agent', timestamp: new Date(Date.now() - 6 * 3600 * 1000).toISOString() },
          { id: 'u_4', issueId: 'issue_102', status: 'reported', message: 'Issue reported by citizen. Visual analysis categorized: Pothole, Severity 9/10.', updatedBy: 'System', timestamp: new Date(Date.now() - 24 * 3600 * 1000).toISOString() },
          { id: 'u_5', issueId: 'issue_102', status: 'verified', message: 'Community verified with 5 confirmations.', updatedBy: 'System', timestamp: new Date(Date.now() - 20 * 3600 * 1000).toISOString() },
          { id: 'u_6', issueId: 'issue_102', status: 'assigned', message: 'Routed to JDA Roads Department. SLA priority deadline: 24 Hours.', updatedBy: 'Priority & Routing Agent', timestamp: new Date(Date.now() - 18 * 3600 * 1000).toISOString() },
          { id: 'u_7', issueId: 'issue_102', status: 'in_progress', message: 'Road maintenance crew dispatched to Ashok Marg.', updatedBy: 'JDA Roads Department', timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString() },
          { id: 'u_8', issueId: 'issue_103', status: 'reported', message: 'Streetlight outage reported. Awaiting community upvotes.', updatedBy: 'System', timestamp: new Date(Date.now() - 1 * 3600 * 1000).toISOString() },
          { id: 'u_9', issueId: 'issue_104', status: 'reported', message: 'Garbage dump reported. Severity 8/10.', updatedBy: 'System', timestamp: new Date(Date.now() - 48 * 3600 * 1000).toISOString() },
          { id: 'u_10', issueId: 'issue_104', status: 'verified', message: 'Community validation completed.', updatedBy: 'System', timestamp: new Date(Date.now() - 40 * 3600 * 1000).toISOString() },
          { id: 'u_11', issueId: 'issue_104', status: 'assigned', message: 'Routed to JMC Waste Management.', updatedBy: 'Priority & Routing Agent', timestamp: new Date(Date.now() - 38 * 3600 * 1000).toISOString() },
          { id: 'u_12', issueId: 'issue_104', status: 'in_progress', message: 'Cleaning crew assigned.', updatedBy: 'Jaipur Municipal Corp (JMC)', timestamp: new Date(Date.now() - 20 * 3600 * 1000).toISOString() },
          { id: 'u_13', issueId: 'issue_104', status: 'resolved', message: 'Garbage cleared and spot sanitized. Before-after verified.', updatedBy: 'Jaipur Municipal Corp (JMC)', timestamp: new Date(Date.now() - 4 * 3600 * 1000).toISOString() }
        ];

        for (const up of seedUpdates) {
          const { id, ...upData } = up;
          await setDoc(doc(firestoreDb, 'statusUpdates', id), upData);
        }
      }
    } catch (e) {
      this.handleFirebaseError(e);
    }
  }

  getIssues(): Issue[] { 
    return this.useFallback ? this.localDb.getIssues() : this.issuesCache; 
  }
  
  subscribeIssues(callback: Listener<Issue[]>): () => void {
    if (this.useFallback) {
      return this.localDb.subscribeIssues(callback);
    }
    if (!firestoreDb) {
      this.useFallback = true;
      return this.localDb.subscribeIssues(callback);
    }
    try {
      const unsub = onSnapshot(
        query(collection(firestoreDb, 'issues'), orderBy('createdAt', 'desc')), 
        (snapshot) => {
          if (this.useFallback) return;
          const issuesList: Issue[] = [];
          snapshot.forEach((doc) => {
            issuesList.push({ id: doc.id, ...doc.data() } as Issue);
          });
          callback(issuesList);
        },
        (error) => {
          this.handleFirebaseError(error);
          this.localDb.subscribeIssues(callback);
        }
      );
      return unsub;
    } catch (e) {
      this.handleFirebaseError(e);
      return this.localDb.subscribeIssues(callback);
    }
  }

  getIssueById(id: string): Issue | undefined {
    return this.useFallback ? this.localDb.getIssueById(id) : this.issuesCache.find(i => i.id === id);
  }

  getUserProfile(id: string): UserProfile | undefined {
    return this.useFallback ? this.localDb.getUserProfile(id) : this.usersCache.find(u => u.id === id);
  }

  async addIssue(issue: Issue): Promise<Issue> {
    if (this.useFallback) {
      return this.localDb.addIssue(issue);
    }
    try {
      if (!firestoreDb) throw new Error("Firestore not configured");
      const { id, ...data } = issue;
      await setDoc(doc(firestoreDb, 'issues', id), data);
      
      // Add initial log
      await this.addStatusUpdate({
        id: 'up_' + Math.random().toString(36).substr(2, 9),
        issueId: id,
        status: 'reported',
        message: `Issue reported: ${issue.category} at ${issue.address}. Agent visual classification complete.`,
        updatedBy: 'System',
        timestamp: new Date().toISOString()
      });

      return issue;
    } catch (e) {
      this.handleFirebaseError(e);
      return this.localDb.addIssue(issue);
    }
  }

  async updateIssue(id: string, updates: Partial<Issue>) {
    if (this.useFallback) {
      return this.localDb.updateIssue(id, updates);
    }
    try {
      if (!firestoreDb) throw new Error("Firestore not configured");
      await updateDoc(doc(firestoreDb, 'issues', id), updates as any);

      // If status changed, post a status update log
      if (updates.status) {
        let message = `Status changed to ${updates.status}`;
        let actor = 'System';
        if (updates.status === 'verified') {
          message = `Community validation complete. Minimum upvote threshold reached.`;
          actor = 'Community Validation Agent';
        } else if (updates.status === 'assigned') {
          message = `Routed to appropriate department. SLA deadline established.`;
          actor = 'Priority & Routing Agent';
        } else if (updates.status === 'in_progress') {
          message = `Work in progress. Maintenance crew assigned.`;
          actor = updates.departmentId || 'Department';
        } else if (updates.status === 'resolved') {
          message = `Issue resolved and confirmed. Verification closed.`;
          actor = updates.departmentId || 'Department';
        }

        await this.addStatusUpdate({
          id: 'up_' + Math.random().toString(36).substr(2, 9),
          issueId: id,
          status: updates.status,
          message,
          updatedBy: actor,
          timestamp: new Date().toISOString()
        });
      }
    } catch (e) {
      this.handleFirebaseError(e);
      await this.localDb.updateIssue(id, updates);
    }
  }

  subscribeStatusUpdates(issueId: string, callback: Listener<StatusUpdate[]>): () => void {
    if (this.useFallback) {
      return this.localDb.subscribeStatusUpdates(issueId, callback);
    }
    if (!firestoreDb) {
      this.useFallback = true;
      return this.localDb.subscribeStatusUpdates(issueId, callback);
    }
    try {
      const unsub = onSnapshot(
        query(collection(firestoreDb, 'statusUpdates'), where('issueId', '==', issueId)),
        (snapshot) => {
          if (this.useFallback) return;
          const list: StatusUpdate[] = [];
          snapshot.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() } as StatusUpdate);
          });
          list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          callback(list);
        },
        (error) => {
          this.handleFirebaseError(error);
          this.localDb.subscribeStatusUpdates(issueId, callback);
        }
      );
      return unsub;
    } catch (e) {
      this.handleFirebaseError(e);
      return this.localDb.subscribeStatusUpdates(issueId, callback);
    }
  }

  async addStatusUpdate(update: StatusUpdate) {
    if (this.useFallback) {
      return this.localDb.addStatusUpdate(update);
    }
    try {
      if (!firestoreDb) return;
      const { id, ...data } = update;
      await setDoc(doc(firestoreDb, 'statusUpdates', id), data);
    } catch (e) {
      this.handleFirebaseError(e);
      await this.localDb.addStatusUpdate(update);
    }
  }

  subscribeUsers(callback: Listener<UserProfile[]>): () => void {
    if (this.useFallback) {
      return this.localDb.subscribeUsers(callback);
    }
    if (!firestoreDb) {
      this.useFallback = true;
      return this.localDb.subscribeUsers(callback);
    }
    try {
      const unsub = onSnapshot(
        query(collection(firestoreDb, 'users'), orderBy('points', 'desc')),
        (snapshot) => {
          if (this.useFallback) return;
          const usersList: UserProfile[] = [];
          snapshot.forEach((doc) => {
            usersList.push({ id: doc.id, ...doc.data() } as UserProfile);
          });
          callback(usersList);
        },
        (error) => {
          this.handleFirebaseError(error);
          this.localDb.subscribeUsers(callback);
        }
      );
      return unsub;
    } catch (e) {
      this.handleFirebaseError(e);
      return this.localDb.subscribeUsers(callback);
    }
  }

  async updateUserProfile(id: string, updates: Partial<UserProfile>) {
    if (this.useFallback) {
      return this.localDb.updateUserProfile(id, updates);
    }
    try {
      if (!firestoreDb) return;
      await updateDoc(doc(firestoreDb, 'users', id), updates as any);
    } catch (e) {
      this.handleFirebaseError(e);
      await this.localDb.updateUserProfile(id, updates);
    }
  }

  getAlerts(): PredictiveAlert[] {
    if (this.useFallback) return this.localDb.getAlerts();
    return [
      { id: 'a_1', title: 'Pothole Cluster Spotted', message: '3 new potholes reported in school zone on Ashok Marg within 48h. Critical hazard.', zone: 'Ward 7', category: 'pothole', severity: 'critical', timestamp: new Date(Date.now() - 3 * 3600 * 1000).toISOString() },
      { id: 'a_2', title: 'Water Leak Anomaly', message: 'Water leak reports are 2.5x above baseline in MI Road area. Potential main pipe rupture.', zone: 'Ward 7', category: 'water_leak', severity: 'warning', timestamp: new Date().toISOString() }
    ];
  }
}

// Expose Haversine distance helper
export function getDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Single instance routing logic
let dbInstance: any = null;
export function getDb(): any {
  if (!dbInstance) {
    // Check if Firebase keys are populated and not default templates
    const isFirebaseValid = isFirebaseConfigured && 
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY && 
      !process.env.NEXT_PUBLIC_FIREBASE_API_KEY.includes("INSERT_YOUR");
      
    if (isFirebaseValid && typeof window !== 'undefined') {
      dbInstance = new FirebaseDatabaseWrapper();
    } else {
      dbInstance = new LocalDatabase();
    }
  }
  return dbInstance;
}
