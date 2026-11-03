## 2.2.0

- Use Endurance’s existing Auto theme and shared day/night/red palette in the compact chart window. Follow vessel day/night and navigation state rather than Freeboard’s separate chart appearance.
- Remove the redundant full-dashboard link and additional dashboard window from the chart integration. The standalone Endurance dashboard remains available as usual.

## 2.1.0

- Add a right-side hourglass control and compact status window through Freeboard’s existing Plotter Extensions API. Reuse Endurance’s current resource assessment and passage-readiness results.
- Add “Enable Freeboard integration”, default on. Switching it off withdraws the extension while resource monitoring, publication, and notifications continue.
- Follow Freeboard’s dark/light display state and open the full dashboard through its supported window API.

## 2.0.0

- Document WRP and Passage Brief's supported roles and add both to Signal K's
  Works with recommendations. Identify RouteIQ as planned support pending its
  saved passage-profile export.

- Add optional Passage Readiness: select a saved Weather Router Plus passage and
  compare its duration and sailing/motoring profile with monitored supplies and
  configured reserves. Existing standalone monitoring and alerts continue.
- Include Energy Predictor's detected-SOC forecast, minimum SOC and explicit
  horizon. Keep route-specific electrical load limitations visible.
- Offer a full-duration engine fuel allowance and an explicit planning burn rate.
  Automatic dashboard fuel estimates can reuse Passage Brief's setting when a
  positive live rate is unavailable, with source and permission limits visible.

- Give the passage outlook a full-width summary with timing, navigation context
  and vessel position, followed by individual resource cards matching Your
  Resources. Retain forecast coverage, rate provenance, reserves and missing-data
  states. Disabled resources remain excluded and enabled resources with missing
  estimates remain visible. RouteIQ completed-profile integration remains future
  work. Passage Readiness is disabled by default.

## 2.0.0-beta.4

- When no explicit planning override or positive live rate is available, the
  dashboard can reuse Passage Brief's configured fuel burn through the viewer's
  existing authenticated session. Identify its source and refresh it periodically;
  missing or inaccessible settings leave consumption unavailable.

- Add a browser-specific fuel allowance for engine use throughout the upstream
  plan's full duration. Keep the original sailing/motoring profile and ETA;
  identify this as a fuel budget rather than an all-motor travel-time prediction.

- Accept Energy Predictor's in-process Date forecast times as well as serialized
  ISO times; preserve freshness, reserve and forecast-horizon checks.
- Add an optional passage-only fuel burn estimate for planning while the engine
  is stopped. Label its source and show planned fuel quantity; standalone fuel
  endurance and alerts continue to use the configured live rate.

## 2.0.0-beta.3

- Keep the existing summary and Your Resources first, with Passage Readiness in
  its own section below them.
- Add a saved-route dropdown, with Active route first when available. Preserve
  browser selection and follow active-route changes without activating navigation.
- Show known route distance, Course API waypoint context and fresh vessel position.
  Keep full-route resource demand; no inferred remaining engine hours.
- Hide Passage Readiness when no usable upstream route estimates exist. No manual
  planning fallback. Retain resource gaps and energy horizon limitations within a
  usable passage assessment.
- Current passage estimates require supported Weather Router Plus metadata.
  Passage Brief and RouteIQ integration remain future work; inland coverage is
  limited to available upstream profiles.
- Publish under beta; stable 1.2.0 remains latest.

## 2.0.0-beta.2

- Read the active route through Signal K's Course API, as used by Freeboard.
  Retain the data-path fallback when the Course API is unavailable on older servers.
- Honor route cancellation, explicit selection and route changes during retrieval.
  A stale data path cannot override an empty authoritative Course API selection.
- Weather Router Plus route metadata is still required for passage assessment;
  a manually drawn Freeboard route alone has no verified passage operating profile.
- Add three Course API regression tests; existing assessments remain independent.

## 2.0.0-beta.1

- Add optional Passage Readiness using selected Weather Router Plus route
  resources and existing fuel/freshwater consumption rates and reserves.
- Read Energy Predictor hourly detected-equipment SOC forecast, report its
  minimum and actual coverage, and retain provisional status for unverified
  route-specific electrical loads. No duplicate routing or prediction engine.
- Reassess current supplies periodically with conservative full-route demand.
  Keep missing data visible and existing Endurance alerts and decisions separate.
- Add dashboard passage details, configuration, integration documentation and
  regression tests. Passage Briefing and RouteIQ were investigated; adapters
  remain deferred. Live aboard validation remains outstanding.
- Publish under the npm beta tag, retaining stable 1.2.0 as latest.

## 1.2.0

- Hide disabled resource cards and let remaining cards fill responsive rows,
  including embedded Freeboard views. Keep enabled resources visible without data.
- Convert authoritative fuel engine running seconds to estimatedDays; retain all
  seconds outputs and existing freshwater days. Propane days remains a direct
  conversion of its time, or null when no estimate exists. No new estimators.
- Preserve assessment, notification and optional integration behavior. Passage
  Brief passage-readiness remains a future Endurance 2.0 concept.

## 1.1.0

- Publish Endurance-specific estimatedDays from authoritative existing seconds,
  including explicit null invalidation and preview/live isolation.
- Add opt-in fuel rate mapping and conditional engine running duration, independent
  of chronological endurance and existing reserve alerts; no guessed consumption.
- Add manual crew override, validated shared roster and explicit fallback diagnostics.
  Retain independent freshwater learning and authoritative external total rates.
- Expose discovered-source freshness separately from valid measurements.
- Retain and regression-test individual holding alerts and incomplete tank coverage.
- Clarify optional companions, units, scope, upgrade and rollback.

## 1.0.2

- Distinguish null, missing, stale and invalid battery duration without changing SOC,
  forecast or alert decisions. Document optional Log Book notification integration.

## 1.0.1

- Fix forecasts disappearing after five minutes: use an independent configurable
  `resources.energy.predictionStaleSeconds` window, default two hours, matching
  Energy Predictor's default hourly refresh with allowance for one delayed cycle.
- Keep measured SOC and battery duration freshness unchanged, including standalone
  SOC fallback when the optional forecast is missing or expired.

# Release notes

## 1.0.0

- Promote the reviewed initial plugin and dashboard to v1.0.0.
- Document using published Signal K paths in KIP, WilhelmSK, and other displays.
- Correct the WebApps selection icon path to be relative to the public directory.
- List optional Derived Data, Energy Predictor, and Water Consumption Estimator integrations.
- Prepare npm/App Store metadata and include the icon for both package and webapp paths.

## 0.1.0-alpha.7

- Replace setup prose with a responsive, one-page resource dashboard and alerts.
- Show combined tank volumes, water duration and learning status, battery SOC and forecast.
- Add remembered display units and manual theme icon and separate Auto button at the top right.
- Auto follows vessel day/night mode, using Red during night sailing or motoring.
- Neutralize stale or disconnected assessments and support read-only dashboard viewers.

## 0.1.0-alpha.6

- Add the approved brass hourglass over open water as the app icon and browser icon,
  matching the Barometer visual style.

## 0.1.0-alpha.5

- Discover the standard Energy Predictor status when its optional path is blank.
- Discover time remaining from the selected SOC battery bank when its path is blank.
- Keep explicit paths authoritative and retain freshness and ambiguity checks.
- Show resolved energy paths and their selection/freshness on the setup page.
- Explain the optional Energy Predictor integration in configuration and setup, and
  show whether usable forecast status data was found.

## 0.1.0-alpha.4

- Add a saved input-unit dropdown: Litres (default), US gallons, or m³.
- Apply the selection to manual tank capacities and freshwater daily usage allowances.
- Convert manual volume inputs to m³ at the configuration boundary; calculations and
  published rates use m³/s and durations use seconds. Signal K path inputs retain
  their existing SI interpretation.
- Migrate prior m³ capacities and litre-based allowances to the new editable fields
  and save the selected units. Preserve learned history while converting stored
  daily rates to SI rates.

## 0.1.0-alpha.3

- Add independent internal boat-wide freshwater usage estimation; no copied CE code
  or CE runtime dependency. The implementation remains MIT licensed.
- Learn from summed usable tank volume, with one default allowance for the whole
  crew and separate learned histories per crew count. Tank switching is transparent.
- Reject unsettled/noisy inputs, refills, detected transfers, gaps and implausible
  changes. Pause learning underway or by configuration.
- Preserve learned rates across restarts; do not carry observation intervals across
  restarts or changes to the selected supply.
- Label default, learning, learned and external estimates. Provisional default
  durations do not generate forecast-based intervention alerts.
- Publish freshwater consumption rate in m³/s and duration in seconds, and show days
  remaining to empty on the setup page.
- Retain explicit external-rate configuration and existing single/multi-tank settings.

## 0.1.0-alpha.2

- Use SOC labels for energy and Level labels for tank systems.
- Add multiple configurable freshwater, fuel, propane, and holding tanks.
- Calculate full-capacity, current-volume, and free-space totals in m³, with
  capacity-weighted combined levels.
- Reuse calibrated current volumes; calculate level × capacity only when no current
  volume source exists. Capacity may come from a static Signal K path or configuration.
- Preserve individual fuel/propane/holding alerts; offer combined usable-supply
  assessment for freshwater, fuel, and propane.
- Calculate freshwater duration from the selected tank volumes and a total rate.
- Expose per-tank results, completeness, discovery paths, and SI metadata.
- Rewrite setup and installation guidance for standalone installation.
- Keep existing single-source configurations supported.

## 0.1.0-alpha.1

Initial standalone resource monitoring, discovery, guided setup, and preview/live
Signal K assessment publishing.
