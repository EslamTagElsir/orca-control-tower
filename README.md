# ORCA Command

ORCA Control Tower — Enterprise Frontend Rebuild

You are an expert senior frontend architect, React/TypeScript engineer, UX/UI designer, and data visualization engineer.

I have attached two references to this project:

The existing ORCA project ZIP

A target UI screenshot of an enterprise Supply Chain Control Tower

Your task is to inspect the existing project first, understand its architecture and APIs, and then rebuild/improve the frontend into a production-quality ORCA Control Tower inspired by the attached screenshot.

This is NOT a request to create a generic dashboard from scratch.

The existing project contains an operational/ML backend and an existing frontend. Preserve the existing intelligence layer and backend architecture. Improve and rebuild the presentation and interaction layer.

1. PRIMARY OBJECTIVE

Transform the current ORCA frontend into a polished, enterprise-grade:

ORCA CONTROL TOWER

with the positioning:

Real-time Supply Chain Decision Intelligence

The final interface should feel like a serious enterprise logistics command center used by operations managers, supply-chain analysts, and decision makers.

The attached screenshot is the visual and UX reference, not a source of fake data.

Use its:

visual hierarchy

dark enterprise aesthetic

information density

dashboard composition

KPI cards

maps

exception panels

event stream

tables

charts

shipment timeline

risk visualization

operational feel

But adapt everything to the actual ORCA project structure and available APIs/data.

2. VERY IMPORTANT ARCHITECTURAL RULE

Do NOT rebuild the Python ML system inside Lovable.

Do NOT replace the existing FastAPI intelligence layer.

Do NOT rewrite the prediction models.

Do NOT remove or bypass the existing model-serving architecture.

The intended architecture is:

Browser
↓
ORCA React / TypeScript Frontend
↓
FastAPI API
↓
ORCA ML / Decision Intelligence Layer

The frontend is the experience and decision layer.

The existing backend remains the intelligence layer.

3. FIRST ACTION — INSPECT THE PROJECT

Before making major UI changes:

Inspect the attached ZIP.

Identify the existing frontend architecture.

Identify all relevant routes/pages/components.

Identify the FastAPI endpoints.

Identify the existing API response shapes.

Identify the existing demo/scenario functionality.

Identify existing charts, maps, tables, risk calculations, SHAP explanations, shipment tracking, and decision logic.

Reuse working components and APIs whenever possible.

Do not create duplicate backend logic unnecessarily.

Look specifically for functionality related to:

/health

/predict

/explain

/recommend

/demo/overview

/demo/shipments/{shipment_id}

/demo/scenarios

/demo/scenario

and any existing frontend proxy/API layer.

Before replacing something, determine whether it already works and should be preserved.

4. TARGET PRODUCT

The final product should feel like:

Bloomberg Terminal + modern logistics control tower + AI decision intelligence platform

but with a clean, modern, restrained enterprise aesthetic.

It must look like a real product rather than:

a student dashboard

a generic admin panel

a collection of unrelated charts

a template dashboard

a static Figma mockup

The interface must communicate:

Sense → Predict → Explain → Simulate → Decide

5. VISUAL DIRECTION

Use the attached screenshot as the primary visual reference.

Design language:

dark navy / midnight background

subtle blue-gray surfaces

restrained borders

high information density

strong hierarchy

compact but readable typography

professional enterprise tables

glowing/soft emphasis for important risk signals

restrained use of colors

green for healthy / improving

amber for warnings / medium risk

red for critical/high risk

blue for neutral / primary intelligence

purple only where useful for predicted/AI-driven metrics

Avoid excessive gradients, excessive glow effects, or gaming-style UI.

The result should look like an enterprise operational system.

6. GLOBAL APPLICATION SHELL

Create a persistent application shell containing:

Left Sidebar

Brand:

ORCA
CONTROL TOWER

Navigation:

Control Tower

Shipments

Exceptions

Network Map

Analytics

What-If Simulator

Decision Economics

Reports

Model Monitor

Settings

The sidebar must support:

active state

hover state

compact/collapsed behavior

clear icons

professional enterprise spacing

Top Navigation

Include:

hamburger/menu control

live/demo mode indicator

shipment/scenario selector where relevant

New Scenario action

Reset Demo action

notification indicator

current date/time

user/avatar

Make the header feel like an operational command center.

7. MAIN CONTROL TOWER DASHBOARD

Create the primary dashboard based on the attached screenshot.

The first viewport should immediately communicate the health of the entire logistics network.

Use a KPI row similar to:

Total Shipments

At Risk Shipments

Critical Exceptions

Predicted Delay Exposure

On-Time Performance

Average Risk Score

Each KPI card should include:

label

primary metric

trend/change indicator

comparison to previous period when available

subtle contextual visualization when useful

Do not invent numbers that are not supported by the project.

Use actual API/demo data whenever available.

If the API only provides simulated/demo values, make the UI clearly communicate that the data is demo/simulated rather than presenting it as real-world operational truth.

8. RISK HEAT MAP

Create a large network risk map section.

It should visually communicate:

geographic risk concentrations

important shipment regions

major logistics corridors

origin/destination clusters

risk intensity

Use an actual interactive map implementation when practical.

The map should support:

zoom

pan

tooltips

risk markers

risk-level visualization

Do not create a decorative fake map if a functional map can be implemented.

Use project data/API responses.

9. EXCEPTION SUMMARY

Create an exception distribution visualization.

Examples of categories may include:

Weather

Carrier Delay

Port Congestion

Equipment

Documentation

Other

Use real available ORCA categories/data.

Use a clean donut/ring visualization.

Center display should communicate the total number of exceptions.

Provide an adjacent legend with:

category

count

percentage

10. LIVE EVENT STREAM

Create a professional operational event stream.

Each event should include:

timestamp

event type/title

affected shipment/asset where available

severity

short description

Use visual severity levels:

LOW
MEDIUM
HIGH
CRITICAL

Make the feed feel live and operational.

If the project only has simulated/demo events, clearly preserve the project's demo semantics.

11. PRIORITY EXCEPTIONS TABLE

Create a dense enterprise table for the highest-priority exceptions.

Columns should include where supported:

Shipment

Origin → Destination

Issue

Risk Score

Predicted Delay

Severity

Recommended Action

Actions

Features:

sorting

filtering

search

severity badges

hover states

row selection

shipment drill-down

Use real ORCA data.

Do not hardcode rows when the API can provide them.

12. TOP RISKY LANES

Create a horizontal bar chart showing the highest-risk logistics lanes.

Each row:

Origin → Destination
Risk %

Allow the component to handle dynamically changing API data.

13. PORT / NODE CONGESTION

Create a compact operational panel for:

Port

Congestion score

Trend

Direction

Risk impact

Make trends visual and easy to scan.

14. SHIPMENT TRACKING TIMELINE

Create a shipment lifecycle timeline.

Possible states:

Order Confirmed

Picked Up

Departed Origin

In Transit

Arriving Destination

Delivered

Use the actual shipment data from ORCA.

The active stage should be visually emphasized.

Show dates where available.

The timeline must work dynamically for selected shipments.

15. RISK SCORE TREND

Create a time-series visualization for shipment/network risk.

The visualization should communicate:

historical risk

trend

latest risk

trend direction

Add tooltips and professional axis formatting.

Avoid unnecessary chart decoration.

16. RISK DISTRIBUTION

Create a risk distribution donut or equivalent visualization:

Low

Medium

High

Use actual ORCA thresholds and data when available.

The visualization should immediately communicate network exposure.

17. SHIPMENT INTELLIGENCE

Create a dedicated shipment detail experience.

When the user selects a shipment, provide:

Shipment ID

Origin

Destination

Current state

Risk score

Risk tier

Predicted delay

Severity

Carrier/vendor information where available

Fulfillment/shipping information where available

Timeline

Risk drivers

SHAP/explanation information

Recommended actions

Make this feel like an operational investigation workspace.

18. AI EXPLAINABILITY

ORCA already contains explainability functionality.

Expose it clearly in the UI.

Show:

Why is this shipment at risk?

Display:

top risk drivers

SHAP contributions

positive/negative contributors

evidence/confidence information where available

Use clear visual encoding.

Do not expose raw ML complexity unnecessarily.

Translate model outputs into decision-oriented language.

19. WHAT-IF SIMULATOR

Build the existing ORCA scenario functionality into a professional interactive simulator.

Users should be able to modify scenario variables supported by the backend.

Examples may include:

route conditions

carrier behavior

delays

congestion

weather

logistics conditions

The interface should show:

Baseline

versus

Scenario

Then visualize:

risk change

predicted delay change

severity change

operational impact

economic impact

recommendation

This should feel like a real decision-support tool.

20. DECISION ECONOMICS

Create a dedicated decision/economics section.

Show where supported:

expected delay cost

expected exposure

intervention cost

potential avoided loss

ROI

recommended action

Very important:

Do not imply simulated economics are realized savings.

Preserve the project's evidence/provenance distinction.

Clearly distinguish:

real/source data

model output

simulation

estimates

exploratory values

21. DATA PROVENANCE / TRUST

ORCA has an important methodological requirement.

The frontend must make it easy for users to distinguish between:

REAL SOURCE DATA

MODEL OUTPUT

SIMULATED OPERATIONAL DATA

ESTIMATED / EXPLORATORY VALUES

Use subtle but clear labels.

Do NOT blur simulated values into production-looking facts.

This is important for both research credibility and enterprise trust.

22. RESPONSIVENESS

The application must work well on:

desktop

laptop

tablet

Desktop is the primary target.

The dashboard should not simply shrink everything on smaller screens.

Use responsive layout strategies so that:

tables remain usable

cards reflow intelligently

maps maintain useful dimensions

charts remain readable

sidebar behavior is controlled

critical actions remain accessible

23. COMPONENT ARCHITECTURE

Build reusable components rather than one huge page.

Suggested structure:

components/

AppShell

Sidebar

TopBar

KPIGrid

KPICard

RiskHeatMap

ExceptionSummary

EventStream

PriorityExceptions

RiskyLanes

PortCongestion

ShipmentTimeline

RiskTrend

RiskDistribution

ShipmentDetails

RiskDrivers

ScenarioSimulator

DecisionEconomics

EvidenceBadge

SeverityBadge

EmptyState

LoadingState

ErrorState

Keep components modular and reusable.

24. DATA / API ARCHITECTURE

Create a clean frontend API/service layer.

Do not scatter fetch calls throughout UI components.

Centralize API interaction.

Handle:

loading states

API errors

empty states

retries where appropriate

malformed responses

unavailable endpoints

Respect existing FastAPI contracts.

Do not change backend contracts unless absolutely necessary.

If a frontend adapter is required to map an API response into a UI model, implement the adapter in the frontend rather than changing the backend unnecessarily.

25. PERFORMANCE

The Control Tower may contain many visual components.

Optimize for:

efficient rendering

stable component structure

memoization where useful

avoiding unnecessary re-fetching

avoiding duplicate API calls

lazy loading for non-critical screens

chart efficiency

Do not sacrifice usability for unnecessary animation.

26. INTERACTION QUALITY

The application should feel alive but not distracting.

Use subtle transitions for:

cards

panel expansion

selected rows

navigation

filters

chart interactions

state changes

Use animations primarily to communicate state changes.

Avoid excessive motion.

27. LOADING / ERROR / EMPTY STATES

Every major data-driven component needs proper states.

Examples:

Loading:

skeletons

Error:

clear error message

retry action

Empty:

concise explanation

appropriate next action

Do not leave blank white/dark areas when data is unavailable.

28. DEMO MODE

The project already contains demo functionality.

Preserve and improve it.

The top bar should make the mode obvious.

Support where already available:

current demo shipment

scenario selector

next event

reset demo

time progression

auto-play

Demo mode should feel like a product simulation rather than a developer test page.

29. NAVIGATION / ROUTES

Create a coherent application structure.

At minimum support:

/control-tower
/shipments
/exceptions
/network-map
/analytics
/simulator
/decision-economics
/reports
/model-monitor
/settings

Use the same design system across all sections.

The Control Tower should be the flagship screen.

30. MODEL MONITOR

Create a professional Model Monitor screen using whatever model-health information already exists in the project.

Potential sections:

model version

prediction health

validation metrics

calibration

uncertainty

recent model activity

monitoring indicators

Do not fabricate model metrics.

Only display metrics available in the project.

31. REPORTS

Create a report-oriented page that provides a structured summary of:

network risk

exceptions

risky lanes

delay exposure

decisions

shipment risk

Prefer reusable cards and tables.

Do not generate fake PDF data unless the existing project supports report generation.

32. SETTINGS

Create a clean settings page for application-level configuration supported by the project.

Include reasonable sections such as:

interface

demo mode

refresh behavior

notifications

risk preferences

Do not add meaningless enterprise settings just for visual completeness.

33. DESIGN SYSTEM

Create a consistent design system.

Define reusable tokens for:

background

panels

borders

text hierarchy

muted text

primary accent

success

warning

danger

critical

spacing

radius

typography

Maintain visual consistency across all screens.

34. ACCESSIBILITY

Implement good accessibility practices:

semantic HTML

keyboard navigation

visible focus

sufficient contrast

meaningful labels

chart accessibility where practical

aria labels for icon-only controls

Do not depend on color alone to communicate severity.

35. IMPORTANT DATA INTEGRITY RULES

Do NOT invent:

shipment records

ML metrics

risk scores

savings

operational events

model performance

business outcomes

when those values are not available.

Use project/demo data.

When simulated, label it.

When unavailable, show an intentional empty state.

36. IMPLEMENTATION STRATEGY

Implement in this order:

Phase 1 — Foundation

Inspect existing project

Preserve architecture

Establish global theme

Build app shell

Sidebar

Top bar

routing

design tokens

Phase 2 — Control Tower

KPI cards

Risk Heatmap

Exception Summary

Live Event Stream

Priority Exceptions

Risky Lanes

Port Congestion

Shipment Timeline

Risk Trend

Risk Distribution

Phase 3 — Intelligence

Shipment Intelligence

SHAP/risk drivers

explainability

recommendations

evidence/provenance

Phase 4 — Decision Support

What-If Simulator

Decision Economics

Phase 5 — Supporting Areas

Analytics

Reports

Model Monitor

Settings

Phase 6 — Quality

responsiveness

accessibility

loading states

error states

empty states

performance

polish

37. CRITICAL IMPLEMENTATION RULE

Do not stop at designing a static visual mockup.

Build working UI.

Buttons must work.

Navigation must work.

Filters must work where supported.

Shipment selection must work.

Scenario interactions must work where supported.

API calls must work.

Charts must use real project data.

The dashboard must be a functional application.

38. VISUAL QUALITY BAR

Compare the finished result against the attached screenshot continuously.

The final application should match the screenshot's level of:

information density

polish

hierarchy

visual confidence

enterprise feel

clarity

operational usability

But the final data and functionality must come from ORCA.

Do not copy meaningless visual decoration.

39. FINAL ACCEPTANCE CRITERIA

The implementation is successful when:

The ORCA frontend feels like a real enterprise control tower.

The attached screenshot is clearly reflected in the design language.

Existing FastAPI intelligence remains functional.

Existing ML/decision functionality is preserved.

The Control Tower is the primary flagship screen.

Shipment drill-down works.

Exceptions are actionable and visually clear.

Risk is immediately understandable.

What-If functionality is integrated into the UI.

Explainability is exposed clearly.

Data provenance is visible.

No unsupported numbers are fabricated.

The UI works with the actual ORCA APIs/data.

The application is responsive.

The interface feels polished enough for an academic defense AND a professional product demonstration.

40. START NOW

Do not ask me to redesign the architecture first.

Start by inspecting the attached ORCA ZIP and the attached screenshot.

Understand the existing application.

Then begin implementing the improved ORCA Control Tower frontend.

Prioritize the Control Tower flagship screen first, while ensuring the architecture you build can support the remaining pages.

Use the existing project wherever possible rather than replacing working functionality unnecessarily.

The goal is:

ORCA V3 → Enterprise ORCA Control Tower

with the existing intelligence preserved underneath a substantially improved frontend experience.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://orca-control-tower.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/5f9c9dc3-04f6-409f-8f74-c04ca6fc140c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
