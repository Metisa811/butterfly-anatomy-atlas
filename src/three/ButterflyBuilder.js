import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ANATOMY_STRUCTURES } from '../data/anatomyData.js';
import { TextureGenerator } from './TextureGenerator.js';

/**
 * Constructs a complete, scientifically proportioned 3D anatomical specimen of
 * Danaus plexippus with 28 independent raycast-selectable components across
 * all five anatomical systems, plus kinematic pivots for realistic wing flapping
 * and proboscis extension.
 */
export class ButterflyBuilder {
  constructor() {
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = 'Danaus_plexippus_Specimen';

    // Map of structureId -> { group, meshes, materials, basePosition, explodeVector, explodeStage, data }
    this.structureRegistry = new Map();
    this.selectableMeshes = [];

    // Kinematic pivot references for KinematicsEngine
    this.kinematicRig = {
      bodyGroup: new THREE.Group(),
      forewingLeftPivot: new THREE.Group(),
      forewingRightPivot: new THREE.Group(),
      hindwingLeftPivot: new THREE.Group(),
      hindwingRightPivot: new THREE.Group(),
      abdomenPivot: new THREE.Group(),
      antennaLeftPivot: new THREE.Group(),
      antennaRightPivot: new THREE.Group(),
      proboscisMesh: null
    };

    this.currentSex = 'male';
    this.proboscisExtension = 0; // 0 = coiled, 1 = extended
  }

  buildSpecimen(sex = 'male') {
    this.currentSex = sex;
    this.clearSpecimen();

    const wingTextures = TextureGenerator.createWingTextures(sex);
    const exoSpotTex = TextureGenerator.createExoskeletonSpottedTexture();

    this.rootGroup.add(this.kinematicRig.bodyGroup);

    // Initialize registry wrappers for all 28 structures in ANATOMY_STRUCTURES
    for (const item of ANATOMY_STRUCTURES) {
      const group = new THREE.Group();
      group.name = item.id;
      group.userData.structureId = item.id;

      this.structureRegistry.set(item.id, {
        id: item.id,
        group,
        meshes: [],
        materials: [],
        originalColors: [],
        basePosition: new THREE.Vector3(0, 0, 0),
        explodeVector: new THREE.Vector3(...item.explodeVector),
        explodeStage: item.explodeStage,
        data: item,
        visible: true,
        opacityMode: 'normal' // 'normal' | 'faded' | 'hidden'
      });
    }

    // Build all 5 anatomical systems
    this.buildExternalAndHead(exoSpotTex);
    this.buildThoraxAndLegs(exoSpotTex);
    this.buildWingsAndAxillaries(wingTextures, sex);
    this.buildInternalOrgans(sex);

    // Register all child meshes for raycasting
    for (const [id, entry] of this.structureRegistry.entries()) {
      entry.group.traverse((child) => {
        if (child.isMesh) {
          child.userData.structureId = id;
          child.castShadow = true;
          child.receiveShadow = true;
          entry.meshes.push(child);
          if (child.material) {
            entry.materials.push(child.material);
            entry.originalColors.push(child.material.color.clone());
          }
          this.selectableMeshes.push(child);
        }
      });
    }

    return this.rootGroup;
  }

  clearSpecimen() {
    while (this.rootGroup.children.length > 0) {
      this.rootGroup.remove(this.rootGroup.children[0]);
    }
    this.kinematicRig.bodyGroup = new THREE.Group();
    this.kinematicRig.forewingLeftPivot = new THREE.Group();
    this.kinematicRig.forewingRightPivot = new THREE.Group();
    this.kinematicRig.hindwingLeftPivot = new THREE.Group();
    this.kinematicRig.hindwingRightPivot = new THREE.Group();
    this.kinematicRig.abdomenPivot = new THREE.Group();
    this.kinematicRig.antennaLeftPivot = new THREE.Group();
    this.kinematicRig.antennaRightPivot = new THREE.Group();
    this.structureRegistry.clear();
    this.selectableMeshes = [];
  }

  attachToStructure(id, meshOrGroup, parentOverride = null) {
    const entry = this.structureRegistry.get(id);
    if (!entry) return;
    entry.group.add(meshOrGroup);
    const targetParent = parentOverride || this.kinematicRig.bodyGroup;
    if (!entry.group.parent) {
      targetParent.add(entry.group);
    }
  }

  // ===========================================================================
  // A & B. EXTERNAL MORPHOLOGY, HEAD CAPSULE & SENSORY ORGANS
  // ===========================================================================
  buildExternalAndHead(exoSpotTex) {
    const chitinMat = () => new THREE.MeshStandardMaterial({
      color: 0x1b1d22,
      map: exoSpotTex,
      roughness: 0.62,
      metalness: 0.08
    });

    // 1. Head Capsule (Cranium) at Z = +1.35
    const headGeo = new THREE.SphereGeometry(0.28, 28, 24);
    headGeo.scale(1.15, 0.95, 0.85);
    const headMesh = new THREE.Mesh(headGeo, chitinMat());
    headMesh.position.set(0, 0.08, 1.35);
    this.attachToStructure('head_capsule', headMesh);

    // 2. Compound Eyes (Oculi Compositi)
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0x231915,
      roughness: 0.22,
      metalness: 0.25
    });
    const eyeGroup = new THREE.Group();
    for (const side of [-1, 1]) {
      const eyeGeo = new THREE.SphereGeometry(0.185, 24, 20);
      eyeGeo.scale(0.85, 1.05, 1.0);
      const eyeMesh = new THREE.Mesh(eyeGeo, eyeMat.clone());
      eyeMesh.position.set(side * 0.25, 0.09, 1.38);
      eyeGroup.add(eyeMesh);
    }
    this.attachToStructure('compound_eyes', eyeGroup);

    // 3. Antennae (Left & Right with Scape, Pedicel, Flagellum, and Distal Club)
    this.kinematicRig.antennaLeftPivot.position.set(-0.11, 0.24, 1.44);
    this.kinematicRig.antennaRightPivot.position.set(0.11, 0.24, 1.44);
    this.kinematicRig.bodyGroup.add(this.kinematicRig.antennaLeftPivot);
    this.kinematicRig.bodyGroup.add(this.kinematicRig.antennaRightPivot);

    const buildAntenna = (side, id, pivot) => {
      const antGroup = new THREE.Group();
      const antMat = new THREE.MeshStandardMaterial({
        color: 0x18181c,
        roughness: 0.5,
        metalness: 0.1
      });
      const clubTipMat = new THREE.MeshStandardMaterial({
        color: 0xd96b27,
        roughness: 0.4
      });

      // Scape & Pedicel
      const scape = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.12, 12), antMat);
      scape.position.set(0, 0.05, 0.04);
      scape.rotation.x = 0.6;
      antGroup.add(scape);

      // Curved Flagellum
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.08, 0.06),
        new THREE.Vector3(side * 0.28, 0.35, 0.65),
        new THREE.Vector3(side * 0.62, 0.56, 1.28),
        new THREE.Vector3(side * 0.85, 0.62, 1.68)
      ]);
      const flagGeo = new THREE.TubeGeometry(curve, 32, 0.018, 10, false);
      const flagMesh = new THREE.Mesh(flagGeo, antMat);
      antGroup.add(flagMesh);

      // Clavate Club (Distal swelling)
      const clubGeo = new THREE.SphereGeometry(0.052, 16, 14);
      clubGeo.scale(0.75, 0.75, 2.6);
      const clubMesh = new THREE.Mesh(clubGeo, clubTipMat);
      clubMesh.position.set(side * 0.88, 0.63, 1.74);
      clubMesh.rotation.y = side * 0.42;
      clubMesh.rotation.x = -0.18;
      antGroup.add(clubMesh);

      this.attachToStructure(id, antGroup, pivot);
    };

    buildAntenna(-1, 'antenna_left', this.kinematicRig.antennaLeftPivot);
    buildAntenna(1, 'antenna_right', this.kinematicRig.antennaRightPivot);

    // 4. Labial Palps (Paired upturned sensory palps flanking proboscis)
    const palpGroup = new THREE.Group();
    const palpMat = chitinMat();
    for (const side of [-1, 1]) {
      const palpCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.08, -0.08, 1.46),
        new THREE.Vector3(side * 0.10, -0.02, 1.62),
        new THREE.Vector3(side * 0.09, 0.11, 1.68)
      ]);
      const palpGeo = new THREE.TubeGeometry(palpCurve, 14, 0.036, 10, false);
      const palpMesh = new THREE.Mesh(palpGeo, palpMat.clone());
      palpGroup.add(palpMesh);
    }
    this.attachToStructure('labial_palps', palpGroup);

    // 5. Galeal Proboscis (Haustellum) — dynamically updatable between spiral coil & extended
    const probMat = new THREE.MeshStandardMaterial({
      color: 0x141418,
      roughness: 0.35,
      metalness: 0.15
    });
    const probGeo = this.createProboscisGeometry(0);
    const probMesh = new THREE.Mesh(probGeo, probMat);
    this.kinematicRig.proboscisMesh = probMesh;
    this.attachToStructure('proboscis', probMesh);

    // 6. Abdomen Exoskeleton (Segments A1-A10 with tergite/sternite segmentation rings)
    this.kinematicRig.abdomenPivot.position.set(0, -0.02, -0.58);
    this.kinematicRig.bodyGroup.add(this.kinematicRig.abdomenPivot);

    const abdGroup = new THREE.Group();
    const abdMat = new THREE.MeshStandardMaterial({
      color: 0x1e2026,
      map: exoSpotTex,
      roughness: 0.68,
      metalness: 0.05
    });

    // 10 articulated abdominal segments tapering toward A9-A10
    const segLengths = [0.22, 0.25, 0.27, 0.27, 0.26, 0.24, 0.22, 0.19, 0.15, 0.12];
    const segRadii =   [0.26, 0.30, 0.33, 0.34, 0.33, 0.31, 0.27, 0.23, 0.17, 0.11];
    let zCursor = -0.1;
    for (let i = 0; i < 10; i++) {
      const r1 = segRadii[i];
      const r2 = i < 9 ? segRadii[i + 1] * 0.96 : 0.05;
      const len = segLengths[i];
      const segGeo = new THREE.CylinderGeometry(r1, r2, len, 22, 1);
      segGeo.rotateX(Math.PI / 2);
      segGeo.scale(0.92, 1.05, 1.0);
      const segMesh = new THREE.Mesh(segGeo, abdMat.clone());
      segMesh.position.set(0, -i * 0.012, zCursor - len * 0.5);
      abdGroup.add(segMesh);
      zCursor -= len * 0.95;
    }
    this.attachToStructure('abdomen_exoskeleton', abdGroup, this.kinematicRig.abdomenPivot);
  }

  createProboscisGeometry(extensionFactor = 0) {
    // Interpolates smoothly between a tight sub-cranial Archimedes spiral (0) and an extended feeding siphon (1)
    const pts = [];
    const totalSteps = 55;
    for (let i = 0; i <= totalSteps; i++) {
      const t = i / totalSteps;
      // Coiled coordinates
      const angle = t * Math.PI * 5.2;
      const radius = 0.16 * (1 - t * 0.72);
      const coilY = -0.12 - Math.cos(angle) * radius;
      const coilZ = 1.48 + Math.sin(angle) * radius;

      // Extended coordinates
      const extY = -0.08 - t * 0.55 - Math.sin(t * Math.PI) * 0.12;
      const extZ = 1.48 + t * 1.45;

      const y = THREE.MathUtils.lerp(coilY, extY, extensionFactor);
      const z = THREE.MathUtils.lerp(coilZ, extZ, extensionFactor);
      pts.push(new THREE.Vector3(0, y, z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    return new THREE.TubeGeometry(curve, 50, 0.022, 10, false);
  }

  updateProboscisExtension(factor) {
    this.proboscisExtension = factor;
    if (this.kinematicRig.proboscisMesh) {
      this.kinematicRig.proboscisMesh.geometry.dispose();
      this.kinematicRig.proboscisMesh.geometry = this.createProboscisGeometry(factor);
    }
  }

  // ===========================================================================
  // C. THORAX TAGMATA & LOCOMOTORY APPENDAGES
  // ===========================================================================
  buildThoraxAndLegs(exoSpotTex) {
    const thoraxMat = () => new THREE.MeshStandardMaterial({
      color: 0x17191e,
      map: exoSpotTex,
      roughness: 0.58,
      metalness: 0.08
    });

    // 1. Prothorax (Anterior collar & pronotum)
    const proGeo = new THREE.SphereGeometry(0.29, 24, 18);
    proGeo.scale(1.05, 0.92, 0.75);
    const proMesh = new THREE.Mesh(proGeo, thoraxMat());
    proMesh.position.set(0, 0.06, 0.95);
    this.attachToStructure('prothorax', proMesh);

    // 2. Mesothorax (Vaulted mesoscutum, scutellum, and mesopleura)
    const mesoGroup = new THREE.Group();
    const mesoGeo = new THREE.SphereGeometry(0.48, 32, 24);
    mesoGeo.scale(0.95, 1.12, 1.25);
    const mesoMesh = new THREE.Mesh(mesoGeo, thoraxMat());
    mesoMesh.position.set(0, 0.08, 0.25);
    mesoGroup.add(mesoMesh);

    // Mesoscutellum dorsal lobe
    const scutellumGeo = new THREE.SphereGeometry(0.24, 20, 16);
    scutellumGeo.scale(0.9, 0.7, 1.1);
    const scutellum = new THREE.Mesh(scutellumGeo, thoraxMat());
    scutellum.position.set(0, 0.42, -0.05);
    mesoGroup.add(scutellum);
    this.attachToStructure('mesothorax', mesoGroup);

    // 3. Metathorax (Metanotum and metapleura)
    const metaGeo = new THREE.SphereGeometry(0.38, 26, 20);
    metaGeo.scale(0.92, 0.98, 0.85);
    const metaMesh = new THREE.Mesh(metaGeo, thoraxMat());
    metaMesh.position.set(0, 0.03, -0.35);
    this.attachToStructure('metathorax', metaMesh);

    // 4. Reduced Nymphalid Prothoracic Forelegs (Folded brush-feet)
    const forelegGroup = new THREE.Group();
    const legMat = new THREE.MeshStandardMaterial({
      color: 0x16171b,
      roughness: 0.48,
      metalness: 0.12
    });
    for (const side of [-1, 1]) {
      const flCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.14, -0.14, 0.92), // Coxa
        new THREE.Vector3(side * 0.22, -0.32, 1.08), // Femur-tibia knee
        new THREE.Vector3(side * 0.18, -0.22, 0.88), // Folded tibia
        new THREE.Vector3(side * 0.16, -0.34, 1.02)  // Brush-like fused tarsus
      ]);
      const flGeo = new THREE.TubeGeometry(flCurve, 20, 0.024, 8, false);
      forelegGroup.add(new THREE.Mesh(flGeo, legMat.clone()));
    }
    this.attachToStructure('forelegs_reduced', forelegGroup);

    // 5 & 6. Articulated Walking Midlegs & Hindlegs (Coxa, Trochanter, Femur, Tibia + Spurs, 5 Tarsomeres, Claws)
    const buildWalkingLegPair = (zBase, spreadZ, id) => {
      const pairGroup = new THREE.Group();
      for (const side of [-1, 1]) {
        const legCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * 0.24, -0.22, zBase),               // Coxa & Trochanter
          new THREE.Vector3(side * 0.68, -0.08, zBase + spreadZ * 0.3), // Femoral-tibial joint
          new THREE.Vector3(side * 0.92, -0.78, zBase + spreadZ * 0.7), // Distal Tibia
          new THREE.Vector3(side * 1.12, -1.02, zBase + spreadZ * 0.9), // Tarsomeres T1-T5
          new THREE.Vector3(side * 1.22, -1.06, zBase + spreadZ * 1.0)  // Pretarsus
        ]);
        const segGeo = new THREE.TubeGeometry(legCurve, 28, 0.028, 10, false);
        pairGroup.add(new THREE.Mesh(segGeo, legMat.clone()));

        // Apical tibial spurs
        const spurGeo = new THREE.ConeGeometry(0.018, 0.09, 8);
        const spur = new THREE.Mesh(spurGeo, legMat.clone());
        spur.position.set(side * 0.92, -0.80, zBase + spreadZ * 0.7);
        spur.rotation.z = side * 0.5;
        pairGroup.add(spur);

        // Bifid pretarsal claws (ungues)
        for (const clawOffset of [-0.025, 0.025]) {
          const clawGeo = new THREE.ConeGeometry(0.014, 0.075, 8);
          const claw = new THREE.Mesh(clawGeo, legMat.clone());
          claw.position.set(side * 1.24, -1.07, zBase + spreadZ * 1.0 + clawOffset);
          claw.rotation.z = side * 1.1;
          pairGroup.add(claw);
        }
      }
      this.attachToStructure(id, pairGroup);
    };

    buildWalkingLegPair(0.22, 0.35, 'midlegs');
    buildWalkingLegPair(-0.34, -0.65, 'hindlegs');
  }

  // ===========================================================================
  // D. WINGS, COMSTOCK-NEEDHAM VENATION RELIEF & AXILLARY BASES
  // ===========================================================================
  buildWingsAndAxillaries(wingTextures, sex) {
    // 1. Wing Base Axillary Sclerites & Tegulae
    const axGroup = new THREE.Group();
    const axMat = new THREE.MeshStandardMaterial({
      color: 0x262930,
      roughness: 0.5,
      metalness: 0.15
    });
    for (const side of [-1, 1]) {
      // Tegula (scale-covered shoulder sclerite guarding forewing base)
      const tegGeo = new THREE.SphereGeometry(0.13, 16, 12);
      tegGeo.scale(0.6, 0.8, 1.5);
      const tegMesh = new THREE.Mesh(tegGeo, axMat.clone());
      tegMesh.position.set(side * 0.42, 0.32, 0.42);
      axGroup.add(tegMesh);

      // Axillary hinge sclerite cluster
      const hingeGeo = new THREE.BoxGeometry(0.14, 0.08, 0.22);
      const hingeMesh = new THREE.Mesh(hingeGeo, axMat.clone());
      hingeMesh.position.set(side * 0.44, 0.26, -0.22);
      axGroup.add(hingeMesh);
    }
    this.attachToStructure('wing_base_axillaries', axGroup);

    // 2. Configure Wing Kinematic Pivots at Thoracic Wing Processes
    this.kinematicRig.forewingLeftPivot.position.set(-0.38, 0.28, 0.34);
    this.kinematicRig.forewingRightPivot.position.set(0.38, 0.28, 0.34);
    this.kinematicRig.hindwingLeftPivot.position.set(-0.34, 0.22, -0.24);
    this.kinematicRig.hindwingRightPivot.position.set(0.34, 0.22, -0.24);

    this.kinematicRig.bodyGroup.add(this.kinematicRig.forewingLeftPivot);
    this.kinematicRig.bodyGroup.add(this.kinematicRig.forewingRightPivot);
    this.kinematicRig.bodyGroup.add(this.kinematicRig.hindwingLeftPivot);
    this.kinematicRig.bodyGroup.add(this.kinematicRig.hindwingRightPivot);

    // 3. Build Forewings & Hindwings with Independent Dorsal/Ventral Surfaces & 3D Tubular Veins
    const fwLeft = this.createDetailedWingAssembly('forewing', -1, wingTextures, sex);
    const fwRight = this.createDetailedWingAssembly('forewing', 1, wingTextures, sex);
    const hwLeft = this.createDetailedWingAssembly('hindwing', -1, wingTextures, sex);
    const hwRight = this.createDetailedWingAssembly('hindwing', 1, wingTextures, sex);

    this.attachToStructure('forewing_left', fwLeft, this.kinematicRig.forewingLeftPivot);
    this.attachToStructure('forewing_right', fwRight, this.kinematicRig.forewingRightPivot);
    this.attachToStructure('hindwing_left', hwLeft, this.kinematicRig.hindwingLeftPivot);
    this.attachToStructure('hindwing_right', hwRight, this.kinematicRig.hindwingRightPivot);
  }

  createDetailedWingAssembly(wingType, side, wingTextures, sex) {
    const assembly = new THREE.Group();
    const isForewing = wingType === 'forewing';

    // Define anatomically accurate 2D silhouette in wing-local space (X = span, Z = chord)
    const shape = new THREE.Shape();
    if (isForewing) {
      // High-aspect-ratio Monarch forewing contour (span ~4.6 units, chord ~2.4 units)
      shape.moveTo(0, 0);
      shape.bezierCurveTo(1.2, 0.55, 3.1, 1.35, 4.45, 1.72); // Costal margin (Costa)
      shape.bezierCurveTo(4.78, 1.78, 4.85, 1.52, 4.65, 1.15); // Rounded Apex
      shape.bezierCurveTo(4.25, 0.42, 3.55, -0.45, 2.85, -0.92); // Outer margin (Termen)
      shape.bezierCurveTo(2.45, -1.12, 1.95, -1.05, 1.35, -0.82); // Tornus
      shape.bezierCurveTo(0.75, -0.58, 0.25, -0.25, 0, 0); // Inner/Anal margin
    } else {
      // Rounded Monarch hindwing contour (span ~3.3 units, chord ~2.6 units)
      shape.moveTo(0, 0);
      shape.bezierCurveTo(0.45, 0.35, 1.65, 0.52, 2.75, 0.28); // Costal margin + humeral lobe
      shape.bezierCurveTo(3.35, 0.05, 3.52, -0.65, 3.22, -1.35); // Outer margin (Termen)
      shape.bezierCurveTo(2.78, -2.15, 1.85, -2.48, 0.95, -2.22); // Posterior lobe
      shape.bezierCurveTo(0.35, -1.85, 0.08, -0.85, 0, 0); // Anal margin
    }

    const baseGeo = new THREE.ShapeGeometry(shape, 36);
    // Rotate from XY plane into XZ horizontal wing plane and apply natural aerodynamic camber
    const pos = baseGeo.attributes.position;
    const uvs = baseGeo.attributes.uv;

    // Normalize UVs to [0, 1] bounding box so procedural venation map aligns cleanly
    baseGeo.computeBoundingBox();
    const min = baseGeo.boundingBox.min;
    const max = baseGeo.boundingBox.max;
    const rangeX = max.x - min.x || 1;
    const rangeY = max.y - min.y || 1;

    for (let i = 0; i < pos.count; i++) {
      const rawX = pos.getX(i);
      const rawY = pos.getY(i);

      const u = (rawX - min.x) / rangeX;
      // Flip V so anterior costa maps to top of canvas
      const v = 1.0 - (rawY - min.y) / rangeY;
      uvs.setXY(i, u, v);

      // Subtle dorsal-convex airfoil camber across chord and span
      const camberY = Math.sin(u * Math.PI) * 0.07 + Math.sin((1 - v) * Math.PI) * 0.04;
      pos.setXYZ(i, side * rawX, camberY, -rawY);
    }
    if (side === -1) {
      // Reverse triangle winding when mirrored to preserve outward normals
      const index = baseGeo.getIndex();
      if (index) {
        const arr = index.array;
        for (let i = 0; i < arr.length; i += 3) {
          const tmp = arr[i + 1];
          arr[i + 1] = arr[i + 2];
          arr[i + 2] = tmp;
        }
        index.needsUpdate = true;
      }
    }
    baseGeo.computeVertexNormals();

    // Dorsal Wing Surface Mesh
    const dorsalMat = new THREE.MeshStandardMaterial({
      map: isForewing ? wingTextures.forewingDorsalMap : wingTextures.hindwingDorsalMap,
      bumpMap: wingTextures.scaleBumpMap,
      bumpScale: 0.015,
      roughness: 0.65,
      metalness: 0.04,
      side: THREE.DoubleSide
    });
    const dorsalMesh = new THREE.Mesh(baseGeo, dorsalMat);
    dorsalMesh.position.y = 0.008;
    assembly.add(dorsalMesh);

    // Ventral Wing Surface Mesh (offset slightly downward so ventral camera sees true ventral pattern)
    const ventralMat = new THREE.MeshStandardMaterial({
      map: isForewing ? wingTextures.forewingVentralMap : wingTextures.hindwingVentralMap,
      bumpMap: wingTextures.scaleBumpMap,
      bumpScale: 0.015,
      roughness: 0.72,
      metalness: 0.02,
      side: THREE.DoubleSide
    });
    const ventralMesh = new THREE.Mesh(baseGeo.clone(), ventralMat);
    ventralMesh.position.y = -0.008;
    assembly.add(ventralMesh);

    // 3D Tubular Chitinous Primary Veins (Sc, R-stem, CuA-stem, Anal) for physical depth
    const veinMat = new THREE.MeshStandardMaterial({
      color: 0x141418,
      roughness: 0.45,
      metalness: 0.1
    });

    const veinPaths = isForewing
      ? [
          [[0, 0.01, 0], [side * 2.1, 0.05, -0.82], [side * 4.35, 0.02, -1.58]], // Radial stem (R)
          [[0, 0.01, 0], [side * 1.8, 0.05, -0.15], [side * 3.55, 0.02, 0.45]],  // Cubital stem (CuA)
          [[0, 0.01, 0], [side * 1.4, 0.03, 0.45], [side * 2.75, 0.01, 0.85]]    // Anal vein (1A+2A)
        ]
      : [
          [[0, 0.01, 0], [side * 1.6, 0.04, -0.22], [side * 2.95, 0.02, 0.15]],  // Sc+R1 / Rs
          [[0, 0.01, 0], [side * 1.5, 0.04, 0.65], [side * 2.85, 0.02, 1.45]],   // CuA stem
          [[0, 0.01, 0], [side * 0.8, 0.03, 1.05], [side * 1.55, 0.01, 2.05]]    // Anal vein
        ];

    for (const pts of veinPaths) {
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
      const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.018, 8, false);
      assembly.add(new THREE.Mesh(tubeGeo, veinMat.clone()));
    }

    // Male Hindwing 3D Raised Androconial Scent Patch on Vein CuA2
    if (!isForewing && sex === 'male') {
      const patchGeo = new THREE.SphereGeometry(0.13, 16, 12);
      patchGeo.scale(1.4, 0.28, 0.75);
      const patchMesh = new THREE.Mesh(patchGeo, veinMat.clone());
      patchMesh.position.set(side * 1.65, 0.025, 0.98);
      patchMesh.rotation.y = side * -0.55;
      assembly.add(patchMesh);
    }

    return assembly;
  }

  // ===========================================================================
  // E. INTERNAL ANATOMICAL SYSTEMS (MUSCULAR, DIGESTIVE, CIRCULATORY, NERVOUS, TRACHEAL, REPRODUCTIVE)
  // ===========================================================================
  buildInternalOrgans(sex) {
    // 1. Indirect Flight Muscles — Dorsolongitudinal Muscles (DLMs)
    const dlmGroup = new THREE.Group();
    const dlmMat = new THREE.MeshStandardMaterial({
      color: 0xb9382c,
      roughness: 0.55,
      metalness: 0.05
    });
    for (const side of [-1, 1]) {
      for (let stack = 0; stack < 3; stack++) {
        const fiberGeo = new THREE.CapsuleGeometry(0.085, 0.52, 12, 16);
        fiberGeo.rotateX(Math.PI / 2);
        const fiberMesh = new THREE.Mesh(fiberGeo, dlmMat.clone());
        fiberMesh.position.set(side * 0.11, 0.22 - stack * 0.09, 0.22);
        dlmGroup.add(fiberMesh);
      }
    }
    this.attachToStructure('flight_muscles_dlm', dlmGroup);

    // 2. Indirect Flight Muscles — Dorsoventral Muscles (DVMs)
    const dvmGroup = new THREE.Group();
    const dvmMat = new THREE.MeshStandardMaterial({
      color: 0xd95344,
      roughness: 0.55,
      metalness: 0.05
    });
    for (const side of [-1, 1]) {
      for (const zOff of [0.38, 0.08, -0.25]) {
        const colGeo = new THREE.CapsuleGeometry(0.075, 0.42, 10, 14);
        const colMesh = new THREE.Mesh(colGeo, dvmMat.clone());
        colMesh.position.set(side * 0.25, 0.06, zOff);
        colMesh.rotation.z = side * 0.18;
        dvmGroup.add(colMesh);
      }
    }
    this.attachToStructure('flight_muscles_dvm', dvmGroup);

    // 3. Foregut: Cibarial Sucking Pump, Esophagus & Expandable Crop
    const foregutGroup = new THREE.Group();
    const foregutMat = new THREE.MeshStandardMaterial({
      color: 0xd48c46,
      roughness: 0.42,
      metalness: 0.08
    });
    // Sucking pump inside head
    const pumpGeo = new THREE.SphereGeometry(0.11, 16, 14);
    pumpGeo.scale(0.85, 0.85, 1.3);
    const pumpMesh = new THREE.Mesh(pumpGeo, foregutMat.clone());
    pumpMesh.position.set(0, 0.06, 1.32);
    foregutGroup.add(pumpMesh);

    // Esophagus tube through cervix & thorax
    const esophCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.05, 1.25),
      new THREE.Vector3(0, -0.02, 0.55),
      new THREE.Vector3(0, -0.04, -0.55),
      new THREE.Vector3(0, -0.03, -0.95)
    ]);
    foregutGroup.add(new THREE.Mesh(new THREE.TubeGeometry(esophCurve, 24, 0.032, 10, false), foregutMat.clone()));

    // Lateral Crop (Ingluvies) sac in anterior abdomen
    const cropGeo = new THREE.SphereGeometry(0.18, 20, 16);
    cropGeo.scale(0.95, 0.85, 1.45);
    const cropMesh = new THREE.Mesh(cropGeo, foregutMat.clone());
    cropMesh.position.set(-0.08, 0.06, -1.05);
    foregutGroup.add(cropMesh);
    this.attachToStructure('foregut_crop', foregutGroup);

    // 4. Midgut (Ventriculus / Mesenteron)
    const midgutMat = new THREE.MeshStandardMaterial({
      color: 0x3b8a5a,
      roughness: 0.5,
      metalness: 0.05
    });
    const midgutGeo = new THREE.CapsuleGeometry(0.145, 0.72, 16, 20);
    midgutGeo.rotateX(Math.PI / 2);
    const midgutMesh = new THREE.Mesh(midgutGeo, midgutMat);
    midgutMesh.position.set(0, -0.03, -1.55);
    this.attachToStructure('midgut_ventriculus', midgutMesh);

    // 5. Hindgut (Ileum, Colon & Rectum)
    const hindgutGroup = new THREE.Group();
    const hindgutMat = new THREE.MeshStandardMaterial({
      color: 0x2d6a4f,
      roughness: 0.52
    });
    const ileumCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.03, -1.98),
      new THREE.Vector3(0.06, -0.01, -2.22),
      new THREE.Vector3(-0.04, -0.05, -2.44),
      new THREE.Vector3(0, -0.08, -2.68)
    ]);
    hindgutGroup.add(new THREE.Mesh(new THREE.TubeGeometry(ileumCurve, 20, 0.042, 10, false), hindgutMat.clone()));

    const rectumGeo = new THREE.SphereGeometry(0.11, 16, 14);
    rectumGeo.scale(0.85, 0.85, 1.5);
    const rectumMesh = new THREE.Mesh(rectumGeo, hindgutMat.clone());
    rectumMesh.position.set(0, -0.09, -2.72);
    hindgutGroup.add(rectumMesh);
    this.attachToStructure('hindgut_rectum', hindgutGroup);

    // 6. Malpighian Tubules (Convoluted excretory tubules at midgut-hindgut junction)
    const malpGroup = new THREE.Group();
    const malpMat = new THREE.MeshStandardMaterial({
      color: 0xeab308,
      roughness: 0.4
    });
    for (const side of [-1, 1]) {
      const mCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.08, -0.03, -1.95),
        new THREE.Vector3(side * 0.21, 0.05, -1.55),
        new THREE.Vector3(side * 0.19, -0.11, -1.35),
        new THREE.Vector3(side * 0.17, -0.08, -1.85),
        new THREE.Vector3(side * 0.09, -0.09, -2.55)
      ]);
      malpGroup.add(new THREE.Mesh(new THREE.TubeGeometry(mCurve, 32, 0.018, 8, false), malpMat.clone()));
    }
    this.attachToStructure('malpighian_tubules', malpGroup);

    // 7. Dorsal Vessel (Chambered Abdominal Heart + Thoracic Aorta Loop + Scutellar Pulsatile Organ)
    const dvGroup = new THREE.Group();
    const dvMat = new THREE.MeshStandardMaterial({
      color: 0xe11d48,
      roughness: 0.38,
      metalness: 0.12
    });
    const aortaCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.08, 1.30),  // Head opening
      new THREE.Vector3(0, 0.14, 0.72),  // Cervix
      new THREE.Vector3(0, 0.36, 0.22),  // Dorsal thoracic arch & pulsatile organ
      new THREE.Vector3(0, 0.18, -0.45), // Entering abdomen
      new THREE.Vector3(0, 0.19, -1.45), // Abdominal heart mid-section
      new THREE.Vector3(0, 0.11, -2.55)  // Posterior heart terminus
    ]);
    dvGroup.add(new THREE.Mesh(new THREE.TubeGeometry(aortaCurve, 40, 0.034, 12, false), dvMat.clone()));

    // Ostia chambers along abdominal heart
    for (let i = 0; i < 6; i++) {
      const chGeo = new THREE.SphereGeometry(0.055, 12, 10);
      chGeo.scale(1.1, 0.8, 1.4);
      const ch = new THREE.Mesh(chGeo, dvMat.clone());
      ch.position.set(0, 0.18 - i * 0.012, -0.85 - i * 0.32);
      dvGroup.add(ch);
    }
    this.attachToStructure('dorsal_vessel', dvGroup);

    // 8. Central Nervous System (Supra-/Subesophageal Brain, Prothoracic, Pterothoracic & 4 Abdominal Ganglia)
    const cnsGroup = new THREE.Group();
    const cnsMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      roughness: 0.35,
      metalness: 0.1
    });
    // Paired ventral nerve cord connectives
    for (const side of [-0.025, 0.025]) {
      const cordCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side, 0.10, 1.35),  // Brain
        new THREE.Vector3(side, -0.05, 1.28), // Subesophageal ganglion
        new THREE.Vector3(side, -0.16, 0.88), // Prothoracic ganglion
        new THREE.Vector3(side, -0.22, 0.18), // Fused Pterothoracic ganglion
        new THREE.Vector3(side, -0.20, -1.15),
        new THREE.Vector3(side, -0.22, -2.45) // Terminal abdominal ganglion
      ]);
      cnsGroup.add(new THREE.Mesh(new THREE.TubeGeometry(cordCurve, 36, 0.014, 8, false), cnsMat.clone()));
    }

    // Ganglionic nodes: [z, y, radius, scaleX]
    const gangliaNodes = [
      [1.36, 0.11, 0.095, 1.8],  // Supraesophageal Brain + Optic Lobes
      [1.28, -0.05, 0.055, 1.2], // Subesophageal Ganglion
      [0.88, -0.16, 0.058, 1.2], // Prothoracic Ganglion
      [0.18, -0.22, 0.092, 1.4], // Fused Pterothoracic Ganglion
      [-1.05, -0.20, 0.042, 1.1], // Abdominal Ganglion 1
      [-1.48, -0.21, 0.042, 1.1], // Abdominal Ganglion 2
      [-1.92, -0.21, 0.042, 1.1], // Abdominal Ganglion 3
      [-2.38, -0.22, 0.054, 1.2]  // Terminal Caudal Ganglion
    ];
    for (const [gz, gy, gr, sx] of gangliaNodes) {
      const gGeo = new THREE.SphereGeometry(gr, 16, 12);
      gGeo.scale(sx, 0.85, 1.15);
      const gMesh = new THREE.Mesh(gGeo, cnsMat.clone());
      gMesh.position.set(0, gy, gz);
      cnsGroup.add(gMesh);
    }
    this.attachToStructure('nervous_system', cnsGroup);

    // 9. Tracheal Respiratory Network (Lateral Trunks, Air Sacs & Spiracular Branches)
    const trachGroup = new THREE.Group();
    const trachMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.3,
      metalness: 0.2
    });
    for (const side of [-1, 1]) {
      const trunkCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.16, 0.05, 1.15),
        new THREE.Vector3(side * 0.32, 0.02, 0.25),
        new THREE.Vector3(side * 0.24, -0.02, -0.85),
        new THREE.Vector3(side * 0.22, -0.04, -1.75),
        new THREE.Vector3(side * 0.14, -0.08, -2.50)
      ]);
      trachGroup.add(new THREE.Mesh(new THREE.TubeGeometry(trunkCurve, 32, 0.022, 8, false), trachMat.clone()));

      // Spiracular branches A1-A7
      for (let s = 0; s < 7; s++) {
        const sz = -0.78 - s * 0.25;
        const spGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.09, 8);
        spGeo.rotateZ(Math.PI / 2);
        const spMesh = new THREE.Mesh(spGeo, trachMat.clone());
        spMesh.position.set(side * 0.26, -0.04, sz);
        trachGroup.add(spMesh);
      }
    }
    this.attachToStructure('tracheal_system', trachGroup);

    // 10. Dimorphic Reproductive System (Male Fused Crimson Testis vs. Female Ovarioles & Bursa Copulatrix)
    const reproGroup = new THREE.Group();
    const reproMat = new THREE.MeshStandardMaterial({
      color: sex === 'male' ? 0xbe123c : 0x9333ea,
      roughness: 0.42
    });

    if (sex === 'male') {
      // Adult Lepidoptera feature a single median spherical fused testis (crimson-red in Monarchs)
      const testisGeo = new THREE.SphereGeometry(0.135, 20, 16);
      const testisMesh = new THREE.Mesh(testisGeo, reproMat.clone());
      testisMesh.position.set(0, 0.06, -1.75);
      reproGroup.add(testisMesh);

      // Paired vasa deferentia + accessory glands + ejaculatory duct
      for (const side of [-1, 1]) {
        const vdCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * 0.06, 0.04, -1.78),
          new THREE.Vector3(side * 0.16, -0.04, -2.05),
          new THREE.Vector3(0, -0.09, -2.42),
          new THREE.Vector3(0, -0.11, -2.78)
        ]);
        reproGroup.add(new THREE.Mesh(new THREE.TubeGeometry(vdCurve, 22, 0.024, 8, false), reproMat.clone()));
      }
    } else {
      // Female: 4 polytrophic ovarioles per side + prominent Bursa Copulatrix (spermatophore sac)
      const bursaGeo = new THREE.SphereGeometry(0.145, 20, 16);
      bursaGeo.scale(0.95, 0.9, 1.35);
      const bursaMesh = new THREE.Mesh(bursaGeo, reproMat.clone());
      bursaMesh.position.set(0.08, -0.05, -1.95);
      reproGroup.add(bursaMesh);

      for (const side of [-1, 1]) {
        for (let ov = 0; ov < 2; ov++) {
          const ovCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(side * (0.12 + ov * 0.04), 0.08, -1.35),
            new THREE.Vector3(side * (0.18 + ov * 0.04), 0.02, -1.85),
            new THREE.Vector3(0, -0.08, -2.48),
            new THREE.Vector3(0, -0.11, -2.78)
          ]);
          reproGroup.add(new THREE.Mesh(new THREE.TubeGeometry(ovCurve, 22, 0.025, 8, false), reproMat.clone()));
        }
      }
    }
    this.attachToStructure('reproductive_system', reproGroup);
  }

  // ===========================================================================
  // EXTERNAL GLTF/GLB LOADER INTEGRATION
  // ===========================================================================
  async loadExternalGLB(urlOrObjectUrl) {
    const loader = new GLTFLoader();
    return new Promise((resolve, reject) => {
      loader.load(
        urlOrObjectUrl,
        (gltf) => {
          const model = gltf.scene;
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          const scale = 8.0 / maxDim;
          model.scale.setScalar(scale);

          const center = box.getCenter(new THREE.Vector3()).multiplyScalar(scale);
          model.position.sub(center);

          // Map any loaded meshes so raycasting still selects anatomical regions by spatial proximity
          model.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              const wp = child.getWorldPosition(new THREE.Vector3());
              let mappedId = 'mesothorax';
              if (wp.z > 1.0) mappedId = 'head_capsule';
              else if (wp.z < -0.6) mappedId = 'abdomen_exoskeleton';
              else if (wp.x < -0.6 && wp.z >= -0.2) mappedId = 'forewing_left';
              else if (wp.x > 0.6 && wp.z >= -0.2) mappedId = 'forewing_right';
              else if (wp.x < -0.6 && wp.z < -0.2) mappedId = 'hindwing_left';
              else if (wp.x > 0.6 && wp.z < -0.2) mappedId = 'hindwing_right';

              child.userData.structureId = mappedId;
              const entry = this.structureRegistry.get(mappedId);
              if (entry) {
                entry.meshes.push(child);
              }
              this.selectableMeshes.push(child);
            }
          });

          this.rootGroup.add(model);
          resolve(model);
        },
        undefined,
        (err) => reject(err)
      );
    });
  }
}