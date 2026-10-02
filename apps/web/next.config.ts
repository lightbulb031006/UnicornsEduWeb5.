import path from "path";
import type { NextConfig } from "next";
import { PUBLIC_API_BASE } from "./lib/api-base-url";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/sign/**",
      },
    ],
  },
  async rewrites() {
    const publicBase = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
    const destination =
      !publicBase || publicBase === PUBLIC_API_BASE || publicBase.startsWith("/")
        ? `${process.env.INTERNAL_API_URL || "http://localhost:4000"}/:path*`
        : `${publicBase.replace(/\/$/, "")}/:path*`;

    return [
      {
        source: "/api/:path*",
        destination,
      },
    ];
  },
};

export default nextConfig;
