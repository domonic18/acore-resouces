import * as THREE from "three";

// Default camera settings
export const DEFAULT_CAMERA_POSITION: [number, number, number] = [3, 3, 3];
export const DEFAULT_CAMERA_FOV = 50;

// Model root orientation correction
export const MODEL_ROOT_ROTATION_X = -Math.PI / 2;

// Default mesh material parameters
export const MATERIAL_DEFAULT_COLOR = 0xffffff;
export const MATERIAL_DEFAULT_ROUGHNESS = 0.7;
export const MATERIAL_DEFAULT_METALNESS = 0.1;
export const MATERIAL_DEFAULT_SIDE = THREE.DoubleSide;

// Grid rendering
export const GRID_FADE_DISTANCE = 25;

// Orbit controls auto-rotate speed
export const AUTO_ROTATE_SPEED = 1.5;

// Scene lighting
export const AMBIENT_LIGHT_INTENSITY = 0.8;
export const DIRECTIONAL_LIGHT_INTENSITY = 1.2;
export const DIRECTIONAL_LIGHT_POSITION: [number, number, number] = [5, 5, 5];

// Camera preset distance multipliers relative to model size
export const CAMERA_PRESET_DISTANCE_MULTIPLIER = 1.5;
export const CAMERA_BOTTOM_PRESET_MULTIPLIER = 0.6;

// Zoom factors applied to camera distance
export const ZOOM_IN_FACTOR = 0.8;
export const ZOOM_OUT_FACTOR = 1.25;

// Interval between skeleton diagnostic log outputs (seconds)
export const DIAGNOSTIC_LOG_INTERVAL_SECONDS = 1;

// Available animation playback rate options
export const PLAYBACK_RATE_OPTIONS = [0.25, 0.5, 1, 1.5, 2] as const;
