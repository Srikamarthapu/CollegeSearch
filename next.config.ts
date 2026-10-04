import type { NextConfig } from "next";
import {
  getSupabaseConnectOrigin,
  NON_CSP_SECURITY_HEADERS,
} from "./security-policy";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'",
  },
  ...NON_CSP_SECURITY_HEADERS,
];

const nextConfig: NextConfig = {
  // Each build worker loads the nationwide source artifact. Bound parallelism
  // so static rendering also fits the existing deployment's memory budget.
  experimental: { cpus: 2 },
  async headers() {
    // Reject a malformed browser auth origin during build/startup instead of
    // interpolating an untrusted value into the per-request CSP.
    getSupabaseConnectOrigin();

    return [
      {
        // Vinext currently needs an explicit root rule in addition to /:path*.
        source: "/",
        headers: securityHeaders,
      },
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
