# model-converter

`acore-resouces` 的 M2 → glTF 转换工具 PoC。

## 说明

当前为 Phase 2 的概念验证实现：

- 使用 Rust 标准库手动解析 `.m2` 文件头，获取版本、名称、顶点数、动画数、贴图数等基础元数据。
- 输出 `manifest.json`，记录解析结果与转换状态。
- 输出最小 glTF 2.0 空场景文件 `model.gltf`，作为后续填充几何体的结构占位。

> **调研结论**：crates.io 上的 `wow-m2`（warcraft-rs 生态）主要用于解析 M2 与版本转换，并不直接导出 glTF。因此本 PoC 不引入该依赖，后续 Phase 3 可基于手动解析结果构建 glTF，或评估 `wow.export` 等现有工具。

完整网格、骨骼、材质与动画转换计划在 Phase 3 实现。

## 构建

需要安装 Rust 工具链（>= 1.92，与 `wow_m2` MSRV 一致）：

```bash
cd tools/model-converter
cargo build --release
```

构建产物位于 `target/release/model-converter`。

## 使用

```bash
model-converter convert-m2 \
  --input /path/to/model.m2 \
  --output /path/to/output \
  --texture-search-path /path/to/textures
```

输出目录结构：

```
output/
├── model.gltf
└── manifest.json
```

## 依赖

- [clap](https://crates.io/crates/clap) — CLI 参数解析
- [serde](https://crates.io/crates/serde) / [serde_json](https://crates.io/crates/serde_json) — JSON 序列化
- [anyhow](https://crates.io/crates/anyhow) — 错误处理
