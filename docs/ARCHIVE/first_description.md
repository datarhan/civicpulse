> ⚠️ **ARCHIVED — pre-build mindmap kept for history only.**
>
> This document describes the original Python/Postgres vision before the
> project was built. The shipped stack is Vite + React 18 + Node Telegram
> bot — see `../../CLAUDE.md` for the authoritative architecture and
> `../ROADMAP.md` for the current roadmap. Preserved to trace how
> thinking evolved, not to be used as a reference.

This is the CivicPulse Master Handbook. It is designed to be the "source of truth" for any developer, designer, or stakeholder joining the team. It integrates our Silicon Valley "Move Fast" philosophy with the hyper-local needs of Riba-roja de Túria.

🗺️ The CivicPulse Roadmap (Mindmap)
1. The Core Infrastructure (The Foundation)

Data Ingestion Engine: Python/Playwright Scrapers for ribarroja.es.

The Vault: PostgreSQL + PostGIS for spatial data; pgvector for document embeddings.

The AI Brain: RAG (Retrieval-Augmented Generation) for "Ask the City" queries.

2. The Citizen Experience (The Front-End)

The Map: Interactive heatmap of Riba-roja with incident pins.

The Vitals: Real-time dashboard (Air, Crime, Water, Temp).

The Feed: AI-summarized "Morning Pulse" (Council meeting notes).

3. The Accountability Loop (The "Stick")

Politician Scorecards: Public profiles of Robert Raga and his councilors.

The Neighbor Rivalry: Benchmarking Riba-roja vs. La Pobla de Vallbona.

Verification Bot: Telegram-based community photo-audit.

4. The Official's Suite (The "Carrot")

Response Dashboard: Interface for councilors to claim and "fix" issues.

Efficiency Analytics: Data-driven proof for their next campaign.

🏥 Main Page Dashboard: "The Health Monitor"
The first screen a user sees. It should feel like a medical monitor for the city’s well-being.

Top Bar: The Live "Vitals"

Air Quality (AQI): 12 (Excellent) — Source: AEMET/Local Sensor.

Safety Status: 🟢 Normal — 0 incidents in the last 24h.

Connectivity: Line 9 Metro: 4 min delay — Live API feed.

Middle Section: The "Morning Pulse" (AI Summary)

"In last night's Pleno (18/03/2026), the Council approved a €2.1M expansion for the Polígono Industrial. Your district's noise ordinance was also updated. [Read 30s Summary]"

Central Feature: The Interactive Map

Heatmap Overlay: Toggle between "Potholes," "Lighting," and "Cleanliness."

Active Pins: * 🔴 Broken Bench (Carrer Major) - Assigned to: Rafael Gómez.

🟡 In Progress: New Bike Lane (Sector 14) - Expected: 3 days.

Your Watchzone: A glowing blue radius around the user's home address.

Bottom Section: The "Rivalry Meter"

League Table: 1.  L'Eliana: 92% Efficiency
2.  Riba-roja: 88% Efficiency (+2% this week) 📈
3.  La Pobla: 81% Efficiency

Interaction: "Fix 3 more streetlights to overtake L'Eliana!"

🛠️ Feature Deep-Dive & Interaction Logic
A. The "Face of the Issue" (UX Interaction)

When a user taps an incident pin, the UI slides up a Politician Card:

Photo: Professional headshot of the Councilor.

Party: [PSOE / PP / Compromís / Vox] logo.

Stat: "This official fixes 85% of issues within 48 hours."

Action: [Button] "Nudge" (Sends an automated, professional tweet/email alert).

B. The "Trust but Verify" Loop (Telegram Integration)

Status Change: Official clicks "Fixed" + uploads a photo.

Community Ping: The Python backend identifies 3 verified users within 200m of the GPS pin.

Telegram Message: "Hey [Name], can you confirm the bench at Carrer Major is fixed? [Upload Photo]"

AI Validation: Gemini 1.5 Pro compares the 'Before' and 'After' photos. If it passes, the official gets +10 Prestige Points.

C. The "Ask Riba-roja" AI Chat

The Interaction: A floating chat bubble.

The Tech: Powered by the Vector Database.

Use Case: User asks: "Why is my trash not being picked up on Tuesdays anymore?"

The Answer: AI finds the specific contract change in the March 2026 minutes and explains the new schedule, citing the source PDF.

📜 The Developer "Ground Rules" File (rules.yaml)
To be fed into any LLM Agent coding the project.

YAML
project_name: CivicPulse_RibaRoja
core_stack: [FastAPI, PostGIS, pgvector, React_Native]
guidelines:
  - No_Hallucination: "AI must cite source URLs for all government data."
  - Proximity_First: "Notifications must be geo-fenced to user Watchzones."
  - Zero_Anonymity_Reports: "Reports require DNI/SMS verification to prevent political spam."
  - Multilingual: "Frontend: Spanish/Valencian. Backend Docs: English."
  - Verification_Logic: "A ticket is only 'Completed' after a neighbor's photo is AI-verified."
🚀 Next Steps for the Team
Devs: Initialize the FastAPI project and connect the PostGIS database.

Data Engineers: Run the first scrape of ribarroja.es and populate the Vector DB.

Designers: Finalize the "High-Stakes" UI for the Politician Scorecards.

Partnerships: Reach out to the Ayuntamiento to offer them the "Official Dashboard" login.