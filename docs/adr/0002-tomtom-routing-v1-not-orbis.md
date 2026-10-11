# Use TomTom Routing v1, not the newer Orbis API

TomTom's docs steer new projects to Orbis, but Orbis routing has no truck travel mode: `car` only in v2, `car` or `taxi` in v3. We use the v1 (TomTom Maps) Calculate Route API, the only free option found with a truck profile, up to 5 alternatives on long trips, departure-time traffic, and per-point travel times for ETAs. Don't "upgrade" to Orbis unless it gains truck routing.

## Considered options

- **openrouteservice:** computes alternatives only for routes under 100 km.
- **Mapbox Directions:** no truck profile, and at most 2 alternatives, which aren't guaranteed.
- **GraphHopper free plan:** 500 credits a day, non-commercial, limited vehicle profiles.
- **Stadia Maps (Valhalla):** has truck restrictions, but its alternates aren't documented in detail. Kept as the backup.
