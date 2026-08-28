import type { NextConfig } from "next";

// No `output: "standalone"` here — that was specifically for Hostinger's
// Passenger-based Node.js hosting, which needed a self-contained
// server.js. Vercel builds and runs this natively; setting standalone
// output on Vercel is actively discouraged (it bypasses Vercel's own
// build optimizations) rather than merely unnecessary.
const nextConfig: NextConfig = {};

export default nextConfig;
