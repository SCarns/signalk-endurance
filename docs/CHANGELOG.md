# Release notes

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
