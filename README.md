# Stop watching gauges. Go sailing.

**Endurance isn't another gauge. It's the thing that watches the gauges so you don't have to.**

Endurance is an open-source, standalone Signal K plugin that watches energy,
freshwater, diesel fuel, propane, and holding tanks, and explains which resource
needs attention. Energy Predictor, Consumption Estimator, and Derived Data are
optional sources, never dependencies. There are no runtime package dependencies.

## First milestone: 0.1.0-alpha.1

An installable development preview with five resource modules, automatic discovery,
a guided setup page, and a shared decision engine. It reads the local vessel's
Signal K model and publishes timestamped assessments every 10 seconds by default.
This release has local synthetic and Node-RED comparison tests; it has **not yet
been validated on a running vessel's Signal K server**.

Defaults publish to `environment.endurancePreview.*` without notifications, allowing
the existing Node-RED flow to keep operating as the reference. Live output is an
explicit setting. This alpha does not control equipment.

## Install and configure

Requires Node.js 18 or newer and a Signal K server supporting standard Node plugins,
`getSelfPath`, `handleMessage`, JSON Schema configuration, and webapps.

1. Copy `signalk-endurance-0.1.0-alpha.1.tgz` to the Signal K host.
2. From the **server's configuration directory** (normally `~/.signalk`), run:

   ```sh
   npm install /absolute/path/signalk-endurance-0.1.0-alpha.1.tgz
   ```

   For Docker, the directory and package must be accessible inside the server
   container; install there with the same user that owns its configuration.
3. Restart Signal K. Open **Server → Plugin Config → Endurance**, enable the plugin,
   and save with preview defaults.
4. Open Endurance from Webapps, or `/signalk-endurance/`. The setup page requires
   administrator login for its read-only plugin API routes.
5. Review discovered paths and reserve settings. Disable resources you don't carry.
   Where more than one source exists, enter the correct path in Plugin Config.
6. Verify `/plugins/signalk-endurance/assessment` and compare
   `environment.endurancePreview` with Node-RED over representative conditions.

No boat addresses, credentials, or vessel-specific paths are bundled.

## Discovery and guided configuration

| Resource | Automatic candidate paths | Warning / critical defaults |
| --- | --- | --- |
| Energy | `electrical.batteries.<id>.capacity.stateOfCharge` | ≤ 0.70 / ≤ 0.50 |
| Freshwater | `tanks.freshWater.<id>.currentLevel` | ≤ 0.35 / ≤ 0.20 |
| Fuel | `tanks.fuel.<id>.currentLevel` | ≤ 0.30 / ≤ 0.20 |
| Propane | `tanks.lpg.<id>.currentLevel`; `tanks.gas.<id>.currentLevel` when its type is `lpg` | ≤ 0.25 / ≤ 0.10 |
| Holding | `tanks.holding`, `tanks.wasteWater`, or `tanks.blackWater` → `<id>.currentLevel` | ≥ 0.75 / ≥ 0.90 |

A single candidate is selected automatically. Multiple candidates require an explicit
selection; Endurance does not guess a house bank, average tanks, or add tank levels.
Paths are rediscovered every cycle, so newly appearing sensors are detected. Review
choices after adding hardware. A configured path never silently falls back to another.
The server's preferred model value and its original timestamp/source are used.

Ratios must be numeric values from 0 to 1. Nulls, strings, booleans, out-of-range
values, missing timestamps, and stale readings remain unknown. Freshness defaults:
energy 300 seconds, freshwater/fuel/holding 1200 seconds, propane 86400 seconds.
Timestamps more than five seconds in the future are rejected.

Battery chemistry and usable reserves vary: these inherited defaults need review.
Freshwater actions say "replenish" so a watermaker is not assumed.

## Optional estimates

- **Energy Predictor:** configure `predictionPath` explicitly. Healthy measured SOC
  plus `deficit` produces informational WATCH; forecast `critical` produces WARNING.
  Measured low SOC always takes precedence. Missing forecasts are benign.
- **Battery monitor:** configure `timePath` for a numeric duration in seconds.
  Device-specific infinite/240-hour sentinels are not inferred in this generic alpha.
- **Freshwater consumption:** configure both `volumePath` (available m³) and
  `consumptionPath`, plus `consumptionUnits` (`m3/s` or `L/day`). Current Consumption
  Estimator source uses m³/s; the older Node-RED reference expects L/day. Verify the
  installed provider. Endurance never guesses units from the path name.
  Duration is to empty, matching the reference flow: `volume / rate`. It adds
  critical/warning conditions at 24/48 hours; level reserve checks still apply.

Measured levels alone are enough to run the plugin. Fuel engine-running time and
propane estimates are excluded from chronological endurance. An overall duration
uses only available energy/freshwater estimates; it is not an all-resource guarantee.

## Decision and output contract

Every critical condition precedes every warning. Ties use freshwater, energy, fuel,
propane, then holding. All resource results remain available even when only one
intervention is selected. WATCH is informational. Healthy partial coverage gives OK
with `PARTIAL_DATA_HEALTHY`; coverage lists the unknown resources. No valid inputs
produces UNKNOWN, never a claim that all resources are healthy.

Under `environment.endurancePreview` (or `environment.endurance` in live mode):

- `status`: `UNKNOWN`, `OK`, `WATCH`, `WARNING`, or `CRITICAL`.
- `action`, `reason`, `message`: machine-readable decision and human explanation.
- `limitingResource`: the resource requiring the selected intervention, or `none`
  whenever action is `NONE`.
- `time`, `energyTime`, `waterTime`: seconds, or **null** to invalidate an unavailable
  estimate; never zero in place of missing data.
- `coverage`: monitored count, valid count, and unknown resource names.
- `resources.<name>.status`, `.action`, `.reason`, `.time`: individual assessments.

`GET /plugins/signalk-endurance/discovery` returns candidates and active configuration.
`GET /plugins/signalk-endurance/assessment` includes the full assessment, input ages,
source labels, selection reasons, and output prefix. Disabled/stopped plugins return
no assessment. Standard Signal K router authentication applies.

## Live switch and rollback

After comparison succeeds, disable the existing Node-RED **Endurance and notification
publishers** before enabling `publishLive`. Enable visual notifications separately
if desired. Only real interventions notify; identical messages are suppressed.
A resolved intervention publishes a null notification to clear it. UNKNOWN does
not notify; examine coverage to distinguish missing data from healthy resources.

For rollback: disable this plugin first, turn its notifications off, and restore the
Node-RED publishers. Restart the server. Cached readings can remain visible under
the previous source; their timestamps no longer advance. Clear any lingering Endurance
notification through the server/client if required. Optionally uninstall from the
server config directory with `npm uninstall signalk-endurance` and restart.

## Development and milestones

```sh
npm test
npm pack
```

1. **This alpha:** installable package, discovery, guided configuration, measured
   resource assessment, optional explicit estimates, Signal K publishing, and tests.
2. **Boat validation:** install on TBD, confirm actual paths/units/source priorities,
   compare decisions and stale-data transitions, test stop/restart and rollback.
3. **Next increments:** confirmed multi-tank grouping, source adapters, notification
   hysteresis/reminder policy, and broader recorded-data comparisons.
4. **Future:** passage readiness integration. Generalized consumption learning is
   outside the first release.

The Node-RED source remains untouched. See [reference notes](docs/REFERENCE.md) and
[boat acceptance checks](docs/ACCEPTANCE.md). MIT licensed.

Signal K conventions: [plugin interface](https://demo.signalk.org/documentation/_signalk/server-api/Plugin.html),
[data processing and publishing](https://demo.signalk.org/documentation/Developing/Plugins/Processing_Data.html),
and [vessel data keys](https://signalk.org/specification/1.5.0/doc/vesselsBranch.html).
