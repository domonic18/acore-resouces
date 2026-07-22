/**
 * 应用版本号 — 由 vite.config.ts 从项目根目录 VERSION 文件注入
 *
 * 版本号单一来源：项目根目录 `VERSION` 文件
 *   - 本地开发：vite.config.ts 读取 VERSION 文件并注入
 *   - 生产构建：通过环境变量 VITE_APP_VERSION 注入，可包含构建号
 *
 * 修改版本号时，只需更新根目录 VERSION 文件。
 */

/**
 * 应用版本号（完整语义版本，如 "0.1.0" 或 "0.1.0.42"）
 * - 由 vite.config.ts 通过 define 注入
 */
export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION || "0.1.0";

/**
 * 短版本号（不带构建号），用于 UI 紧凑显示
 * 例如 "0.1.0.42" → "v0.1.0"
 */
export const SHORT_VERSION: string = `v${APP_VERSION.split(".").slice(0, 3).join(".")}`;
