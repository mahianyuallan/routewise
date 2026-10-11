# Keep the API stateless: the heatmap call sends back what it needs

The API stores nothing between requests. `POST /api/plan/` returns the plan. `POST /api/heatmap/` then receives the plan's simplified routes, departure, load and any simulated-storm parameters, instead of looking up a stored plan by id. A stored plan would be lost whenever Render restarts the free instance, would expire under a reviewer's open tab, and wouldn't survive a move to Vercel ([ADR 0001](0001-render-free-api-with-keepalive.md)).

## Consequences

- The heatmap request carries about 60 KB of geometry. Because that geometry comes from the browser, the server caps how many points it accepts.
- The weather and place caches stay, but only as best-effort speed-ups.
- Changing the load re-submits the whole trip rather than re-scoring a stored plan. That is also correct on its own terms, because load changes TomTom's weight restrictions.
