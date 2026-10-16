# Release notes

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
