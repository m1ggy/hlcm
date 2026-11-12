import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The staff guide page reads its text from docs/ at runtime; the
  // standalone build only ships files it traces, so name it here.
  outputFileTracingIncludes: {
    "/staff-guide": ["./docs/staff-guide.md"],
  },
  devIndicators: {
    position: "bottom-right",
  },
  experimental: {
    // 210mb = the 200MB file cap in src/lib/actions/files.ts plus multipart
    // overhead. proxyClientMaxBodySize matters as much as bodySizeLimit:
    // src/proxy.ts matches every route, and the proxy silently truncates
    // request bodies past its own (10MB default) buffer, which shows up as
    // "Unexpected end of form" on any larger upload.
    serverActions: {
      bodySizeLimit: "210mb",
    },
    proxyClientMaxBodySize: "210mb",
  },
};

export default nextConfig;
