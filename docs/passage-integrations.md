# Passage integration inspection — 2026-10-31

Development base: clean Endurance 1.2.0 checkout at `142fe16`, origin
https://github.com/SCarns/signalk-endurance. The older sibling checkout is 1.0.0
and was not changed. Release candidate is 2.0.0; verify registry status separately.

## Inspected sources

- Local Weather Router Plus 0.1.0-beta.5 checkout, HEAD
  `1073d77c43cbc769e9c49565c4f4112a28155f70` (local modifications may exist).
  `src/engine/route.ts:routeToSignalKRoute` writes the adapter's exact fields.
  `src/index.ts` publishes with `resourcesApi.setResource('routes', job.id, job.skRoute)`.
  `src/plugin/api.ts` also exposes existing jobs and results via authenticated HTTP.
  This increment uses Resources API rather than assuming cross-plugin HTTP auth.
- Local Energy Predictor 0.12.3, HEAD
  `e542adc94f636e0aaf4049bf780cbc9acc3882f5`.
  `plugin/advisory.js` publishes forecast hourly, weather source and validTo.
  `plugin/prediction.js` exports ratio-valued ideal and detected SOC. The advisory
  publisher receives raw `runPrediction` output with Date-valued times in-process;
  REST serialization shows ISO strings. Endurance must accept both representations.
  Ideal assumes advised equipment deployment; detected represents detected states.
  No verified route-specific load/schedule request interface was established.
- [Passage Briefing index](https://github.com/meri-imperiumi/signalk-passage-briefing/blob/6bc1b73fe63d4a8cb7274ffbfcf237a0a6aecad0/plugin/index.js)
  and `public/route-sim.mjs`; package inspected as 0.16.1. Active route is
  `navigation.course.activeRoute`; `/api/briefing` returns weather/route inputs.
  Shared simulation derives duration, motoring hours, arrival-complete status and
  time-based track. The web client uses it; `plugin/fronts-source.js` also runs
  `simulateRun` internally on the server for weather-front timing.
  No public completed-passage-profile endpoint was established by this inspection.
  Endurance must not rerun that routing simulation merely to obtain a profile.
- [RouteIQ types](https://github.com/marcelrv/signalk-routeiq/blob/27e603deaff61bae91d3d9f0638e02b7db19375d/src/types.ts)
  and `src/api.ts`; package inspected as 0.1.0-alpha.9. RouteResult's totalSeconds
  includes optional wait time. Its description calls this sailing time at average
  speed, not a sail propulsion guarantee. HTTP router mounts under plugin `/router`.
  No existing route-result persistence/profile publication contract was established.

GitHub source inspection does not establish what is installed aboard. Local source
inspection and fixture tests do not establish live interoperability.

## Local follow-up — 2026-11-01

The user's saved Saug2Island WRP profile has 146637.2 seconds total, 145341.6
sailing and 1295.5 motoring. Beta.3's read-only assessment recognized the route
but returned INVALID_FORECAST for energy and CONSUMPTION_UNAVAILABLE for fuel
while the engine was stopped. Inspection of EP's `plugin/index.js` and
`plugin/advisory.js` confirmed that raw Date times reach the in-process model.
The local follow-up accepts valid Date/ISO times, rejecting malformed values.

An optional `passage.fuelLitresPerHour` now supplies explicit planning consumption
without altering the live fuel module or alerts. Zero preserves beta.3 behavior.
A local replay of captured route/resource/EP data at 1.8 L/hour requires 0.64775 L
fuel; energy remains provisional with a detected minimum SOC of 0.807 in the
captured assessment window. This is local replay evidence, not deployed behavior.

Future RouteIQ saved-profile work is tracked at
https://github.com/marcelrv/signalk-routeiq/issues/50. There is still no RouteIQ
or Passage Brief completed-profile adapter in this build.

The installed Passage Brief simulation-settings endpoint was subsequently checked
through the user's logged-in Safari session and returned
`motor_fuel_l_per_hour: 1.8`. An unauthenticated HTTP read returned 401. The local
dashboard now reads that existing endpoint with same-origin credentials, retains
only the positive numeric burn rate and fetch time, and supplies it to the
read-only passage assessment as a viewer-provided planning input. It is not an
authoritative server configuration read or a completed-profile export. Cache TTL
is 60 seconds; assessment rejects settings older than 90 seconds. Missing,
unauthorized, malformed and failed settings reads clear the fallback. No token or
private configuration file is read. An explicit Endurance planning rate wins;
otherwise a positive live rate wins before this fallback. Background publication
and standalone resource assessments do not consume the browser's setting.

## Next increments

- Passage Briefing: obtain a server-readable completed simulation with route ID,
  generation timestamp, arrival completeness and explicit sailing/motor schedule.
- RouteIQ: consume an explicitly selected existing result, preserve wait durations,
  and require propulsion allocation before assessing fuel; never trigger routing.
- Remaining-route progress: establish upstream progress/replan contract, invalidate
  on route changes, and consume remaining engine hours without prorating totals.
- Confirm Energy Predictor load/schedule contract and route-position weather handling;
  preserve forecast provenance and actual horizon. Account for forecast sampling
  uncertainty; hourly samples cannot establish sub-hour battery minima.
- Add upstream LPG use and holding accumulation rates only after verifying units,
  selected supply mapping and timestamps. Retain missing-data visibility.
- Live Signal K verification and dashboard visual inspection before any release.

## Freeboard active-route correction

Verified server plugin API `app.getCourse(): Promise<CourseInfo>` returns
`activeRoute.href`. Freeboard uses the Course API. Data-path-only detection in
beta.1 missed servers where that path is absent; beta.2 uses the authoritative
plugin API when exposed, with older-server data-path fallback. Empty or failed
Course API reads do not select an old route from the fallback path.

Sources: SignalK/signalk-server `packages/server-api/src/course.ts`,
`src/interfaces/plugins.ts`, `src/api/course/index.ts`; SignalK/freeboard-sk
`src/app/modules/course/course.service.ts` inspected on 2026-10-31.
