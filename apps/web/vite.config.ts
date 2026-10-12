import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

// 版本号来源（优先级从高到低）：
//   1. 环境变量 VITE_APP_VERSION（CI/CD 构建时注入，如 "0.1.0.42"）
//   2. 项目根目录 VERSION 文件（本地开发，如 "0.1.0"）
//   3. 兜底默认值 "0.1.0"
const versionFile = path.resolve(__dirname, "../../VERSION");
const appVersion = process.env.VITE_APP_VERSION
  || (fs.existsSync(versionFile)
    ? fs.readFileSync(versionFile, "utf-8").trim()
    : "0.1.0");

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  appType: "spa",
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
