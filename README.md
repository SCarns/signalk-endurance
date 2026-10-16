# Stop watching gauges. Go sailing.

**Endurance isn't another gauge. It's the thing that watches the gauges so you don't have to.**

Endurance is a standalone Signal K plugin that monitors energy, freshwater, fuel,
propane, and holding tanks, then explains which resource needs attention. It supports
multiple tanks in each tank system and calculates their combined capacity and volume.
Energy Predictor, Consumption Estimator, and Derived Data are optional sources, never
dependencies. There are no runtime package dependencies. MIT licensed.

## Install

From your Signal K configuration directory (usually `~/.signalk`):

```sh
npm install github:SCarns/signalk-endurance
```

Or install a downloaded package with `npm install /absolute/path/signalk-endurance-0.1.0-alpha.2.tgz`.
Restart Signal K, enable **Endurance** in **Server → Plugin Config**, then open its
webapp at `/signalk-endurance/`. Administrator login is required for its setup API.
For Docker, install inside the server container in its configuration directory.

Requires Node.js 18+ and standard Signal K Node plugin APIs. This is an alpha tested
locally with synthetic readings and package installation checks; onboard validation
is still required.

## Configure your resources

Energy uses **SOC**. Freshwater, fuel, propane, and holding systems use tank **Level**.
Both are numeric ratios: 0.5 means 50%. Disable resources your boat does not carry.

One discovered source is selected automatically. Multiple battery banks require an
explicit SOC path. To monitor multiple tanks, add each tank to that resource's
**Tanks** list. A single-tank Level path remains supported for existing configurations;
use either that field or the Tanks list.

Each tank has:

- **Name** and **Include this tank** controls.
- **Level path**, such as `tanks.freshWater.port.currentLevel`.
- **Current volume path**, in m³. Blank discovers the tank's `currentVolume`, then
  `remaining`. This accepts calibrated volumes from providers such as Derived Data.
- **Full capacity path**, in m³. Blank uses the tank's `capacity` path.
- **Full capacity in m³**, an optional fixed value that takes precedence over the
  capacity path. Leave zero to use the path. For example, 100 litres is 0.1 m³.

Full capacity is the volume when full. Current volume is what's in the tank now.
Capacity is a fixed vessel property and does not expire with the sensor freshness
window. Current volume and level readings must be fresh.

When a current-volume source exists, Endurance uses it rather than replacing its
calibration with a linear calculation. If it becomes invalid or stale, Endurance
leaves the volume unknown. If no volume source exists, Endurance can calculate
`level × full capacity`; this assumes the level ratio represents volume fraction.
Use calibrated volume for shaped tanks whose sender measures fluid height.

## Multiple tanks and totals

Each system publishes every selected tank's assessment and combined:

- Full capacity: sum of tank capacities.
- Current volume: sum of current tank volumes.
- Available volume for supply tanks, or remaining free space for holding tanks.
- Level ratio: total current volume divided by total full capacity.

Two 100 L and 300 L freshwater tanks at 50% and 100% contain 350 L out of 400 L:
87.5% overall. Simply averaging their levels would give the wrong answer.

The same model supports two fuel tanks, multiple propane tanks, and multiple holding
tanks. Only configured, enabled tanks contribute; discovery does not automatically
combine every source, which could include virtual totals or duplicate sensors.
Never add both a virtual total and the physical tanks making up that total.

A missing or stale tank volume makes the combined current volume unavailable. A
missing capacity makes the combined capacity and weighted level unavailable. Missing
data is never silently treated as zero or omitted to present a partial sum as the
whole supply. Per-tank results and total completeness remain visible.

## Combined or individual assessment

**Freshwater defaults to combined supply.** Once all volumes and capacities are
available, urgency follows the combined weighted level. An empty tank does not by
itself mean the boat is out of water. A complete current-volume total can also feed
an optional duration estimate without requiring capacity values.

**Fuel and propane default to individual tanks.** A low tank can need attention even
when another is full, particularly where switching or transfer is required. The
combined inventory is still available. Choose **combined** only when all selected
tanks can be treated as one usable supply. Endurance does not operate valves or
track which tank is actively feeding an engine.

**Holding tanks always retain individual alerts.** Spare room in one cannot cancel
a full tank elsewhere. Combined remaining space is additional information.

In combined mode with incomplete inputs, a known low-tank warning remains visible;
healthy partial readings cannot establish that the combined supply is healthy.

## Discovery and thresholds

| Resource | Automatic level / SOC candidates | Warning / critical defaults |
| --- | --- | --- |
| Energy | `electrical.batteries.<id>.capacity.stateOfCharge` | ≤ 0.70 / ≤ 0.50 |
| Freshwater | `tanks.freshWater.<id>.currentLevel` | ≤ 0.35 / ≤ 0.20 |
| Fuel | `tanks.fuel.<id>.currentLevel` | ≤ 0.30 / ≤ 0.20 |
| Propane | `tanks.lpg.<id>.currentLevel`; `tanks.gas.<id>.currentLevel` with type `lpg` | ≤ 0.25 / ≤ 0.10 |
| Holding | `tanks.holding`, `tanks.wasteWater`, or `tanks.blackWater` → `<id>.currentLevel` | ≥ 0.75 / ≥ 0.90 |

Review thresholds for your battery chemistry, reserves, and operating practices.
Freshness defaults: energy 300 seconds, freshwater/fuel/holding 1200 seconds, propane
86400 seconds. Missing timestamps, nonnumeric readings, and timestamps over five
seconds in the future are rejected. Polling does not refresh a sensor's timestamp.
The server's preferred-source model values are used.

## Optional estimates

- **Energy forecasts:** configure `predictionPath`. Healthy measured SOC plus
  `deficit` gives informational WATCH; forecast `critical` gives WARNING. Measured
  low SOC takes priority. A missing forecast does not prevent SOC assessment.
- **Battery duration:** configure `timePath` for a numeric duration in seconds.
  Device-specific infinite/240-hour sentinels are not inferred.
- **Freshwater duration:** configure one **total freshwater consumption rate** and
  its actual units, `m3/s` or `L/day`. With a Tanks list, Endurance uses the sum of
  current volumes; no external total-volume calculation is needed. For an existing
  single-tank setup, an explicit `volumePath` remains supported.
  Duration to empty is `total current volume / total consumption rate`. It adds
  critical/warning conditions at 24/48 hours. Level thresholds separately protect
  reserves. Verify the installed consumption provider's units and whether a rate
  represents total consumption; Endurance does not sum or average repeated forecasts.

Fuel engine-running time and propane estimates are excluded from chronological
endurance. Overall duration uses available freshwater and battery estimates and is
not an all-resource guarantee.

## Verify and enable

Preview mode publishes under `environment.endurancePreview` with notifications off.
Check selected sources, tank totals, freshness, and thresholds. Then enable live
publishing to `environment.endurance` in Plugin Config. Visual notifications are a
separate option; only WARNING and CRITICAL notify. Identical notifications are
suppressed and resolved interventions clear the notification.

Every critical condition precedes every warning. Equal severity follows freshwater,
energy, fuel, propane, then holding. WATCH is informational. Partial healthy resource
coverage is explicit; no valid resource data gives UNKNOWN. Within multi-tank
systems, missing selected tanks cannot silently produce a healthy full-system result.

## Published data

Under the selected preview/live prefix:

- `status`, `action`, `reason`, `message`, `limitingResource`, and `coverage`.
- `time`, `energyTime`, `waterTime`: seconds or null when unavailable.
- `resources.<system>.status`, `.action`, `.reason`, `.time`.
- For tank systems, `resources.<system>.tanks`: each tank's inputs, freshness, status,
  capacity, current volume, free space, and volume calculation method.
- `resources.<system>.totals.capacityM3`, `.currentVolumeM3`, `.availableVolumeM3`,
  `.freeVolumeM3`: m³ or null. Names explicitly state the units.
- `resources.<system>.totals.levelRatio`, `.complete`, `.selectedTanks`, `.volumeTanks`.

`limitingResource` names the selected intervention's resource, or `none` when action
is `NONE`. Unavailable totals/durations publish null to invalidate earlier estimates.

`GET /plugins/signalk-endurance/discovery` returns candidates, capacity/volume paths,
and configuration. `GET /plugins/signalk-endurance/assessment` returns full inputs and
results. Stopped plugins return no assessment. Standard router authentication applies.

## Rollback and development

Disable Endurance in Plugin Config and restart the server to stop its updates.
Cached values retain their original timestamps. Clear any lingering notification in
your client. To uninstall, run `npm uninstall signalk-endurance` from the server's
configuration directory and restart.

```sh
npm test
npm pack
```

See [acceptance checks](docs/ACCEPTANCE.md) and [release notes](docs/CHANGELOG.md).
Future work includes active supply selection, source adapters, notification hysteresis
and reminders, and optional passage readiness. Generalized consumption learning is
outside this release.

Signal K conventions: [plugin interface](https://demo.signalk.org/documentation/_signalk/server-api/Plugin.html),
[data processing](https://demo.signalk.org/documentation/Developing/Plugins/Processing_Data.html),
and [vessel data keys](https://signalk.org/specification/1.5.0/doc/vesselsBranch.html).
