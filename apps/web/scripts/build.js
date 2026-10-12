#!/usr/bin/env node
/**
 * 带构建号自增的应用构建脚本
 *
 * 版本号格式：
 *   - 基础版本来自项目根目录 VERSION 文件（如 "0.1.0"）
 *   - 构建号来源（优先级从高到低）：
 *     1. 环境变量 BUILD_NUMBER
 *     2. Git 提交总数（git rev-list --count HEAD）
 *     3. 当前时间戳（兜底）
 *   - 最终注入：VITE_APP_VERSION=0.1.0.42
 */

import { execSync, spawnSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "../../..");

function getBuildNumber() {
  if (process.env.BUILD_NUMBER) {
    return process.env.BUILD_NUMBER;
  }

  try {
    return execSync("git rev-list --count HEAD", {
      cwd: rootDir,
      encoding: "utf-8",
    }).trim();
  } catch {
    return Date.now().toString();
  }
}

function getBaseVersion() {
  const versionFile = resolve(rootDir, "VERSION");
  if (existsSync(versionFile)) {
    return readFileSync(versionFile, "utf-8").trim();
  }
  return "0.1.0";
}

const baseVersion = getBaseVersion();
const buildNumber = getBuildNumber();
const appVersion = `${baseVersion}.${buildNumber}`;

process.env.VITE_APP_VERSION = appVersion;

console.log(`Building ACore 资源库 v${appVersion}...`);

const result = spawnSync("npx", ["vite", "build"], {
  cwd: resolve(__dirname, ".."),
  stdio: "inherit",
  env: process.env,
  shell: true,
});

process.exit(result.status ?? 0);
