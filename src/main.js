import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  ANATOMICAL_SYSTEMS,
  ANATOMY_STRUCTURES,
  GUIDED_TOUR_STEPS
} from './data/anatomyData.js';
import { ButterflyBuilder } from './three/ButterflyBuilder.js';
import { KinematicsEngine } from './three/KinematicsEngine.js';

class ButterflyAtlasApp {
  constructor() {
    this.canvas = document.getElementById('webgl-canvas');
    this.leaderSvg = document.getElementById('leader-svg');
    this.calloutLayer = document.getElementById('callout-layer');
    this.hoverTooltip = document.getElementById('hover-tooltip');
    this.loadingOverlay = document.getElementById('loading-overlay');

    // Core State
    this.selectedId = null;
    this.hoveredId = null;
    this.isolatedId = null;
    this.dissectionMode = 'intact'; // 'intact' | 'cutaway' | 'schematic'
    this.showAllPins = true;
    this.currentTourIndex = 0;
    this.tourActive = true;

    // Camera transition state
    this.cameraGoalPos = new THREE.Vector3(0, 6.2, 5.2);
    this.cameraGoalTarget = new THREE.Vector3(0, 0, 0);
    this.isTransitioningCamera = false;

    this.pinElements = new Map();
    this.clock = new THREE.Clock();

    this.initWebGL();
    this.initSpecimen();
    this.initUI();
    this.applyGuidedTourStep(0);
    this.loadingOverlay.classList.add('hidden');

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  // ===========================================================================
  // 1. THREE.JS SCENE, STUDIO LIGHTING & ORBIT CONTROLS
  // ===========================================================================
  initWebGL() {
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        powerPreference: 'high-performance'
      });
    } catch (err) {
      document.getElementById('webgl-fallback').classList.remove('hidden');
      this.loadingOverlay.classList.add('hidden');
      throw err;
    }

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.renderer.setClearColor(0xffffff, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffffff);

    this.camera = new THREE.PerspectiveCamera(
      38,
      this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight),
      0.1,
      100
    );
    this.camera.position.set(0, 6.2, 5.2);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 1.4;
    this.controls.maxDistance = 22.0;

    //Interrupt automated camera glide if user manually drags viewport
    this.controls.addEventListener('start', () => {
      this.isTransitioningCamera = false;
    });

    // Studio scientific lighting rig on pure white background
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xf2f4f8, 1.35);
    hemiLight.position.set(0, 12, 0);
    this.scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffcf7, 1.65);
    keyLight.position.set(5, 11, 6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 26;
    const d = 6.5;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xeef4ff, 0.85);
    fillLight.position.set(-6, 5, -4);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.55);
    rimLight.position.set(0, -8, 3);
    this.scene.add(rimLight);

    // Subtle shadow-catcher plane beneath the specimen
    const shadowGeo = new THREE.PlaneGeometry(24, 24);
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.07 });
    this.shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadowPlane.rotation.x = -Math.PI / 2;
    this.shadowPlane.position.y = -2.25;
    this.shadowPlane.receiveShadow = true;
    this.scene.add(this.shadowPlane);

    // Raycaster & pointer state
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.pointerDownPos = new THREE.Vector2();

    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.clock.stop();
      } else {
        this.clock.start();
      }
    });
  }

  // ===========================================================================
  // 2. SPECIMEN INITIALIZATION & MATERIAL STATE MACHINE
  // ===========================================================================
  initSpecimen(sex = 'male') {
    if (!this.builder) {
      this.builder = new ButterflyBuilder();
      this.scene.add(this.builder.rootGroup);
      this.kinematics = new KinematicsEngine(this.builder);
    }

    this.builder.buildSpecimen(sex);
    this.createCalloutPins();
    this.applyDissectionRenderState();

    if (this.selectedId) {
      this.selectStructure(this.selectedId, false);
    } else {
      this.populateDefaultOverviewDossier();
    }
  }

  applyDissectionRenderState() {
    for (const [id, entry] of this.builder.structureRegistry.entries()) {
      const isSelected = id === this.selectedId;
      const isHovered = id === this.hoveredId;
      const isIsolated = this.isolatedId !== null;

      // Determine visibility
      let visible = entry.visible;
      if (isIsolated) {
        visible = id === this.isolatedId;
      } else if (this.dissectionMode === 'intact' && entry.data.isInternal && this.kinematics.targetExplode < 0.35) {
        // In intact unexploded view, internal organs stay enclosed inside the cuticle
        visible = true;
      }
      entry.group.visible = visible;

      // Determine opacity & color
      for (let i = 0; i < entry.materials.length; i++) {
        const mat = entry.materials[i];
        const origColor = entry.originalColors[i];

        // Restore or apply schematic color aid
        if (this.dissectionMode === 'schematic') {
          mat.color.setHex(entry.data.schematicColor);
          if (mat.map) mat.userData.savedMap = mat.map;
          mat.map = null;
        } else {
          if (mat.userData.savedMap) {
            mat.map = mat.userData.savedMap;
          }
          mat.color.copy(origColor);
        }

        // Cutaway transparency on external cuticle so internal organs are clearly visible
        let targetOpacity = 1.0;
        if (entry.opacityMode === 'faded') {
          targetOpacity = 0.25;
        } else if (this.dissectionMode === 'cutaway' && !entry.data.isInternal) {
          targetOpacity = isSelected ? 0.65 : 0.22;
        }

        mat.transparent = targetOpacity < 1.0;
        mat.opacity = targetOpacity;
        mat.depthWrite = targetOpacity > 0.5;

        // Hover & Selection restrained emissive accents
        if (isSelected) {
          mat.emissive.setHex(0x0f52ba);
          mat.emissiveIntensity = 0.32;
        } else if (isHovered) {
          mat.emissive.setHex(0xc84b11);
          mat.emissiveIntensity = 0.24;
        } else {
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 0.0;
        }
        mat.needsUpdate = true;
      }
    }
    this.syncTreeSelectionState();
  }

  // ===========================================================================
  // 3. UI BINDINGS, HIERARCHICAL TREE, SEARCH & RAYCASTING
  // ===========================================================================
  initUI() {
    this.renderAnatomyTree();
    this.initPointerRaycasting();
    this.initSearchBox();
    this.initTourControls();

    // Sex Dimorphism Toggle
    const maleBtn = document.getElementById('sex-male-btn');
    const femaleBtn = document.getElementById('sex-female-btn');
    maleBtn.addEventListener('click', () => {
      maleBtn.classList.add('active');
      femaleBtn.classList.remove('active');
      this.initSpecimen('male');
    });
    femaleBtn.addEventListener('click', () => {
      femaleBtn.classList.add('active');
      maleBtn.classList.remove('active');
      this.initSpecimen('female');
    });

    // Predefined Anatomical Camera Views
    document.querySelectorAll('.cam-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.cam-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.transitionToPresetView(btn.dataset.view);
      });
    });

    // Dissection Render Mode Pills (Intact | Internal Cutaway | System Color Aid)
    document.querySelectorAll('.mode-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        this.setDissectionMode(pill.dataset.mode);
      });
    });

    // Prominent "Flap Wings" Button & Speed Selector
    const flapBtn = document.getElementById('btn-flap-wings');
    const flapText = document.getElementById('flap-btn-text');
    flapBtn.addEventListener('click', () => {
      const next = !this.kinematics.isFlapping;
      this.setFlappingState(next);
    });

    document.getElementById('flap-speed-select').addEventListener('change', (e) => {
      this.kinematics.setSpeed(parseFloat(e.target.value));
    });

    // Exploded View Slider & Preset Chips
    const explodeSlider = document.getElementById('explode-slider');
    explodeSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.setExplosionPercentage(val);
    });

    document.querySelectorAll('.chip-btn').forEach((chip) => {
      chip.addEventListener('click', () => {
        const val = parseInt(chip.dataset.explode, 10);
        this.setExplosionPercentage(val);
      });
    });

    // Isolate & Reassemble Buttons
    const isolateBtn = document.getElementById('btn-isolate');
    isolateBtn.addEventListener('click', () => {
      if (!this.selectedId) return;
      if (this.isolatedId === this.selectedId) {
        this.isolatedId = null;
        isolateBtn.textContent = 'Isolate Selected';
      } else {
        this.isolatedId = this.selectedId;
        isolateBtn.textContent = 'Restore All Parts';
      }
      this.applyDissectionRenderState();
    });

    document.getElementById('btn-reassemble').addEventListener('click', () => {
      this.isolatedId = null;
      isolateBtn.textContent = 'Isolate Selected';
      for (const entry of this.builder.structureRegistry.values()) {
        entry.visible = true;
        entry.opacityMode = 'normal';
      }
      this.setDissectionMode('intact');
      this.setExplosionPercentage(0);
      this.transitionToPresetView('dorsal');
    });

    // Legend Checkboxes (Show All Pins & Unfurl Proboscis)
    document.getElementById('toggle-all-pins').addEventListener('change', (e) => {
      this.showAllPins = e.target.checked;
    });

    document.getElementById('toggle-proboscis-ext').addEventListener('change', (e) => {
      this.builder.updateProboscisExtension(e.target.checked ? 1.0 : 0.0);
    });

    // Right Dossier Structure Controls
    document.getElementById('btn-focus-structure').addEventListener('click', () => {
      if (this.selectedId) this.focusCameraOnStructure(this.selectedId);
    });

    document.getElementById('btn-toggle-vis').addEventListener('click', () => {
      if (!this.selectedId) return;
      const entry = this.builder.structureRegistry.get(this.selectedId);
      entry.visible = !entry.visible;
      document.getElementById('btn-toggle-vis').textContent = entry.visible ? 'Hide Structure' : 'Show Structure';
      this.applyDissectionRenderState();
    });

    document.getElementById('btn-fade-vis').addEventListener('click', () => {
      if (!this.selectedId) return;
      const entry = this.builder.structureRegistry.get(this.selectedId);
      entry.opacityMode = entry.opacityMode === 'faded' ? 'normal' : 'faded';
      document.getElementById('btn-fade-vis').textContent =
        entry.opacityMode === 'faded' ? 'Opaque (100%)' : 'Translucent (25%)';
      this.applyDissectionRenderState();
    });

    // Collapsible Left & Right Panels
    const leftDrawer = document.getElementById('left-drawer');
    const reopenLeft = document.getElementById('reopen-left-drawer');
    document.getElementById('toggle-left-drawer').addEventListener('click', () => {
      leftDrawer.classList.add('collapsed');
      reopenLeft.classList.remove('hidden');
      setTimeout(() => this.onResize(), 260);
    });
    reopenLeft.addEventListener('click', () => {
      leftDrawer.classList.remove('collapsed');
      reopenLeft.classList.add('hidden');
      setTimeout(() => this.onResize(), 260);
    });

    const rightDrawer = document.getElementById('right-drawer');
    const reopenRight = document.getElementById('reopen-right-drawer');
    document.getElementById('toggle-right-drawer').addEventListener('click', () => {
      rightDrawer.classList.add('collapsed');
      reopenRight.classList.remove('hidden');
      setTimeout(() => this.onResize(), 260);
    });
    reopenRight.addEventListener('click', () => {
      rightDrawer.classList.remove('collapsed');
      reopenRight.classList.add('hidden');
      setTimeout(() => this.onResize(), 260);
    });

    // References Modal & Custom GLB Upload
    const modal = document.getElementById('references-modal');
    document.getElementById('btn-references').addEventListener('click', () => {
      modal.classList.remove('hidden');
    });
    document.getElementById('close-references-modal').addEventListener('click', () => {
      modal.classList.add('hidden');
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });

    document.getElementById('glb-file-input').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const statusText = document.getElementById('glb-status-text');
      statusText.textContent = `Loading ${file.name}...`;
      const objectUrl = URL.createObjectURL(file);
      try {
        await this.builder.loadExternalGLB(objectUrl);
        statusText.textContent = `Loaded Custom Asset: ${file.name}`;
      } catch (err) {
        statusText.textContent = `Failed to parse ${file.name}. Retaining parametric Danaus plexippus.`;
      }
    });
  }

  renderAnatomyTree() {
    const container = document.getElementById('anatomy-tree');
    container.innerHTML = '';

    for (const sys of ANATOMICAL_SYSTEMS) {
      const sysStructures = ANATOMY_STRUCTURES.filter((s) => s.system === sys.id);
      const groupEl = document.createElement('div');
      groupEl.className = 'system-group';

      const headerEl = document.createElement('div');
      headerEl.className = 'system-header';
      headerEl.innerHTML = `
        <div class="system-title-wrap">
          <span class="sys-color-swatch" style="background:${sys.color}"></span>
          <span>${sys.shortName}</span>
        </div>
        <div class="system-controls">
          <button class="sys-mini-btn" data-sys-fade="${sys.id}" type="button" title="Toggle 25% translucency for ${sys.shortName}">Fade</button>
          <button class="sys-mini-btn active" data-sys-vis="${sys.id}" type="button" title="Show/Hide ${sys.shortName}">Vis</button>
        </div>
      `;

      const listEl = document.createElement('ul');
      listEl.className = 'structure-list';

      for (const item of sysStructures) {
        const li = document.createElement('li');
        li.className = 'structure-row';
        li.dataset.structureId = item.id;
        li.setAttribute('role', 'treeitem');
        li.tabIndex = 0;
        li.innerHTML = `
          <span>${item.commonName}</span>
          <button class="row-vis-btn" data-row-vis="${item.id}" type="button" title="Toggle visibility">👁</button>
        `;

        li.addEventListener('click', (e) => {
          if (e.target.closest('.row-vis-btn')) return;
          this.selectStructure(item.id, true);
        });

        li.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.selectStructure(item.id, true);
          }
        });

        const visBtn = li.querySelector('.row-vis-btn');
        visBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const entry = this.builder.structureRegistry.get(item.id);
          entry.visible = !entry.visible;
          this.applyDissectionRenderState();
        });

        listEl.appendChild(li);
      }

      // System-level Fade & Vis buttons
      headerEl.querySelector(`[data-sys-fade="${sys.id}"]`).addEventListener('click', (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        const isFaded = btn.classList.toggle('active');
        for (const item of sysStructures) {
          const entry = this.builder.structureRegistry.get(item.id);
          entry.opacityMode = isFaded ? 'faded' : 'normal';
        }
        this.applyDissectionRenderState();
      });

      headerEl.querySelector(`[data-sys-vis="${sys.id}"]`).addEventListener('click', (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        const isVis = btn.classList.toggle('active');
        for (const item of sysStructures) {
          const entry = this.builder.structureRegistry.get(item.id);
          entry.visible = isVis;
        }
        this.applyDissectionRenderState();
      });

      groupEl.appendChild(headerEl);
      groupEl.appendChild(listEl);
      container.appendChild(groupEl);
    }
  }

  syncTreeSelectionState() {
    document.querySelectorAll('.structure-row').forEach((row) => {
      const id = row.dataset.structureId;
      const entry = this.builder.structureRegistry.get(id);
      row.classList.toggle('selected', id === this.selectedId);
      row.classList.toggle('hidden-part', entry && !entry.visible);
    });

    this.pinElements.forEach((pinEl, id) => {
      pinEl.classList.toggle('selected', id === this.selectedId);
    });
  }

  initPointerRaycasting() {
    this.canvas.addEventListener('pointerdown', (e) => {
      this.pointerDownPos.set(e.clientX, e.clientY);
    });

    this.canvas.addEventListener('pointermove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.pointer, this.camera);
      const visibleMeshes = this.builder.selectableMeshes.filter((m) => {
        const entry = this.builder.structureRegistry.get(m.userData.structureId);
        if (!entry || !entry.group.visible) return false;
        // When in cutaway mode, allow raycasting through translucent cuticle to internal organs
        if (this.dissectionMode === 'cutaway' && !entry.data.isInternal && this.kinematics.currentExplode < 0.35) {
          return false;
        }
        return true;
      });

      const hits = this.raycaster.intersectObjects(visibleMeshes, false);
      if (hits.length > 0) {
        const hitId = hits[0].object.userData.structureId;
        if (this.hoveredId !== hitId) {
          this.hoveredId = hitId;
          this.applyDissectionRenderState();
        }
        const entry = this.builder.structureRegistry.get(hitId);
        this.canvas.style.cursor = 'pointer';
        this.hoverTooltip.textContent = `${entry.data.name} — ${entry.data.commonName}`;
        this.hoverTooltip.style.left = `${e.clientX - rect.left + 14}px`;
        this.hoverTooltip.style.top = `${e.clientY - rect.top + 14}px`;
        this.hoverTooltip.classList.remove('hidden');
      } else {
        if (this.hoveredId !== null) {
          this.hoveredId = null;
          this.applyDissectionRenderState();
        }
        this.canvas.style.cursor = 'grab';
        this.hoverTooltip.classList.add('hidden');
      }
    });

    this.canvas.addEventListener('pointerup', (e) => {
      const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
      if (dist > 5) return; // Ignore orbit drag

      if (this.hoveredId) {
        this.selectStructure(this.hoveredId, true);
      }
    });
  }

  initSearchBox() {
    const input = document.getElementById('structure-search');
    const list = document.getElementById('search-results-list');

    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (!q) {
        list.classList.add('hidden');
        return;
      }

      const matches = ANATOMY_STRUCTURES.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.commonName.toLowerCase().includes(q) ||
          s.function.toLowerCase().includes(q) ||
          s.morphology.toLowerCase().includes(q)
      );

      list.innerHTML = '';
      if (matches.length === 0) {
        list.classList.add('hidden');
        return;
      }

      for (const m of matches) {
        const li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.innerHTML = `
          <span class="search-item-name">${m.commonName} (${m.name})</span>
          <span class="search-item-sys">${m.evidence}</span>
        `;
        li.addEventListener('click', () => {
          this.selectStructure(m.id, true);
          list.classList.add('hidden');
          input.value = m.commonName;
        });
        list.appendChild(li);
      }
      list.classList.remove('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.header-search-wrap')) {
        list.classList.add('hidden');
      }
    });
  }

  // ===========================================================================
  // 4. STRUCTURE SELECTION, DOSSIER POPULATION & CAMERA FOCUS
  // ===========================================================================
  selectStructure(id, focusCamera = true) {
    const entry = this.builder.structureRegistry.get(id);
    if (!entry) return;

    this.selectedId = id;
    document.getElementById('btn-isolate').disabled = false;

    // Automatically reveal internal structures via Cutaway mode if user selects an internal organ while intact
    if (entry.data.isInternal && this.dissectionMode === 'intact') {
      this.setDissectionMode('cutaway');
    }

    entry.visible = true;
    this.applyDissectionRenderState();
    this.populateDossier(entry.data);

    if (focusCamera) {
      this.focusCameraOnStructure(id);
    }
  }

  populateDossier(data) {
    const sys = ANATOMICAL_SYSTEMS.find((s) => s.id === data.system);
    document.getElementById('info-system-tag').textContent = sys ? sys.name : 'ANATOMICAL STRUCTURE';
    document.getElementById('info-title').textContent = data.commonName;
    document.getElementById('info-subtitle').textContent = data.name;

    const evBadge = document.getElementById('info-evidence-badge');
    evBadge.textContent = data.evidence;

    document.getElementById('info-hierarchy-badge').textContent = data.hierarchy;
    document.getElementById('info-function').textContent = data.function;
    document.getElementById('info-location').textContent = data.location;
    document.getElementById('info-morphology').textContent = data.morphology;
    document.getElementById('info-species-notes').textContent = data.speciesNotes;

    const citList = document.getElementById('info-citations');
    citList.innerHTML = '';
    for (const c of data.citations) {
      const li = document.createElement('li');
      li.textContent = c;
      citList.appendChild(li);
    }
  }

  populateDefaultOverviewDossier() {
    this.populateDossier(ANATOMY_STRUCTURES[0]);
    document.getElementById('info-system-tag').textContent = 'SPECIMEN OVERVIEW';
    document.getElementById('info-title').innerHTML = '<em>Danaus plexippus</em>';
    document.getElementById('info-subtitle').textContent = 'Monarch Butterfly (Linnaeus, 1758) · Nymphalidae';
  }

  focusCameraOnStructure(id) {
    const entry = this.builder.structureRegistry.get(id);
    if (!entry) return;

    const box = new THREE.Box3().setFromObject(entry.group);
    const center = box.getCenter(new THREE.Vector3());
    const offset = new THREE.Vector3(...entry.data.cameraTargetOffset);

    this.cameraGoalTarget.copy(center);
    this.cameraGoalPos.copy(center).add(offset);
    this.isTransitioningCamera = true;
  }

  transitionToPresetView(viewName) {
    this.cameraGoalTarget.set(0, 0, 0);
    switch (viewName) {
      case 'dorsal':
        this.cameraGoalPos.set(0, 7.6, 0.8);
        break;
      case 'ventral':
        this.cameraGoalPos.set(0, -7.6, 0.8);
        break;
      case 'lateral':
        this.cameraGoalPos.set(6.8, 1.4, 0.4);
        break;
      case 'anterior':
        this.cameraGoalPos.set(0, 1.1, 6.6);
        break;
      case 'posterior':
        this.cameraGoalPos.set(0, 1.2, -6.8);
        break;
      default:
        this.cameraGoalPos.set(0, 6.2, 5.2);
    }
    this.isTransitioningCamera = true;
  }

  setDissectionMode(mode) {
    this.dissectionMode = mode;
    document.querySelectorAll('.mode-pill').forEach((p) => {
      p.classList.toggle('active', p.dataset.mode === mode);
    });
    this.applyDissectionRenderState();
  }

  setFlappingState(active) {
    this.kinematics.setFlapping(active);
    const flapBtn = document.getElementById('btn-flap-wings');
    const flapText = document.getElementById('flap-btn-text');
    flapBtn.classList.toggle('active', active);
    flapBtn.setAttribute('aria-pressed', String(active));
    flapText.textContent = active ? 'Stop Flapping' : 'Flap Wings';
  }

  setExplosionPercentage(percent) {
    const slider = document.getElementById('explode-slider');
    const readout = document.getElementById('explode-readout');
    slider.value = String(percent);

    let stageLabel = 'Intact';
    if (percent > 0 && percent <= 40) stageLabel = 'Tagmata Separated';
    else if (percent > 40 && percent <= 75) stageLabel = 'Appendages Separated';
    else if (percent > 75) stageLabel = 'Full Dissection';

    readout.textContent = `${percent}% (${stageLabel})`;
    this.kinematics.setExplodeTarget(percent / 100);

    document.querySelectorAll('.chip-btn').forEach((c) => {
      c.classList.toggle('active', parseInt(c.dataset.explode, 10) === percent);
    });
  }

  // ===========================================================================
  // 5. GUIDED 9-STEP DISSECTION TOUR
  // ===========================================================================
  initTourControls() {
    const dotsContainer = document.getElementById('tour-dots');
    dotsContainer.innerHTML = '';

    GUIDED_TOUR_STEPS.forEach((s, idx) => {
      const dot = document.createElement('button');
      dot.className = 'tour-dot';
      dot.type = 'button';
      dot.title = s.title;
      dot.addEventListener('click', () => this.applyGuidedTourStep(idx));
      dotsContainer.appendChild(dot);
    });

    document.getElementById('btn-tour-prev').addEventListener('click', () => {
      const nextIdx = (this.currentTourIndex - 1 + GUIDED_TOUR_STEPS.length) % GUIDED_TOUR_STEPS.length;
      this.applyGuidedTourStep(nextIdx);
    });

    document.getElementById('btn-tour-next').addEventListener('click', () => {
      const nextIdx = (this.currentTourIndex + 1) % GUIDED_TOUR_STEPS.length;
      this.applyGuidedTourStep(nextIdx);
    });

    document.getElementById('btn-exit-tour').addEventListener('click', () => {
      document.querySelector('.guided-tour-bar').classList.add('hidden');
    });
  }

  applyGuidedTourStep(index) {
    this.currentTourIndex = index;
    const stepData = GUIDED_TOUR_STEPS[index];

    document.getElementById('tour-step-counter').textContent = `Step ${stepData.step} of ${GUIDED_TOUR_STEPS.length}`;
    document.getElementById('tour-title').textContent = stepData.title;
    document.getElementById('tour-description').textContent = stepData.description;

    document.querySelectorAll('.tour-dot').forEach((d, idx) => {
      d.classList.toggle('active', idx === index);
    });

    this.setDissectionMode(stepData.dissectionMode);
    this.setExplosionPercentage(stepData.explodePercent);
    this.setFlappingState(stepData.flapActive);
    this.transitionToPresetView(stepData.cameraView);

    if (stepData.highlightedIds && stepData.highlightedIds.length > 0) {
      this.selectStructure(stepData.highlightedIds[0], false);
    }
  }

  // ===========================================================================
  // 6. DYNAMIC 3D-TO-2D SVG LEADER LINES & CALLOUT PIN LAYOUT ENGINE
  // ===========================================================================
  createCalloutPins() {
    this.calloutLayer.innerHTML = '';
    this.pinElements.clear();

    for (const item of ANATOMY_STRUCTURES) {
      const pin = document.createElement('button');
      pin.className = 'anatomical-pin hidden';
      pin.type = 'button';
      pin.textContent = item.commonName;
      pin.addEventListener('click', () => this.selectStructure(item.id, true));
      this.calloutLayer.appendChild(pin);
      this.pinElements.set(item.id, pin);
    }
  }

  updateLeaderLinesAndPins() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width === 0 || height === 0) return;

    this.leaderSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    this.leaderSvg.innerHTML = '';

    const activeItems = [];
    for (const [id, entry] of this.builder.structureRegistry.entries()) {
      const pinEl = this.pinElements.get(id);
      if (!entry.group.visible) {
        pinEl.classList.add('hidden');
        continue;
      }

      const isSelected = id === this.selectedId;
      const shouldShow =
        isSelected ||
        (this.showAllPins &&
          (entry.data.defaultPin ||
            (this.dissectionMode !== 'intact' && entry.data.isInternal)));

      if (!shouldShow) {
        pinEl.classList.add('hidden');
        continue;
      }

      // Compute 3D bounding-box center of the structure in current animated/exploded state
      const box = new THREE.Box3().setFromObject(entry.group);
      const anchor3D = box.getCenter(new THREE.Vector3());
      const projected = anchor3D.clone().project(this.camera);

      // Cull behind camera
      if (projected.z > 1.0 || projected.z < -1.0) {
        pinEl.classList.add('hidden');
        continue;
      }

      const ax = (projected.x * 0.5 + 0.5) * width;
      const ay = (-projected.y * 0.5 + 0.5) * height;

      // Push label radially outward from viewport center to keep specimen unobstructed
      const dx = ax - width * 0.5;
      const dy = ay - height * 0.45;
      const side = dx >= 0 ? 1 : -1;
      const labelX = THREE.MathUtils.clamp(ax + side * 105, 95, width - 95);
      const labelY = THREE.MathUtils.clamp(ay + (dy >= 0 ? 22 : -22), 36, height - 155);

      activeItems.push({ id, pinEl, ax, ay, labelX, labelY, side, isSelected });
    }

    // Simple vertical overlap relaxation on left and right columns
    for (const colSide of [-1, 1]) {
      const col = activeItems
        .filter((item) => item.side === colSide)
        .sort((a, b) => a.labelY - b.labelY);

      for (let i = 1; i < col.length; i++) {
        const minGap = 28;
        if (col[i].labelY - col[i - 1].labelY < minGap) {
          col[i].labelY = Math.min(height - 150, col[i - 1].labelY + minGap);
        }
      }
    }

    // Render SVG elbow leader lines and position HTML pins
    for (const item of activeItems) {
      item.pinEl.classList.remove('hidden');
      item.pinEl.style.left = `${item.labelX}px`;
      item.pinEl.style.top = `${item.labelY}px`;

      const elbowX = item.labelX - item.side * 28;
      const elbowY = item.labelY;

      const strokeColor = item.isSelected ? '#0F52BA' : '#64748B';
      const strokeWidth = item.isSelected ? '1.6' : '1.0';

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${item.ax} ${item.ay} L ${elbowX} ${elbowY} L ${item.labelX} ${item.labelY}`);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', strokeColor);
      path.setAttribute('stroke-width', strokeWidth);
      this.leaderSvg.appendChild(path);

      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', String(item.ax));
      dot.setAttribute('cy', String(item.ay));
      dot.setAttribute('r', item.isSelected ? '3.5' : '2.3');
      dot.setAttribute('fill', strokeColor);
      this.leaderSvg.appendChild(dot);
    }
  }

  // ===========================================================================
  // 7. ANIMATION LOOP & RESIZE HANDLER
  // ===========================================================================
  onResize() {
    const w = this.canvas.clientWidth;
    const h = Math.max(1, this.canvas.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  animate() {
    requestAnimationFrame(this.animate);
    if (document.hidden) return;

    const dt = Math.min(0.1, this.clock.getDelta());

    // Update kinematics and exploded dissection positions
    this.kinematics.update(dt);

    // Smooth camera focus transition
    if (this.isTransitioningCamera) {
      const damp = Math.min(1, dt * 6.0);
      this.camera.position.lerp(this.cameraGoalPos, damp);
      this.controls.target.lerp(this.cameraGoalTarget, damp);
      if (
        this.camera.position.distanceTo(this.cameraGoalPos) < 0.02 &&
        this.controls.target.distanceTo(this.cameraGoalTarget) < 0.02
      ) {
        this.isTransitioningCamera = false;
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.updateLeaderLinesAndPins();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new ButterflyAtlasApp();
});