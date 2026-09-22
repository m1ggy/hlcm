import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
