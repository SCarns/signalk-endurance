# Acceptance on a real Signal K server

Local tests use synthetic inputs. Complete these checks on the vessel server.

1. Install, restart, and enable Endurance in preview mode.
2. Confirm discovery shows actual battery SOC and tank Level paths. Select the house
   bank, disable absent systems, and add each tank to its system's Tanks list.
3. Confirm full capacities and calibrated current-volume paths in m³. Independently
   sum two known tank volumes and capacities, then compare Endurance totals. Test
   unequal tank capacities to verify weighted percentages.
4. Confirm freshwater combined-supply assessment and fuel/propane individual versus
   combined settings match how your tanks are used. Confirm a nearly full holding
   tank triggers attention even with other empty holding tanks.
5. Verify a missing/stale selected volume makes the combined total null, never a
   partial total shown as complete. Known per-tank warnings must remain visible.
6. If using freshwater duration, verify provider units and independently calculate
   total current volume / total consumption rate. Ensure a total is counted once.
7. Stop/restart Endurance; confirm updates stop and resume without duplicate timers.
   Confirm preview produces no notifications.
8. Enable live publishing only after verification. Deliberately test warning,
   resolution, stale-data behavior, and disabling the plugin. Use a separate test
   server for fabricated sensor values.

Record server/provider versions, source paths, expected results, and actual results.
Do not claim boat validation before these checks pass.
