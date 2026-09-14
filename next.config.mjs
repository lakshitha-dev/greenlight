import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // pin the workspace root — C:\dev contains other lockfiles Next would
  // otherwise infer as the root
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
