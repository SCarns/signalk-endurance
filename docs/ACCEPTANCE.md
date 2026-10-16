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

## Internal freshwater learning

- In preview, choose internal usage estimation and review the starting allowance and
  crew count. Confirm the setup page labels the initial days estimate as Default.
- Confirm one combined supply is used when switching tanks, with no path change.
- Check pause/exclusion reasons during missing/stale readings, refills, transfers and
  underway state. Manually pause during known transfers or filling.
- Observe multiple settled daily usage intervals. Compare learned rate against actual
  litres used and confirm at least the configured hours and three accepted intervals
  before the label changes to Learned. Synthetic tests cannot replace this check.
- Restart and confirm learned history survives, but no usage is attributed to the
  offline interval. Confirm data-directory persistence is reported as disk.
- Verify external-rate selection still works with the provider's actual units.

## Input unit selection

- Verify the unit dropdown defaults to Litres and persists your selection after save
  and restart. Enter equivalent capacities in litres, US gallons and m³ and confirm
  the same m³ totals and duration. Adjust numeric entries when changing the selector.
- Verify migration of existing m³ capacities and litre-based allowances preserves
  physical capacity and usage. Learned rates should retain observation progress.
- Verify existing Signal K capacity/current-volume paths are interpreted in m³
  regardless of the manual input selection.

## Dashboard

- Compare each displayed reading and alert with its published assessment.
- Confirm Auto uses Day by day, Night at rest at night, and Red sailing/motoring at night.
- Confirm manual themes, display units, and expanded tank details persist as expected.
- Disconnect the dashboard and verify it stops presenting a current healthy assessment.
