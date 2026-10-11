# Run the API on Render's free tier, kept awake by a monitor

The Django API runs as a Render free web service, and the React UI runs on Vercel Hobby. A free UptimeRobot check hits `/api/health/` every 5 minutes, so the free tier's 15-minute idle sleep never happens during review. We chose this because everything had to be free, and a long-running process is the ordinary way to run Django, with one in-memory cache shared by every request.

## Consequences

- Render's free instance has 0.1 CPU and 512 MB, so CPU-heavy steps run about 10× slower than on a full core. The target is a warm 1,000-mile plan in under 10 s. If the first deploy misses it, the API moves to a Vercel project, which the stateless API ([ADR 0003](0003-stateless-api.md)) turns into a configuration change.
- Render may restart a free service at any time, and its disk resets, so nothing may depend on memory or disk.
- An always-on service uses 744 of the workspace's 750 free hours in a 31-day month, so no other free Render service in the workspace can be kept awake.

## Considered options

- **Vercel for the API as well** (PRD v1): a full CPU and no sleep, but no memory shared between requests. Kept as the measured fallback.
