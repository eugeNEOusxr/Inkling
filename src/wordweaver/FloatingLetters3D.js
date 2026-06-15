import * as THREE from "three";
import { Real3DText } from "./Real3DText.js";
import { createTextPbrMaterial } from "./Real3DText.js";
import { indexOfFirstWordLetter } from "./atomTextAnchor.js";

/**
 * Per-character extruded 3D letters (TextGeometry) — no canvas planes.
 * @param {string} text
 * @param {import('./letterTypography.js').LetterTypography} typography
 * @param {number} [layoutScale]
 */
export function createFloatingLettersGroup(text, typography, layoutScale = 1) {
  const group = new THREE.Group();
  const disposed = /** @type {Real3DText[]} */ ([]);
  const raw = String(text || "").trim();
  if (!raw) return { group, disposed, letters: disposed };

  const fontSize = (typography.fontSize ?? 0.72) * layoutScale;
  const color = typography.color ?? 0x38bdf8;
  const glowColor = typography.glowColor ?? color;

  const chars = [...raw];
  const anchorCharIdx = indexOfFirstWordLetter(raw);
  const charWidth = fontSize * 0.42;
  const totalW = chars.filter((c) => c !== " ").length * charWidth;
  let cursor = -totalW * 0.5;
  const spread = Math.max(0.65, Math.min(chars.length * 0.09, 1.4)) * layoutScale;

  chars.forEach((ch, i) => {
    if (ch === " ") {
      cursor += charWidth * 0.6;
      return;
    }

    const letter = new Real3DText(ch, {
      fontSize: fontSize * 0.55,
      color,
      glowColor,
      metalness: 0.88,
      roughness: 0.25,
      emissiveIntensity: 0.55,
      depth: fontSize * 0.08
    });

    const lg = letter.getGroup();
    const wave = i * 0.61;
    lg.position.set(
      cursor + charWidth * 0.5,
      Math.sin(wave) * spread * 0.22,
      Math.cos(wave * 1.1) * spread * 0.18
    );
    lg.rotation.set(
      Math.sin(wave * 0.4) * 0.12,
      Math.cos(wave * 0.35) * 0.18,
      Math.sin(wave * 0.55) * 0.08
    );
    lg.userData.type = "weave-letter";
    lg.userData.letterIndex = i;
    lg.userData.isTextAnchorLetter = i === anchorCharIdx;
    lg.userData.letterPhase = wave;
    lg.userData.basePosition = lg.position.clone();
    lg.userData.baseRotation = lg.rotation.clone();

    group.add(lg);
    disposed.push(letter);
    cursor += charWidth;
  });

  group.userData.type = "weave-letters";
  group.userData.letterCount = disposed.length;
  return { group, disposed, letters: disposed };
}

/**
 * @param {THREE.Group} lettersGroup
 * @param {number} t
 */
export function animateFloatingLetters(lettersGroup, t) {
  lettersGroup.children.forEach((child) => {
    if (child.userData.type !== "weave-letter") return;
    const phase = child.userData.letterPhase ?? 0;
    const base = child.userData.basePosition;
    const baseRot = child.userData.baseRotation;
    if (!base || !baseRot) return;
    child.position.set(
      base.x + Math.sin(t * 0.85 + phase) * 0.06,
      base.y + Math.sin(t * 1.1 + phase * 1.2) * 0.1,
      base.z + Math.cos(t * 0.9 + phase) * 0.07
    );
    child.rotation.set(
      baseRot.x + Math.sin(t * 0.5 + phase) * 0.04,
      baseRot.y + Math.cos(t * 0.45 + phase) * 0.05,
      baseRot.z + Math.sin(t * 0.7 + phase) * 0.03
    );
  });
}
