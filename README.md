# Stop watching gauges. Go sailing.

**Endurance isn't another gauge. It's the thing that watches the gauges so you don't have to.**

Endurance watches your boat’s power, water, fuel, propane, and holding tanks—all in one place, so you don’t have to keep checking separate gauges. It stays quiet when everything is fine and notifies you when it’s time to charge, refill, or pump out.

Endurance is a standalone Signal K plugin that supports multiple tanks and calculates their combined capacity and volume.

Endurance 2.0 also helps you plan: choose a passage and see how its estimated
resource demand compares with what you have aboard and the reserves you want to
keep. Its optional Passage Readiness dashboard uses supported upstream estimates,
with separate resource cards showing shortfalls, sources and forecast limits.

When installed, Energy Predictor, Consumption Estimator, and Derived Data can provide additional forecasts and measurements. These plugins are optional.

Endurance also publishes its assessments to Signal K, so you can put the information
where you need it—in KIP, WilhelmSK, or another compatible display. Choose the
Endurance paths supported by your display to show resource status, remaining supply,
and estimated time alongside the instruments you already use.

![Endurance — brass hourglass over open water](public/icon.png)

## Works with

- **[Derived Data](https://github.com/SignalK/signalk-derived-data)** supplies additional measurements, including calculated tank volumes when configured.
- **[Energy Predictor](https://github.com/meri-imperiumi/signalk-energy-predictor)** adds energy forecasts and advance charging warnings.
- **[Water Consumption Estimator](https://github.com/meri-imperiumi/signalk-consumption-estimator)** can supply freshwater consumption estimates through configured external paths.
- **[Weather Router Plus (WRP)](https://github.com/motamman/signalk-weather-router-plus)** supplies published passage duration and sailing/motoring estimates. Select a saved WRP route in Passage Readiness to compare its resource demand with onboard supplies and reserves. Its routing coverage and forecast limits still apply.
- **[Passage Briefing (Passage Brief)](https://github.com/meri-imperiumi/signalk-passage-briefing)** supplies its configured motor fuel burn as a planning fallback in the passage dashboard when no explicit Endurance override or positive live rate is available. Reading that setting requires the viewer's existing Signal K login. Completed Passage Brief simulation profiles are not yet imported.

- **[Log Book](https://github.com/meri-imperiumi/signalk-logbook)** records Signal K alerts when they are raised and cleared, including Endurance alerts when live publishing and notifications are enabled. It also records crew changes. Endurance reads the shared crew roster: when using its own water-usage learning, it adjusts the starting allowance for the number aboard and learns separate usage rates for each crew size. If Water Consumption Estimator supplies the usage estimate, Endurance uses that total directly without applying crew count again.

All of these are optional. Endurance monitors resources on its own and includes its own
boat-wide freshwater usage estimation. No companion plugin is required.

**Planned: [RouteIQ](https://github.com/marcelrv/signalk-routeiq)** could supply
inland passage timing, including lock and bridge waits. It is not yet a supported
Endurance integration: saved routes currently omit its calculated duration and
wait estimates. Export support is tracked in [RouteIQ issue #50](https://github.com/marcelrv/signalk-routeiq/issues/50).
RouteIQ is therefore not advertised as a working integration in the App Store's
Works with recommendations. Travel time alone also does not establish engine hours.

## Install

Install **Endurance** through the Signal K App Store.

For manual installation, from your Signal K configuration directory (usually `~/.signalk`):

```sh
npm install github:SCarns/signalk-endurance
```

Or install a downloaded package with:

```sh
npm install /absolute/path/signalk-endurance-1.2.0.tgz
```

Restart Signal K, enable **Endurance** in **Server → Plugin Config**, then open its
webapp at `/signalk-endurance/`. Configuration requires an administrator; the dashboard supports read-only viewers.
For Docker, install inside the server container in its configuration directory.

Requires Node.js 18+ and standard Signal K Node plugin APIs. Tested locally with
synthetic readings and package installation checks, with initial onboard review on
TBD. Verify your own source paths, capacities, and thresholds during setup.

## Your dashboard

See power, freshwater, fuel, propane, and holding tanks together, with current alerts,
available supply, water duration, and expandable tank details. Settings opens Signal K
plugin configuration; Help opens this documentation.

The top-right icon cycles **Day → Night → Red**; a separate **Auto** button restores
automatic selection. Your choice is remembered.
Auto follows `environment.mode`: day uses Day; night uses Night, or Red when
`navigation.state` is `sailing` or `motoring`. Missing day/night state uses Night.
Displayed volume units are remembered separately from configuration input units.

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
- **Full capacity**, an optional fixed value in the selected input units that takes
  precedence over the capacity path. Leave zero to use the path.

### Choose input units

**Units for entered volumes** offers **Litres** (the default), **US gallons**, and
**Cubic metres (m³)**. The selection is saved with your configuration. It applies to
manual full capacities, starting daily usage per person, and maximum daily usage.
For example, enter 400 with Litres selected to represent a 0.4 m³ tank. One US gallon
is exactly 0.003785411784 m³; imperial gallons are not implied.

The selector specifies the units of the numbers you enter. If you change the
selection, adjust the numeric entries to match before saving; this standard plugin
configuration form does not automatically rescale existing entries as you edit.
It does not change the units of Signal K input paths or an external consumption
source: those keep their own documented units.

On upgrade, older `capacityM3` entries are converted to the new capacity field in the
selected units (litres by default). Older litre-based daily allowances are migrated
likewise. Migration is saved through Signal K's configuration API, so the form
shows the converted editable values. The prior configuration is backed up as
`config-before-alpha4.json` in the plugin data directory. When earlier learned state
is converted, its original file is retained with an `.alpha3-backup` suffix; restore
these backups if rolling back to alpha.3. All volume calculations use m³ and estimated
rates use m³/s; saved earlier learned rates are converted without discarding history.

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
a full tank elsewhere. Combined remaining space is additional information. Missing
selected tanks keep coverage incomplete while a known full-tank alert remains active.
Pump-out time is unavailable without a trustworthy fill-rate model; this release
retains level and free-space monitoring rather than inventing days to full.

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

- **Energy Predictor integration:** its optional forecasts add deficit monitoring
  and advance charging warnings to the measured-SOC assessment. Configuration explains the integration; the dashboard shows the available forecast.
  Leave `predictionPath` blank to discover
  `electrical.energy.prediction.status`, or enter a custom path. Healthy measured SOC plus
  `deficit` gives informational WATCH; forecast `critical` gives WARNING. Measured
  low SOC takes priority. A missing forecast does not prevent SOC assessment.
  Forecasts use `resources.energy.predictionStaleSeconds` (default 7200 seconds),
  independently of measured SOC and battery duration (`staleSeconds`, default 300).
  Energy Predictor 0.12.3 recalculates every 60 minutes by default (configurable
  5–60 minutes) and republishes status on each successful cycle, including unchanged
  values. Two hours allows one delayed cycle while still expiring stopped forecasts.
  Configure a shorter forecast window if desired. Missing, expired, or invalidly
  timestamped forecasts leave measured-SOC assessment in control.
- **Battery duration:** leave `timePath` blank to discover `capacity.timeRemaining`
  for the selected SOC battery bank. For example, selecting
  `electrical.batteries.House.capacity.stateOfCharge` discovers
  `electrical.batteries.House.capacity.timeRemaining`. A custom path overrides this
  discovery. Multiple banks still require SOC selection; no duration is borrowed from
  another bank. All duration readings must be fresh numeric seconds.
  Device-specific infinite/240-hour sentinels are not inferred. Explicit paths stay
  authoritative even when missing or stale. Discovery is retried each cycle, and the assessment API reports selected paths and their freshness.
- **Freshwater duration:** internal boat-wide usage estimation is now included.
  No consumption plugin or active-tank selection is required. See below.

## Fuel engine running time

Optionally set Fuel's **total fuel rate** path to an available Signal K rate such as
`propulsion.main.fuel.rate` in **m³/s**. Existing calibrated RPM-derived rates are
acceptable if their provider publishes current timestamps and documented SI units.
Endurance reads that rate without changing the provider. Blank leaves duration
unavailable; no companion plugin or assumed fuel curve is required.

Select only usable fuel tanks and ensure the configured rate is the total draw from
that selected supply (including other engines/consumers where applicable). Endurance
cannot infer engine-to-tank plumbing. Complete fresh volume and a fresh positive
numeric rate are required; missing/stale/null/zero/negative rates invalidate the
estimate. It divides available volume by rate once and displays **engine running
hours to empty**. This is conditional on maintaining that rate and includes the
reserve; existing level alerts protect the configured reserve separately.

Total `propulsion.*.runTime` is an accumulated engine-hours counter, not remaining
endurance. Runtime or RPM alone cannot establish consumption. This release does not
invent a rate, fit a new RPM curve, or extrapolate calendar days from engine hours.

## Internal freshwater usage estimation

Under Freshwater, leave **Usage estimate** set to **auto** and the external
consumption path blank to learn internally. An existing external path remains
in use in auto mode; choose **internal** to replace it, or **external** to require it.
An unavailable configured external source never silently falls back to another rate.

Endurance estimates usage from the **sum of selected usable tanks' current volumes**.
The estimate applies to the whole supply; switching the feeding tank requires no
change. Exclude contaminated or unusable tanks. Changing the selected supply or its
configured capacity starts new learning history.

- **Starting estimate:** configurable volume per person per day in your selected
  input units, initially equivalent to 6 litres.
  This is one boat-wide assumption, multiplied by crew count once.
- **Crew:** auto uses the optional shared `communication.crewNames` roster (also
  used by Log Book); otherwise it uses the configured fallback count (initially 2).
  Choose **manual** under freshwater learning to override the roster with that count.
  A valid empty roster means zero people. Malformed rosters, duplicates, more than
  100 names, invalid timestamps, and future timestamps use the fallback. Crew rosters
  are persisted state: they do not expire like sensors and must be updated when crew
  changes. The assessment reports crew count, source, and fallback reason. External
  consumption estimates remain total rates and never get multiplied by crew again.
- **Learning:** separate history per crew count; a learned rate is used only after
  at least 72 accepted observation hours by default and three accepted intervals.
  Until then, days remaining is explicitly labelled Default or Learning and uses
  the configured starting estimate. No interpolation between crew counts is assumed.
- **Settling:** sample only newly timestamped complete readings, at least five minutes
  apart; take a three-sample median per tank. Require an hour of observations and
  confirmation before accepting a decrease beyond the noise allowance (0.5 L or
  0.2% of capacity, whichever is larger). Small usage accumulates across intervals.
  Unchanged readings never become a learned zero-use or infinite-endurance claim.
- **Discontinuities:** exclude refills, opposing tank movements suggesting transfers,
  missing volumes, timestamp differences over five minutes, and observation gaps
  over six hours. Do not learn across a restart. Settled intervals over seven days
  are discarded. Implausible usage above the configured daily limit is excluded.
- **Underway:** learning pauses when navigation state reports sailing, motoring or
  under way. Without that state, motion cannot be identified automatically. You can
  also pause learning in Plugin Config during filling, transfer or maintenance.
- **Persistence:** learned rates are saved in the plugin's data directory every five
  minutes when changed, and on stop. Short-term observation anchors are not restored.
  Disk errors are reported in assessment diagnostics; monitoring continues.

Days to empty is combined current volume divided by estimated total daily use.
The dashboard displays days; Signal K publishes `time` in seconds and
`consumptionRate` in m³/s. `rateSource` is `default`, `learning`, `learned`, `external`,
or `unavailable`; `learning` diagnostics show progress and pause/exclusion reasons.
Default/learning duration estimates do not trigger forecast-based intervention
alerts. Measured level thresholds remain active, and learned or external duration
estimates can add the existing 24/48-hour intervention conditions.

Sensor data cannot reveal simultaneous use and filling that cancel out, transfers
with delayed readings can resemble consumption, and leaks are also water use.
Pause learning during known transfers or filling; review the rate against actual use.
This alpha has synthetic validation, not onboard learning validation.


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

With live publishing enabled, paths begin with `environment.endurance`. For example,
use `environment.endurance.message` for the current assessment,
`environment.endurance.resources.energy.status` for power status, and
`environment.endurance.resources.freshwater.time` for estimated freshwater duration
(in seconds). Display support for text, units, and individual path types varies.
Preview uses `environment.endurancePreview` instead.

Under the selected preview/live prefix:

- `status`, `action`, `reason`, `message`, `limitingResource`, and `coverage`.
- `time`, `energyTime`, `waterTime`: seconds or null when unavailable.
- `estimatedDays` and `resources.<system>.estimatedDays`: convenience numbers in
  days (`d` metadata), derived only by dividing existing valid seconds by 86400.
  Seconds remain authoritative; no second estimator or rounding is applied. Null,
  missing, or invalid estimates publish null, and zero seconds publishes zero days.
  Fuel days converts `resources.fuel.engineTime` (engine running seconds), not
  calendar endurance. Propane days converts `resources.propane.time`; the current
  level-only propane monitor has no duration estimate and therefore publishes null.
  Holding without an existing duration also publishes null. Overall days
  remains the minimum available water/battery estimate, not an all-resource guarantee.
- `resources.fuel.engineTime`: engine running seconds to empty at the selected fuel
  rate, or null. `resources.fuel.consumptionRate`: m³/s or null. These do not affect
  level alerts, `time`, overall days, or limiting-resource decisions.
- `resources.<system>.status`, `.action`, `.reason`, `.time`.
- Freshwater `.consumptionRate` (m³/s), `.rateSource`, and `.learning` diagnostics.
- For tank systems, `resources.<system>.tanks`: each tank's inputs, freshness, status,
  capacity, current volume, free space, and volume calculation method.
- `resources.<system>.totals.capacityM3`, `.currentVolumeM3`, `.availableVolumeM3`,
  `.freeVolumeM3`: m³ or null. Names explicitly state the units.
- `resources.<system>.totals.levelRatio`, `.complete`, `.selectedTanks`, `.volumeTanks`.

`limitingResource` names the selected intervention's resource, or `none` when action
is `NONE`. Unavailable totals/durations publish null to invalidate earlier estimates.

`GET /plugins/signalk-endurance/discovery` returns candidates, capacity/volume paths,
and configuration. Candidate `freshness` distinguishes FRESH, STALE, MISSING,
INVALID_TIMESTAMP, FUTURE, and INVALID; `measurementValid` additionally checks the
numeric ratio. Discovery means a path exists, not that it is usable. Discovered stale
paths remain visible for diagnosis; assessment inputs retain age and original stamps. `GET /plugins/signalk-endurance/assessment` returns full inputs and
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
Future work includes source adapters, notification hysteresis and reminders, and
optional passage readiness. Internal usage estimation currently covers freshwater;
fuel runtime learning, propane and holding fill-rate learning remain future work.

Signal K conventions: [plugin interface](https://demo.signalk.org/documentation/_signalk/server-api/Plugin.html),
[data processing](https://demo.signalk.org/documentation/Developing/Plugins/Processing_Data.html),
and [vessel data keys](https://signalk.org/specification/1.5.0/doc/vesselsBranch.html).

### 1.0.2

Battery monitor time distinguishes a fresh explicit null (No estimate), a path not yet observed (Waiting for data), expired readings (Data stale), and malformed or unavailable readings (Unavailable). Fresh nonnegative numeric values remain seconds, including zero and long estimates. Null does not mean infinity. SOC, Energy Predictor, and alert decisions are unchanged.


### Upgrade to 1.1.0

Existing configuration remains valid; the new fuel rate is opt-in and crew selection
retains automatic roster/fallback behavior. No Energy Predictor or Consumption
Estimator calculation is modified. Test preview outputs before enabling live mode.
To roll back, preserve your plugin options and learned usage file, install
`signalk-endurance@1.0.2` in the Signal K configuration directory, and restart.
Remove the new fuel `ratePath` and learning `crewSource` settings if the older server
configuration validator rejects them. Keep preview/live path selection consistent.

### Upgrade to 1.2.0

- Disabled resources no longer have dashboard cards. Remaining cards fill the
  available width in the responsive webapp, including an embedded Freeboard view.
  Enabled resources with missing or stale data remain visible.
- `environment.endurance.resources.fuel.estimatedDays` converts valid
  `resources.fuel.engineTime` directly by dividing by 86400. These are engine
  running days to empty, not calendar days.
- `environment.endurance.resources.propane.estimatedDays` converts valid
  `resources.propane.time` by 86400; it remains null with the current level-only
  monitor. No consumption model or tank-percentage duration estimate is added.
- The same paths are available under `environment.endurancePreview`. Existing
  seconds, freshwater days, assessments, alerts and optional integrations remain.

Completed passage-profile integration with Passage Brief remains future work;
its configured fuel burn is available as the optional dashboard fallback below.

## Passage Readiness — 2.0

Passage Readiness asks whether the resources you monitor can cover a selected
passage while retaining your configured reserves. It is optional and disabled by
default. Existing Endurance assessments, alerts, duration estimates and decisions
continue independently. Current route-profile support is limited to published
Weather Router Plus estimates; the source and forecast limitations below apply.

Enable `passage.enabled` in plugin configuration. Choose a saved planning passage
in the dashboard, or use the active route. Background Signal K passage publication
follows the Course API (`app.getCourse().activeRoute`), with
`navigation.course.activeRoute` fallback on older servers. For this increment, publish a Weather Router Plus route to Signal K
Resources first. Endurance reads it through `app.resourcesApi.getResource('routes',
id)`; it never requests a new route, chooses a route alternative, or changes the
active route. Unsupported or absent route metadata produces an unknown result.
The dashboard shows Passage Readiness separately from the existing assessment.
Its full-width passage summary shows the overall outlook, duration, navigation
context and current position. Individual Power, Freshwater, Fuel and other enabled
resource cards below it show the relevant demand, reserves, source and forecast
coverage. Missing estimates stay explicitly unavailable; these cards do not change
the underlying assessment or alerts.
The plugin's `/assessment` endpoint includes `assessment.passage`; the corresponding
Signal K object is `environment.endurancePreview.passage` in preview mode or
`environment.endurance.passage` in live mode. Passage results do not raise alerts.

- **Fuel:** selected usable volume minus reserve, compared with total forecast
  engine hours at the existing configured total fuel consumption rate. A current
  measured rate may differ from passage engine loading; this is an estimate.
  For dockside planning, optionally set `passage.fuelLitresPerHour` to your
  estimated burn at planned motoring speed, in liters/hour. A positive value is
  explicitly identified as a planning estimate and applies only to passage fuel
  demand; `0` (default) uses automatic source selection described below. This does not
  replace your engine's live Signal K rate, standalone fuel endurance or alerts.
  An engine-stopped live rate of zero cannot establish future motoring fuel use.
  The dashboard's **Fuel allowance** choice can instead budget engine use for
  the **full planned duration**. This multiplies the same burn rate by total
  upstream passage time and still retains your fuel reserve. It leaves the
  sailing forecast, arrival time, water demand and energy forecast unchanged.
  It is a conservative fuel scenario relative to that plan's motoring allocation,
  not a verified all-motor ETA or a guarantee against a longer passage. Choose a
  suitably conservative burn rate for your intended engine use. The allowance is
  remembered in this browser and does not change navigation or the background
  published passage assessment, which continues using upstream motoring hours.
  With automatic selection, the passage dashboard first uses a fresh positive
  live rate. If none is available, it tries Passage Brief's configured
  `motor_fuel_l_per_hour` through its existing `/api/config` endpoint. This requires
  the viewer's existing Signal K login and permission to read that endpoint.
  The pane labels **Passage Brief setting** when used. Settings are refreshed at
  most once per minute; failed, unauthorized or invalid reads clear that fallback.
  No login token is copied or extra permission requested. This browser-based
  fallback is for the displayed plan; the background Signal K passage object
  continues using the live rate or an explicit Endurance planning override.
  Standalone fuel endurance and alerts never use this fallback. A positive live
  rate can itself be an RPM-derived estimate, and idling consumption may not
  represent future cruise load; use an explicit planning override when needed.
- **Freshwater:** combined supply minus reserve, compared with full route duration
  at Endurance's existing total usage rate. Crew allowance is already incorporated
  by the existing water module; it is not multiplied again. Rate source remains
  visible in the assessment.
- **Electrical energy:** fresh Energy Predictor hourly `detectedSoC` values are
  compared against the energy reserve, including current measured SOC. A later
  recovery cannot conceal a predicted reserve crossing. The forecast source,
  covered duration and uncovered duration are reported. Stale, malformed or
  missing forecasts cannot prove coverage.
- **Propane/LPG and holding:** monitored levels and reserves remain available,
  but this increment has no verified consumption/accumulation-rate provider for
  these resources. They cannot be marked sufficient without that information.

Passage reserves use the resource warning thresholds. Disabled resources are
excluded; sufficient means only the enabled resources with the available data.
Missing resource data yields **UNKNOWN**, predicted reserve failure yields
**SHORTFALL**, and limited electrical coverage or unverified passage loads yields
**PROVISIONAL**. Neither unknown nor provisional means a demonstrated shortage.
No resources enabled also yields unknown.

Endurance refreshes the selected resource and reassesses against current supplies
on its normal update interval (route reads have a five-second timeout). It gives
**no progress credit**: it retains the full route duration and full engine hours
until you select/publish a revised plan. This conservative first step avoids
mistaking elapsed clock time for actual progress, especially after delays. Routes
whose scheduled arrival has passed must be revised. A future departure requires
forecast coverage at that departure, rather than coverage only from now.

Energy Predictor remains the only energy prediction engine. Its current forecast
is not verified to incorporate this route's planned motoring, alternator schedule,
watermaker demand or vessel positions along the route. Therefore a healthy
forecast stays provisional even when its horizon covers the passage. Endurance
adds no assumed charging, no watermaker model, and no forecast extrapolation.

### Integration support verified for this increment

| Integration | Verified interface | Current support |
| --- | --- | --- |
| Weather Router Plus | Published route `feature.properties` contains `source`, `total_time_s`, `motoring_time_s`, `sailing_time_s`, `departure`, `arrival` | Selected Signal K route resource adapter |
| Energy Predictor | `electrical.energy.prediction.forecast.hourly` with `time` (in-process Date or serialized ISO string), `idealSoC`, `detectedSoC`; `weather.validTo` and `weather.source` under the same prediction base | Read detected-equipment track and explicit horizon; no prediction or schedule submission |
| Passage Briefing (Passage Brief) | `/plugins/signalk-passage-briefing/api/config` exposes `motor_fuel_l_per_hour`; `/api/briefing` supplies cached briefing inputs | Dashboard fuel-setting fallback through the viewer's session; no completed passage-profile adapter. Do not interpret briefing weather horizon as completed passage duration |
| RouteIQ | Route result has optional `totalSeconds`, `totalWaitSeconds`, `departureTime`, `arrivalTime` | Investigated; no adapter yet. Travel duration does not establish sailing/motoring allocation |

Source versions and remaining integration work are recorded in
[Passage integration notes](docs/passage-integrations.md).

### Installing or upgrading to 2.0

Install or update Endurance from Signal K's App Store. Version **2.0.0** is the
stable release on npm's `latest` tag. Alternatively, install
`signalk-endurance@2.0.0` from your Signal K configuration directory and restart
the server. Passage Readiness remains disabled until you enable it in plugin
configuration; existing resource monitoring continues without it.

To return to 1.2.0, select **1.2.0** in Versions or install
`signalk-endurance@1.2.0`, then restart Signal K. No existing resource settings or
learned usage history are intentionally migrated by this release.

### Choose a passage from the dashboard

The existing boat summary and **Your Resources** cards remain first. The separate
**Passage Readiness** section below them has a saved-route dropdown. Enable
Passage Readiness in Settings, then choose a route by name. When Signal K has an active route, **Active route**
appears first, followed by all saved routes. With no remembered selection or
configured route, Active route is selected by default. That choice follows changes
to the active route; choosing a named route keeps that specific passage selected.
If navigation stops, the active choice reports that no route is active instead of
reusing the previous passage. Known saved distances
appear in nautical miles. Use **Refresh routes** after saving or publishing a new
route. Routes without supported passage estimates remain visible with an explanation.

Your dashboard selection is remembered in that browser. It assesses the selected
route without activating it, modifying Freeboard, or changing another display's
selection. With no saved planning selection, the active route is used when one is
available. There is no route-ID override in Plugin Config. Existing saved overrides
are ignored. Dashboard selection does not change background Signal K passage
publication, which follows the active Course API route. Read-only viewers can use
the picker.

For the selected passage, Endurance shows whether Signal K is following that same
route, the next waypoint when the Course API reports it, direction when reversed,
and fresh vessel coordinates when available. These are navigation context, not
a calculated percentage complete or a map match. Resource demand continues to use
the full route; remaining duration and remaining motor hours require an upstream
remaining-passage profile before progress can reduce the estimate.

Passage Readiness stays hidden when no saved route has usable upstream passage
estimates. No manual time/speed fallback is requested. Saved routes remain in the
selector whenever upstream estimates make the section available; choosing a route
without estimates hides its assessment. Missing resource data or limited energy
forecast coverage within a usable passage remain visible in its resource outlook.

## Freeboard integration

Endurance adds an hourglass button to Freeboard’s right-side chart toolbar using the Signal K Plotter Extensions API. Click it to open a compact, resizable status window over the chart; close it with Freeboard’s window control or click the hourglass again. The window follows Endurance Auto (Day in daylight, Night after dark, and Red while sailing or motoring at night), independently of Freeboard’s chart appearance. It shows the existing resource assessment and passage readiness when available, without calculating a separate assessment. Passage readiness uses the planning route and fuel allowance selected in the full dashboard in the same browser, and labels planning passages separately from routes being followed. Disabled resources stay hidden; enabled resources with unavailable data remain visible.

**Enable Freeboard integration** defaults to on in Endurance’s Plugin Config. Turn it off to remove the extension without stopping monitoring, publication, or notifications. Freeboard discovers the updated extension collection; refresh the chart if your host has not refreshed discovery yet. The integration requires a host supporting toolbar buttons, iframe panels, and windows (including Freeboard 3.4.1). With no compatible chartplotter, Endurance continues normally.
