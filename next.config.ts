import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained .next/standalone/server.js that only needs its
  // own bundled node_modules — this is what Hostinger's Passenger-based
  // Node.js App hosting expects to point at, instead of a full `next start`.
  output: "standalone",
};

export default nextConfig;
