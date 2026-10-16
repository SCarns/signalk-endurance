# First milestone acceptance on a real Signal K server

Local tests are complete; the following checks require the vessel server.

1. Install the tarball, restart, enable Endurance in preview, and open its webapp.
2. Confirm discovery shows the actual house SOC and tank paths. Disable absent
   resources; explicitly choose among multiple tanks/banks. Verify input timestamps,
   source labels, ratios, freshness windows, and reserve thresholds.
3. Confirm preview status updates while existing Node-RED output stays unchanged.
4. Compare known normal and low-resource readings. Use a separate test server for
   synthetic values; don't inject fabricated readings onto the live vessel bus.
5. Verify a stale selected source becomes UNKNOWN and its duration becomes null.
   Confirm partial coverage is visible and no missing reading becomes zero.
6. If using water consumption, confirm actual provider units and independently
   calculate one expected volume/rate duration. Verify forecast freshness.
7. Stop/restart Endurance; confirm no duplicate periodic updates and that no
   notification is emitted while preview is enabled.
8. Before live switch, disable Node-RED Endurance publishers. Test visual warning,
   resolution, stale-data handling, stop/restart, and rollback deliberately.

Record server version, source/provider versions, observed paths, expected and actual
results, and any differences. Do not claim boat validation until these checks pass.
