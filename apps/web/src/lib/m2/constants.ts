// M2 file format versions
export const M2_VERSION_WOTLK = 263;
export const M2_VERSION_CATACLYSM = 264;

// File magic numbers (little-endian uint32)
export const M2_MAGIC = 0x3032444d; // "MD20"
export const SKIN_MAGIC = 0x4e494b53; // "SKIN"
export const ANIM_FILE_MAGIC = 0x324d4641; // "AFM2"

// M2 header layout
export const M2_HEADER_SIZE = 16; // magic + version + nameLength + nameOffset

// Bone record layout
export const STANDARD_BONE_SIZE = 88;
export const BONE_STRIDE_CANDIDATES = [88, 92, 96] as const;

// Sequence flags determining external .anim file usage.
// See https://wowdev.wiki/M2
export const SEQUENCE_EXTERNAL_ANIM_MASK = 0x130;

// Sequence alias flag: when set, aliasNext points to the sequence containing
// the real animation data.
export const SEQUENCE_ALIAS_FLAG = 0x40;

// Sequence alias chain terminator
export const ALIAS_NEXT_TERMINATOR = 0xffff;

// External .anim file layout
export const ANIM_FILE_HEADER_SIZE = 8; // magic + chunkSize

// Sanity limit for animation track entry counts
export const MAX_TRACK_ENTRY_COUNT = 100_000;

// Component counts
export const COMPONENTS_PER_VECTOR = 3;
export const COMPONENTS_PER_QUATERNION = 4;
export const COMPONENTS_PER_UV = 2;

// Animation track value sizes in bytes
export const VECTOR_VALUE_SIZE_BYTES = 12; // 3 floats
export const QUATERNION_VALUE_SIZE_BYTES = 8; // 4 int16

// Quaternion int16 -> float decompression constants
export const QUATERNION_INT16_MAX = 32767;
export const QUATERNION_INT16_OFFSET = 32768;

// Minimum quaternion magnitude before normalization is unsafe
export const NORMALIZATION_EPSILON = 1e-6;

// Time conversion
export const MILLISECONDS_PER_SECOND = 1000;

// Vertex skinning
export const BONE_WEIGHT_MAX = 255;
export const MAX_BONE_INFLUENCES = 4;

// UV coordinate transform for M2 -> Three.js
export const UV_FLIP_V_SCALE = -1;
export const UV_FLIP_V_OFFSET = 1;

// Texture coordinate sets per vertex
export const TEXTURE_COORD_SETS = 2;

// Animation file naming
export const ANIM_FILE_EXTENSION = ".anim";
export const ANIM_ID_PADDING = 4;
export const SUB_ANIM_ID_PADDING = 2;

// Primitive byte widths
export const BYTES_PER_INT16 = 2;
export const BYTES_PER_UINT32 = 4;
export const BYTES_PER_FLOAT32 = 4;
