import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { DIAGNOSTIC_LOG_INTERVAL_SECONDS } from "../constants";

export function useM2AnimationMixer(
  rootBone: THREE.Bone | null,
  skeleton: THREE.Skeleton | null,
  animationClip: THREE.AnimationClip | null,
  isPlaying: boolean,
  playbackRate: number,
) {
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionRef = useRef<THREE.AnimationAction | null>(null);

  useEffect(() => {
    if (!rootBone || !animationClip) {
      mixerRef.current = null;
      actionRef.current = null;
      return;
    }

    const mixer = new THREE.AnimationMixer(rootBone);
    const action = mixer.clipAction(animationClip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
    mixerRef.current = mixer;
    actionRef.current = action;

    return () => {
      action.stop();
      mixerRef.current = null;
      actionRef.current = null;
    };
  }, [rootBone, animationClip]);

  useEffect(() => {
    const action = actionRef.current;
    if (!action) return;

    action.paused = !isPlaying;
    action.timeScale = playbackRate;
  }, [isPlaying, playbackRate]);

  const lastLogTime = useRef(0);
  const nanReported = useRef(false);

  useFrame((_, delta) => {
    mixerRef.current?.update(delta);
    const action = actionRef.current;
    if (action && mixerRef.current) {
      const now = mixerRef.current.time;

      if (rootBone && !nanReported.current) {
        let hasNaN = false;
        rootBone.traverse((obj) => {
          if (obj instanceof THREE.Bone) {
            const pos = obj.position;
            const quat = obj.quaternion;
            const scale = obj.scale;
            if (
              !Number.isFinite(pos.x) ||
              !Number.isFinite(pos.y) ||
              !Number.isFinite(pos.z) ||
              !Number.isFinite(quat.x) ||
              !Number.isFinite(quat.y) ||
              !Number.isFinite(quat.z) ||
              !Number.isFinite(quat.w) ||
              !Number.isFinite(scale.x) ||
              !Number.isFinite(scale.y) ||
              !Number.isFinite(scale.z)
            ) {
              hasNaN = true;
            }
          }
        });
        if (hasNaN) {
          nanReported.current = true;

          console.error(
            "[M2Scene] NaN detected in skeleton at mixer time=",
            now.toFixed(2),
            "stopping animation",
          );
          action.stop();
          mixerRef.current.stopAllAction();
          skeleton?.pose();
          rootBone.updateMatrixWorld(true);
        }
      }

      if (now - lastLogTime.current > DIAGNOSTIC_LOG_INTERVAL_SECONDS) {
        lastLogTime.current = now;
        const bone0 = rootBone?.getObjectByName("bone_0") as
          THREE.Bone | undefined;

        console.log(
          "[M2Scene] mixer time=",
          now.toFixed(2),
          "bone_0 pos=",
          bone0?.position.toArray().map((v) => v.toFixed(2)),
        );
      }
    }
  });
}
