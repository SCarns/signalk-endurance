# Node-RED reference and intentional differences

Reference inspected: local `outputs/Endurance-2.3.json` (not included in the package).
SHA-256: `9fdd2ef696d57488be67410f72f4017f924675dff9a9b1f8c9e00abe28b3b82a`.
The original export is preserved. No Node-RED deployment has been performed.

The test directory retains only the constants and energy/fuel/propane function
bodies for reproducible comparison, without deployment configuration. Tests compare
303 measured levels against those original functions. This is not full flow parity.

Intentional changes:

- Missing/null data is not converted through `Number(null)` to a measured zero.
- Sensor timestamps determine freshness; polling does not renew old inputs.
- Fuel or propane interventions identify the actual responsible resource, fixing
  the reference decision's use of a water/energy chronological resource for these
  actions. No-action results retain `limitingResource: none`.
- Freshwater works from levels without a consumption plugin. Optional duration
  still uses to-empty volume/rate and the reference 24/48-hour windows.
- Multiple battery banks or tanks require selection. No boat-specific aggregation
  or averaged consumption from two sensors is assumed.
- Holding tank assessment is new, using high-level rather than low-level urgency.
- BMV-specific infinite duration interpretation is deferred to an explicit adapter.
- Watermaker-specific actions are replaced by generic replenishment actions.
- Unavailable durations publish null to invalidate previous estimates.
- Preview output and disabled notifications preserve the parallel comparison path.

The reference export's water rate assumptions differ from the locally inspected
Consumption Estimator 0.3.1 source. Explicit units are required; no heuristic
conversion is safe across provider versions.
