import * as THREE from 'three';

/**
 * Biologically grounded 3D Wing-Flapping Kinematics & Exploded Dissection Engine
 * for Danaus plexippus (based on Betts & Wootton, 1988).
 *
 * Models:
 * 1. Non-uniform downstroke/upstroke phase profile (faster, high-lift downstroke;
 *    supinated, lower-drag upstroke).
 * 2. Coupled 3-axis wing rotation around the thoracic wing bases:
 *    - Flapping elevation/depression (Z-axis roll)
 *    - Feathering pronation/supination pitch (X-axis pitch)
 *    - Lead-lag sweep (Y-axis yaw)
 * 3. Slight phase lag (~14 degrees) between forewing and hindwing despite amplexiform overlap.
 * 4. Counter-oscillating thoraco-abdominal pitch & vertical heave stabilization.
 * 5. Staggered 3-stage exploded dissection interpolation.
 */
export class KinematicsEngine {
  constructor(butterflyBuilder) {
    this.builder = butterflyBuilder;
    this.isFlapping = false;
    this.playbackSpeed = 1.0;
    this.phaseTime = 0;

    // Natural free-flight wingbeat frequency for Danaus plexippus is ~9.5 Hz
    this.baseFrequencyHz = 2.2; // Scaled for comfortable real-time visual inspection at 1.0x

    // Exploded view state (0.0 to 1.0)
    this.targetExplode = 0.0;
    this.currentExplode = 0.0;
  }

  setFlapping(active) {
    this.isFlapping = active;
  }

  setSpeed(multiplier) {
    this.playbackSpeed = multiplier;
  }

  setExplodeTarget(normalizedValue) {
    this.targetExplode = THREE.MathUtils.clamp(normalizedValue, 0, 1);
  }

  update(deltaSeconds) {
    const rig = this.builder.kinematicRig;
    if (!rig || !rig.forewingLeftPivot) return;

    // 1. Update Exploded Dissection Positions with Staggered Stage Easing
    this.currentExplode = THREE.MathUtils.lerp(
      this.currentExplode,
      this.targetExplode,
      Math.min(1, deltaSeconds * 8.5)
    );

    for (const entry of this.builder.structureRegistry.values()) {
      // Stagger explosion by anatomical stage:
      // Stage 1 (Tagmata) starts at 0.0; Stage 2 (Appendages/Wings) starts at 0.22; Stage 3 (Internal Organs) starts at 0.45
      let localT = 0;
      if (entry.explodeStage === 1) {
        localT = THREE.MathUtils.smoothstep(this.currentExplode, 0.0, 0.75);
      } else if (entry.explodeStage === 2) {
        localT = THREE.MathUtils.smoothstep(this.currentExplode, 0.18, 0.90);
      } else {
        localT = THREE.MathUtils.smoothstep(this.currentExplode, 0.42, 1.0);
      }

      entry.group.position.copy(entry.explodeVector).multiplyScalar(localT);
    }

    // 2. Update Wing-Flapping Kinematics
    if (this.isFlapping) {
      this.phaseTime += deltaSeconds * this.baseFrequencyHz * this.playbackSpeed * Math.PI * 2;
      const phi = this.phaseTime;

      // Non-harmonic waveform: adds 2nd harmonic asymmetry so downstroke and upstroke have natural biological inflection
      const rawWave = Math.sin(phi) + 0.18 * Math.sin(2 * phi - Math.PI / 3);
      // Forewing elevation angle: +68 deg dorsal clap to -42 deg ventral depression
      const fwFlapAngle = THREE.MathUtils.mapLinear(rawWave, -1.18, 1.18, -0.72, 1.12);

      // Hindwing follows forewing with a slight ~0.22 rad aerodynamic phase lag
      const hwWave = Math.sin(phi - 0.22) + 0.16 * Math.sin(2 * (phi - 0.22) - Math.PI / 3);
      const hwFlapAngle = THREE.MathUtils.mapLinear(hwWave, -1.16, 1.16, -0.68, 1.06);

      // Feathering (pronation on downstroke, supination on upstroke) proportional to angular velocity d(phi)/dt
      const fwFeatherPitch = Math.cos(phi) * 0.24;
      const hwFeatherPitch = Math.cos(phi - 0.22) * 0.28;

      // Lead-lag sweep (forward sweep during downstroke, aft sweep during upstroke)
      const fwSweepYaw = -Math.sin(phi) * 0.11;

      // Apply rotations to Left & Right Forewing Pivots
      rig.forewingLeftPivot.rotation.set(fwFeatherPitch, -fwSweepYaw, -fwFlapAngle);
      rig.forewingRightPivot.rotation.set(fwFeatherPitch, fwSweepYaw, fwFlapAngle);

      // Apply rotations to Left & Right Hindwing Pivots
      rig.hindwingLeftPivot.rotation.set(hwFeatherPitch, -fwSweepYaw * 0.7, -hwFlapAngle);
      rig.hindwingRightPivot.rotation.set(hwFeatherPitch, fwSweepYaw * 0.7, hwFlapAngle);

      // Subtle body heave & abdominal pitch counter-oscillation (inertially stabilizes flight attitude)
      rig.bodyGroup.position.y = -Math.sin(phi) * 0.11;
      rig.bodyGroup.rotation.x = Math.cos(phi) * 0.055;
      rig.abdomenPivot.rotation.x = -Math.sin(phi - 0.35) * 0.09;

      // Slight aerodynamic antennal buffeting
      rig.antennaLeftPivot.rotation.x = Math.sin(phi * 2) * 0.025;
      rig.antennaRightPivot.rotation.x = Math.sin(phi * 2 + 0.2) * 0.025;
    } else {
      // Smoothly damp back to natural resting/display posture (slight 12 deg dihedral)
      const damp = Math.min(1, deltaSeconds * 7.0);
      const restDihedral = 0.18;

      rig.forewingLeftPivot.rotation.x = THREE.MathUtils.lerp(rig.forewingLeftPivot.rotation.x, 0, damp);
      rig.forewingLeftPivot.rotation.y = THREE.MathUtils.lerp(rig.forewingLeftPivot.rotation.y, 0, damp);
      rig.forewingLeftPivot.rotation.z = THREE.MathUtils.lerp(rig.forewingLeftPivot.rotation.z, -restDihedral, damp);

      rig.forewingRightPivot.rotation.x = THREE.MathUtils.lerp(rig.forewingRightPivot.rotation.x, 0, damp);
      rig.forewingRightPivot.rotation.y = THREE.MathUtils.lerp(rig.forewingRightPivot.rotation.y, 0, damp);
      rig.forewingRightPivot.rotation.z = THREE.MathUtils.lerp(rig.forewingRightPivot.rotation.z, restDihedral, damp);

      rig.hindwingLeftPivot.rotation.x = THREE.MathUtils.lerp(rig.hindwingLeftPivot.rotation.x, 0, damp);
      rig.hindwingLeftPivot.rotation.y = THREE.MathUtils.lerp(rig.hindwingLeftPivot.rotation.y, 0, damp);
      rig.hindwingLeftPivot.rotation.z = THREE.MathUtils.lerp(rig.hindwingLeftPivot.rotation.z, -restDihedral * 0.75, damp);

      rig.hindwingRightPivot.rotation.x = THREE.MathUtils.lerp(rig.hindwingRightPivot.rotation.x, 0, damp);
      rig.hindwingRightPivot.rotation.y = THREE.MathUtils.lerp(rig.hindwingRightPivot.rotation.y, 0, damp);
      rig.hindwingRightPivot.rotation.z = THREE.MathUtils.lerp(rig.hindwingRightPivot.rotation.z, restDihedral * 0.75, damp);

      rig.bodyGroup.position.y = THREE.MathUtils.lerp(rig.bodyGroup.position.y, 0, damp);
      rig.bodyGroup.rotation.x = THREE.MathUtils.lerp(rig.bodyGroup.rotation.x, 0, damp);
      rig.abdomenPivot.rotation.x = THREE.MathUtils.lerp(rig.abdomenPivot.rotation.x, 0, damp);
    }
  }
}