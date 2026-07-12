use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use serde::Serialize;
use serde_json::json;

#[derive(Parser)]
#[command(name = "model-converter")]
#[command(about = "M2 → glTF 转换工具 PoC")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// 将 .m2 文件转换为 glTF（PoC：当前仅输出元数据与空场景 glTF）
    ConvertM2 {
        /// 输入 .m2 文件路径
        #[arg(short, long)]
        input: PathBuf,

        /// 输出目录
        #[arg(short, long)]
        output: PathBuf,

        /// 贴图搜索路径（可多次指定）
        #[arg(short, long)]
        texture_search_paths: Vec<PathBuf>,
    },
}

#[derive(Serialize)]
struct Manifest {
    source: PathBuf,
    output: PathBuf,
    converted_at: String,
    status: String,
    m2_metadata: M2Metadata,
    texture_search_paths: Vec<PathBuf>,
    notes: String,
}

#[derive(Serialize)]
struct M2Metadata {
    version: u32,
    name: String,
    file_size: u64,
    vertices_count: Option<usize>,
    textures_count: Option<usize>,
    animations_count: Option<usize>,
}

fn main() {
    if let Err(err) = run() {
        eprintln!("error: {err:#}");
        std::process::exit(1);
    }
}

fn run() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::ConvertM2 {
            input,
            output,
            texture_search_paths,
        } => convert_m2(&input, &output, &texture_search_paths),
    }
}

fn convert_m2(input: &Path, output: &Path, texture_search_paths: &[PathBuf]) -> Result<()> {
    if !input.exists() {
        anyhow::bail!("输入文件不存在：{}", input.display());
    }

    fs::create_dir_all(output)
        .with_context(|| format!("无法创建输出目录：{}", output.display()))?;

    let file_size = fs::metadata(input)?.len();

    // 使用 wow_m2 解析 M2 文件头与基础元数据。
    // PoC 阶段不导出完整几何体，仅记录可用于后续构建 glTF 的信息。
    let m2_metadata = read_m2_metadata(input, file_size)?;

    // 生成最小 glTF 2.0 文件（空场景），作为后续填充几何体的占位结构。
    let gltf_path = output.join("model.gltf");
    write_minimal_gltf(&gltf_path)?;

    let manifest = Manifest {
        source: input.to_path_buf(),
        output: output.to_path_buf(),
        converted_at: iso_timestamp(),
        status: "poc_metadata_only".to_string(),
        m2_metadata,
        texture_search_paths: texture_search_paths.to_vec(),
        notes: "PoC：已解析 M2 元数据并生成空场景 glTF。完整网格、骨骼、动画转换待实现。".to_string(),
    };

    let manifest_path = output.join("manifest.json");
    let manifest_json = serde_json::to_string_pretty(&manifest)?;
    fs::write(&manifest_path, manifest_json)
        .with_context(|| format!("无法写入 manifest：{}", manifest_path.display()))?;

    println!("转换完成：{}" , output.display());
    println!("  glTF: {}", gltf_path.display());
    println!("  manifest: {}", manifest_path.display());

    Ok(())
}

fn read_m2_metadata(input: &Path, file_size: u64) -> Result<M2Metadata> {
    let data = fs::read(input)
        .with_context(|| format!("无法读取 M2 文件：{}", input.display()))?;

    if data.len() < 16 || &data[0..4] != b"MD20" {
        anyhow::bail!("不是有效的 M2 文件：{}", input.display());
    }

    let version = u32::from_le_bytes([data[4], data[5], data[6], data[7]]);
    let name_length = u32::from_le_bytes([data[8], data[9], data[10], data[11]]) as usize;
    let name_offset = u32::from_le_bytes([data[12], data[13], data[14], data[15]]) as usize;

    let name = read_c_string(&data, name_offset, name_length);

    // 仅在已验证版本上读取完整计数；其他版本安全降级。
    let (vertices_count, textures_count, animations_count) = if version == 263 {
        read_wotlk_counts(&data)
    } else {
        (None, None, None)
    };

    Ok(M2Metadata {
        version,
        name,
        file_size,
        vertices_count,
        textures_count,
        animations_count,
    })
}

fn read_wotlk_counts(data: &[u8]) -> (Option<usize>, Option<usize>, Option<usize>) {
    if data.len() < 20 + 26 * 4 {
        return (None, None, None);
    }

    let offsets: Vec<u32> = (0..26)
        .map(|i| {
            let off = 20 + i * 4;
            u32::from_le_bytes([data[off], data[off + 1], data[off + 2], data[off + 3]])
        })
        .collect();

    (
        Some(offsets[10] as usize), // nVertices
        Some(offsets[16] as usize), // nTextures
        Some(offsets[2] as usize),  // nAnimations
    )
}

fn read_c_string(data: &[u8], offset: usize, length: usize) -> String {
    let end = offset + length;
    let slice = if end > data.len() {
        &data[offset..]
    } else {
        &data[offset..end]
    };
    let nul_pos = slice.iter().position(|&b| b == 0).unwrap_or(slice.len());
    String::from_utf8_lossy(&slice[..nul_pos]).to_string()
}

fn write_minimal_gltf(path: &Path) -> Result<()> {
    let gltf = serde_json::json!({
        "asset": {
            "version": "2.0",
            "generator": "model-converter-poc"
        },
        "scene": 0,
        "scenes": [
            {
                "nodes": []
            }
        ],
        "nodes": []
    });

    fs::write(path, serde_json::to_string_pretty(&gltf)?)
        .with_context(|| format!("无法写入 glTF：{}", path.display()))?;
    Ok(())
}

fn iso_timestamp() -> String {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| format!("{}.{:03}Z", d.as_secs(), d.subsec_millis()))
        .unwrap_or_else(|_| "unknown".to_string())
}
