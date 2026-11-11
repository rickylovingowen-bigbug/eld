import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["postgres"],
  outputFileTracingIncludes: {
    "/*": ["./prompts/ai-prompts-v1.md"],
    "/api/*": ["./prompts/ai-prompts-v1.md"],
    "/story/*": ["./prompts/ai-prompts-v1.md"],
  },
  outputFileTracingExcludes: {
    "*": ["./eval/**", "./evals/**", "./src/eval/**", "./src/scripts/**"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
