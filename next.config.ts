import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* better-sqlite3 is a native module: it must be required at runtime by Node,
     never bundled. Without this the server build fails to resolve the .node
     binary and every database call throws at request time. */
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
