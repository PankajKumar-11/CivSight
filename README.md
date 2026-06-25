# CivSight

CivSight is a smart city platform for identifying, reporting, tracking, and verifying municipal infrastructure issues (such as potholes, water leaks, broken streetlights, and waste accumulation). It integrates Gemini 2.5 Flash for automated visual analysis, reverse geocoding for locations, a routing optimizer for field crews, and before/after image validation to close work orders.

**Live Deployed App:** [https://civsight-877916514223.asia-southeast1.run.app/](https://civsight-877916514223.asia-southeast1.run.app/)

---

## Features

- **Visual Classifier:** Analyzes issue photos using Gemini to determine the category, severity, and area.
- **Geo-Routing & Deduplication:** Auto-resolves GPS coordinates to street addresses, detects duplicates within 200m to merge reports, and sequences work orders using a TSP solver.
- **Community Validation:** Nearby citizens confirm reports to promote issues from "Reported" to "Verified".
- **Visual QA Inspector:** Compares before/after photos submitted by repair crews to verify repair quality before closing tickets, automatically catching duplicate or invalid proofs.
- **Admin Dashboard & Chatbot:** Generates city-wide health intelligence reports and provides an interactive chatbot to query active issues and SLA metrics.

---

## Local Setup

### Prerequisites
- Node.js (v20+)
- Gemini API Key (from Google AI Studio)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/PankajKumar-11/CivSight.git
   cd CivSight
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure environment variables. Create a `.env` file in the root:
   ```env
   GEMINI_API_KEY="your_api_key_here"
   NEXT_PUBLIC_MAPS_API_KEY="your_optional_maps_key"
   ```
   *If no Maps key is provided, the application runs on a built-in vector grid map fallback.*
4. Start the development server:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

---

## Step-by-Step Demo Guide (For Evaluators)

A guided quest is built into the sidebar. Here is how to walk through the entire lifecycle of an incident:

### 1. Citizen Flow: Reporting an Issue
1. Set the role to **Citizen** in the sidebar's Quick Role Switcher.
2. Click the floating **+** button on the map (or click **Report** in the sidebar guide).
3. Select one of the preset test cases (e.g., **Severe Pothole** or **Water Main Leak**).
4. Review the visual classification output (category, severity, AI recommendation) and click **Confirm Classification & Proceed**.
5. Drag the map pin to adjust location, then click **Submit Civic Report**.
6. Watch the pipeline run through the stages. Once done, select the new report in the queue to view its active SLA countdown and details.

### 2. Crew Flow: Dispatches and AI QA Verification
1. Switch the role to **Crew** in the sidebar.
2. Under **Field Ops**, pick your department's route from the route sheet. (The TSP solver automatically sequences stops).
3. Click **Acknowledge & Begin Work** on your issue to mark it `In Progress`.
4. Under "Submit Work Proof", test the QA inspection:
   - Select the **"Same Image (Fails AI Inspection)"** preset. Click **Verify**. Gemini will reject it because the issue has not been fixed.
   - Now, select the successful repair preset (e.g., **"Fresh Asphalt Patching"** or **"Dry Piping"**) and click **Verify**. Gemini will approve the resolution, close the issue as `Resolved`, and credit XP points.

### 3. Admin Flow: Management Analytics
1. Switch the role to **Admin** in the sidebar.
2. Go to the **Dashboard** tab.
3. Click **Generate AI City Intelligence Report**. Gemini will scan your live metrics and compile an intelligence briefing, alert status, and policy recommendations.
4. Open the chatbot in the bottom right corner and ask questions like:
   - *"What is the status of the pothole reported on Ashok Marg?"*
   - *"Do we have any active SLA breaches?"*
   - *"How much taxpayer money has been saved?"*

---

## How It Works Under the Hood

### The 5-Stage Pipeline
- **Stage 1 (Vision Classifier):** Uses Gemini 2.5 Flash to extract structured categories, descriptions, and ratings.
- **Stage 2 (Geo-Context):** Checks a 200m radius of coordinates to prevent redundant logs.
- **Stage 3 (Validation):** Simulated notifications broadcast to nearby nodes, requiring upvotes to verify.
- **Stage 4 (Routing & SLA):** Priority score calculated as `Severity * log2(Confirmations + 1)`. Sets 24h SLA for critical ($\ge 8$), 72h for high ($\ge 5$).
- **Stage 5 (Resolution Tracker):** Ticks down active SLAs and handles the before/after verification model using Gemini.
