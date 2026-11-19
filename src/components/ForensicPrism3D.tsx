import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { ChevronDown, ChevronUp, Compass, Layers, RotateCcw } from 'lucide-react';
import type { ConfidenceEngineResult } from '../types/forensics';

interface ForensicPrism3DProps {
  confidence?: ConfidenceEngineResult | null;
  waveformBins?: number[];
  heightClass?: string;
  compact?: boolean;
}

type CameraPreset = 'overview' | 'optical' | 'lattice' | 'top';

const PRESET_POSITIONS: Record<CameraPreset, [number, number, number]> = {
  overview: [4.4, 3.0, 5.2],
  optical: [0.6, 1.35, 4.1],
  lattice: [5.8, 1.8, 0.8],
  top: [0.01, 6.4, 0.6],
};

interface ModalityNodeMeta {
  key: 'visual' | 'audio' | 'textual' | 'cross_modal';
  label: string;
  angle: number;
  baseColor: number;
}

const MODALITY_NODES: ModalityNodeMeta[] = [
  { key: 'visual', label: 'Visual ELA & Frame Delta', angle: 0, baseColor: 0x2563eb },
  { key: 'audio', label: 'Audio FFT & Pitch DSP', angle: Math.PI / 2, baseColor: 0x4f46e5 },
  { key: 'textual', label: 'Contextual & Caption Logic', angle: Math.PI, baseColor: 0x0f766e },
  { key: 'cross_modal', label: 'Cross-Modal Sync Engine', angle: (3 * Math.PI) / 2, baseColor: 0xb45309 },
];

// Pre-allocated math helpers outside render loop (zero GC)
const _dummy = new THREE.Object3D();
const _targetCam = new THREE.Vector3();
const _targetColor = new THREE.Color();

function createCalibrationDialTexture(maxAniso: number): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Ivory-ceramic dial surface
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;

  ctx.strokeStyle = 'rgba(100, 116, 139, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 460, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(37, 99, 235, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 390, 0, Math.PI * 2);
  ctx.stroke();

  for (let deg = 0; deg < 360; deg += 3) {
    const rad = (deg * Math.PI) / 180;
    const isMajor = deg % 30 === 0;
    const isMid = deg % 15 === 0;
    const rOut = 456;
    const rIn = isMajor ? 416 : isMid ? 430 : 444;

    ctx.strokeStyle = isMajor ? 'rgba(15, 23, 42, 0.85)' : 'rgba(100, 116, 139, 0.45)';
    ctx.lineWidth = isMajor ? 2.5 : 1.2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(rad) * rIn, cy + Math.sin(rad) * rIn);
    ctx.lineTo(cx + Math.cos(rad) * rOut, cy + Math.sin(rad) * rOut);
    ctx.stroke();

    if (isMajor) {
      ctx.save();
      ctx.translate(cx + Math.cos(rad) * 392, cy + Math.sin(rad) * 392);
      ctx.rotate(rad + Math.PI / 2);
      ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
      ctx.font = '600 18px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(deg).padStart(3, '0'), 0, 0);
      ctx.restore();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 12, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.22)');
  grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.08)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function ForensicPrism3D({
  confidence = null,
  waveformBins,
  heightClass = 'h-[360px]',
  compact = false,
}: ForensicPrism3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [preset, setPreset] = useState<CameraPreset>('overview');
  const [explodeFactor, setExplodeFactor] = useState(0);
  const [dockCollapsed, setDockCollapsed] = useState(compact);
  const [contextLost, setContextLost] = useState(false);
  const [selectedAxis, setSelectedAxis] = useState<ModalityNodeMeta['key'] | null>(null);

  const explodeRef = useRef(0);
  const presetRef = useRef<CameraPreset | null>(null);
  const confidenceRef = useRef<ConfidenceEngineResult | null>(confidence);
  const waveformRef = useRef<number[] | undefined>(waveformBins);

  useEffect(() => {
    explodeRef.current = explodeFactor;
  }, [explodeFactor]);

  useEffect(() => {
    confidenceRef.current = confidence;
  }, [confidence]);

  useEffect(() => {
    waveformRef.current = waveformBins;
  }, [waveformBins]);

  useEffect(() => {
    if (compact) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'h' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        setDockCollapsed((c) => !c);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [compact]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas');
        const gl = probe.getContext('webgl2') || probe.getContext('webgl');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param) || '');
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: false,
      });
    } catch {
      setContextLost(true);
      return;
    }

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 360;

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.innerHTML = '';
    container.appendChild(canvas);

    const onContextLost = (ev: Event) => {
      ev.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => setContextLost(false);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    // Daylight studio canvas (no dark mode, no neon)
    const studioBg = 0xf1f5f9;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(studioBg);
    scene.fog = new THREE.FogExp2(studioBg, 0.036);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(...PRESET_POSITIONS.overview);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 2.6;
    controls.maxDistance = 10.5;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.target.set(0, 0.35, 0);

    controls.addEventListener('start', () => {
      presetRef.current = null;
    });

    // Clean Three-Point Daylight Studio Lighting (no neon colors)
    const keyLight = new THREE.DirectionalLight(0xfffaf0, 1.9);
    keyLight.position.set(5, 7, 4);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.left = -4;
      keyLight.shadow.camera.right = 4;
      keyLight.shadow.camera.top = 4;
      keyLight.shadow.camera.bottom = -4;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const hemiLight = new THREE.HemisphereLight(0xf8fafc, 0xcbd5e1, 1.05);
    scene.add(hemiLight);

    const rimLight = new THREE.DirectionalLight(0xe2e8f0, 1.15);
    rimLight.position.set(-5, 3, -5);
    scene.add(rimLight);

    if (!isSoftwareGl) {
      RectAreaLightUniformsLib.init();
      const softbox = new THREE.RectAreaLight(0xffffff, 2.2, 4.5, 2.0);
      softbox.position.set(0, 4.5, 3.5);
      softbox.lookAt(0, 0.4, 0);
      scene.add(softbox);
    }

    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [];

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const dialTex = createCalibrationDialTexture(maxAniso);
    const shadowTex = createContactShadowTexture();
    textures.push(dialTex, shadowTex);

    // Soft studio contact shadow grounded at y = -1.15
    const shadowGeo = new THREE.PlaneGeometry(5.8, 5.8);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.7,
    });
    geometries.push(shadowGeo);
    materials.push(shadowMat);
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -1.15;
    scene.add(shadowPlane);

    // Composite 9-Part Precision Optical Assembly (matte aluminum, steel, optical glass — ZERO emissive glow)
    const assemblyGroup = new THREE.Group();
    scene.add(assemblyGroup);

    // Part 1: Stepped Brushed Silver-Aluminum Plinth (LatheGeometry)
    const plinthPoints = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(2.15, 0.0),
      new THREE.Vector2(2.15, 0.14),
      new THREE.Vector2(1.98, 0.24),
      new THREE.Vector2(1.75, 0.24),
      new THREE.Vector2(1.62, 0.36),
      new THREE.Vector2(0.95, 0.36),
      new THREE.Vector2(0.85, 0.48),
      new THREE.Vector2(0.0, 0.48),
    ];
    const plinthGeo = new THREE.LatheGeometry(plinthPoints, 64);
    const aluminumMat = new THREE.MeshPhysicalMaterial({
      color: 0xdbe2ea,
      metalness: 0.58,
      roughness: 0.32,
      clearcoat: 0.25,
    });
    geometries.push(plinthGeo);
    materials.push(aluminumMat);
    const plinthMesh = new THREE.Mesh(plinthGeo, aluminumMat);
    plinthMesh.position.y = -1.14;
    plinthMesh.receiveShadow = !isSoftwareGl;
    assemblyGroup.add(plinthMesh);

    // Part 2: Calibrated Azimuth Vernier Dial Plate
    const dialGeo = new THREE.RingGeometry(0.96, 1.94, 72);
    const dialMat = new THREE.MeshStandardMaterial({
      map: dialTex,
      roughness: 0.65,
      metalness: 0.1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    geometries.push(dialGeo);
    materials.push(dialMat);
    const dialMesh = new THREE.Mesh(dialGeo, dialMat);
    dialMesh.rotation.x = -Math.PI / 2;
    dialMesh.position.y = -0.77;
    assemblyGroup.add(dialMesh);

    // Part 3: Brushed Graphite-Steel Outer Collar Ring
    const collarGeo = new THREE.TorusGeometry(2.04, 0.055, 20, 96);
    const brushedSteelMat = new THREE.MeshPhysicalMaterial({
      color: 0x475569,
      metalness: 0.85,
      roughness: 0.24,
      anisotropy: 0.75,
    });
    geometries.push(collarGeo);
    materials.push(brushedSteelMat);
    const collarMesh = new THREE.Mesh(collarGeo, brushedSteelMat);
    collarMesh.rotation.x = Math.PI / 2;
    collarMesh.position.y = -0.9;
    assemblyGroup.add(collarMesh);

    // Part 4 & 5: Dual Architectural Gimbal Rings (matte steel & cobalt, zero emissive glow)
    const gimbalGroup = new THREE.Group();
    gimbalGroup.position.y = 0.42;
    assemblyGroup.add(gimbalGroup);

    const outerGimbalGeo = new THREE.TorusGeometry(1.48, 0.032, 16, 96);
    const gimbalMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.75,
      roughness: 0.28,
    });
    geometries.push(outerGimbalGeo);
    materials.push(gimbalMat);
    const outerGimbal = new THREE.Mesh(outerGimbalGeo, gimbalMat);
    outerGimbal.rotation.x = Math.PI / 2.6;
    gimbalGroup.add(outerGimbal);

    const innerGimbalGeo = new THREE.TorusGeometry(1.22, 0.026, 16, 96);
    const innerGimbalMat = new THREE.MeshStandardMaterial({
      color: 0x2563eb,
      metalness: 0.55,
      roughness: 0.32,
    });
    geometries.push(innerGimbalGeo);
    materials.push(innerGimbalMat);
    const innerGimbal = new THREE.Mesh(innerGimbalGeo, innerGimbalMat);
    innerGimbal.rotation.y = Math.PI / 3;
    gimbalGroup.add(innerGimbal);

    // Part 6: Optical Beveled Crown-Glass Forensic Prism (ExtrudeGeometry)
    const prismShape = new THREE.Shape();
    const pr = 0.68;
    for (let i = 0; i < 3; i++) {
      const a = (i * 2 * Math.PI) / 3 - Math.PI / 2;
      const x = Math.cos(a) * pr;
      const y = Math.sin(a) * pr;
      if (i === 0) prismShape.moveTo(x, y);
      else prismShape.lineTo(x, y);
    }
    prismShape.closePath();

    const prismGeo = new THREE.ExtrudeGeometry(prismShape, {
      depth: 1.05,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.05,
      bevelSegments: 4,
    });
    prismGeo.center();
    const prismGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xeff6ff,
      metalness: 0.02,
      roughness: 0.08,
      ior: 1.54,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      transmission: isSoftwareGl ? 0 : 0.88,
      thickness: 1.2,
      attenuationColor: new THREE.Color(0x93c5fd),
      attenuationDistance: 2.2,
      transparent: true,
      opacity: isSoftwareGl ? 0.42 : 1,
      depthWrite: false,
    });
    geometries.push(prismGeo);
    materials.push(prismGlassMat);

    const prismGroup = new THREE.Group();
    prismGroup.position.y = 0.42;
    const prismMesh = new THREE.Mesh(prismGeo, prismGlassMat);
    prismMesh.renderOrder = 2;
    prismGroup.add(prismMesh);

    // Part 7: Inner Solid Matte Ceramic-Cobalt Core Octahedron (no emissive glow)
    const coreGeo = new THREE.OctahedronGeometry(0.28, 0);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      metalness: 0.35,
      roughness: 0.25,
    });
    geometries.push(coreGeo);
    materials.push(coreMat);
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.renderOrder = 1;
    prismGroup.add(coreMesh);
    assemblyGroup.add(prismGroup);

    // Part 8: 4 Interactive Modality Sensor Pods (Layer 1 raycastable, matte ceramic finishes)
    const podGeo = new THREE.CylinderGeometry(0.14, 0.18, 0.24, 24);
    const armGeo = new THREE.BoxGeometry(0.65, 0.035, 0.06);
    geometries.push(podGeo, armGeo);

    const clickablePods: THREE.Mesh[] = [];
    const podEntries: Array<{
      meta: ModalityNodeMeta;
      podMesh: THREE.Mesh;
      mat: THREE.MeshStandardMaterial;
      group: THREE.Group;
    }> = [];

    for (const node of MODALITY_NODES) {
      const podGroup = new THREE.Group();
      const radius = 1.68;
      podGroup.position.set(Math.cos(node.angle) * radius, -0.58, Math.sin(node.angle) * radius);
      podGroup.rotation.y = -node.angle;

      const armMesh = new THREE.Mesh(armGeo, brushedSteelMat);
      armMesh.position.set(-0.32, -0.06, 0);
      podGroup.add(armMesh);

      const podMat = new THREE.MeshStandardMaterial({
        color: node.baseColor,
        metalness: 0.35,
        roughness: 0.32,
      });
      materials.push(podMat);

      const podMesh = new THREE.Mesh(podGeo, podMat);
      podMesh.layers.enable(1);
      podMesh.userData = { axisKey: node.key };
      podGroup.add(podMesh);

      clickablePods.push(podMesh);
      podEntries.push({ meta: node, podMesh, mat: podMat, group: podGroup });
      assemblyGroup.add(podGroup);
    }

    // Part 9: 48-Bar Instanced Signal Lattice (matte slate & cobalt)
    const latticeCount = 48;
    const barGeo = new THREE.BoxGeometry(0.055, 1, 0.09);
    barGeo.translate(0, 0.5, 0);
    const barMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.3,
      roughness: 0.4,
    });
    geometries.push(barGeo);
    materials.push(barMat);

    const latticeMesh = new THREE.InstancedMesh(barGeo, barMat, latticeCount);
    latticeMesh.frustumCulled = false;
    for (let i = 0; i < latticeCount; i++) {
      const angle = (i / latticeCount) * Math.PI * 2;
      _dummy.position.set(Math.cos(angle) * 1.88, -0.76, Math.sin(angle) * 1.88);
      _dummy.rotation.set(0, -angle, 0);
      _dummy.scale.set(1, 0.16, 1);
      _dummy.updateMatrix();
      latticeMesh.setMatrixAt(i, _dummy.matrix);
      _targetColor.setHex(0x2563eb);
      latticeMesh.setColorAt(i, _targetColor);
    }
    latticeMesh.instanceMatrix.needsUpdate = true;
    if (latticeMesh.instanceColor) latticeMesh.instanceColor.needsUpdate = true;
    latticeMesh.computeBoundingSphere();
    assemblyGroup.add(latticeMesh);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Raycaster for interactive axis pod inspection
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    const pointer = new THREE.Vector2();

    const onPointerClick = (ev: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickablePods, false);
      if (hits.length > 0) {
        const key = hits[0].object.userData.axisKey as ModalityNodeMeta['key'];
        setSelectedAxis((prev) => (prev === key ? null : key));
      }
    };
    canvas.addEventListener('click', onPointerClick);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 640;
      const h = container.clientHeight || 360;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObs = new ResizeObserver(onResize);
    resizeObs.observe(container);

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync && gl.deleteSync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const delta = Math.min(0.05, clock.getDelta());
      const elapsed = clock.getElapsedTime();

      if (presetRef.current) {
        const coords = PRESET_POSITIONS[presetRef.current];
        _targetCam.set(coords[0], coords[1], coords[2]);
        camera.position.x = THREE.MathUtils.damp(camera.position.x, _targetCam.x, 4.5, delta);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, _targetCam.y, 4.5, delta);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, _targetCam.z, 4.5, delta);
        if (camera.position.distanceTo(_targetCam) < 0.04) {
          presetRef.current = null;
        }
      }

      const exp = explodeRef.current;
      prismGroup.position.y = THREE.MathUtils.damp(prismGroup.position.y, 0.42 + exp * 0.95, 6.0, delta);
      gimbalGroup.position.y = THREE.MathUtils.damp(gimbalGroup.position.y, 0.42 + exp * 0.45, 6.0, delta);
      dialMesh.position.y = THREE.MathUtils.damp(dialMesh.position.y, -0.77 - exp * 0.25, 6.0, delta);

      prismMesh.rotation.y += delta * 0.35;
      coreMesh.rotation.y -= delta * 0.7;
      coreMesh.rotation.x = Math.sin(elapsed * 0.8) * 0.22;
      outerGimbal.rotation.z += delta * 0.28;
      innerGimbal.rotation.x += delta * 0.38;

      const conf = confidenceRef.current;
      const idxScore = conf?.overall_indicator_index ?? 18;
      if (idxScore >= 58) {
        coreMat.color.setHex(0xdc2626);
      } else if (idxScore >= 30) {
        coreMat.color.setHex(0xd97706);
      } else {
        coreMat.color.setHex(0x1d4ed8);
      }

      for (const entry of podEntries) {
        const score = conf ? conf[entry.meta.key].score : null;
        const targetScaleY = score !== null ? 0.65 + (score / 100) * 1.6 : 0.6;
        entry.podMesh.scale.y = THREE.MathUtils.damp(entry.podMesh.scale.y, targetScaleY, 5, delta);
        entry.group.position.y = THREE.MathUtils.damp(entry.group.position.y, -0.58 + exp * 0.25, 5, delta);
      }

      const bins = waveformRef.current;
      for (let i = 0; i < latticeCount; i++) {
        const angle = (i / latticeCount) * Math.PI * 2;
        let amp = 0.18 + 0.14 * Math.sin(elapsed * 2.1 + i * 0.38);
        if (bins && bins.length > 0) {
          const bIdx = Math.floor((i / latticeCount) * bins.length);
          amp = 0.12 + bins[bIdx] * 0.75;
        }
        _dummy.position.set(Math.cos(angle) * 1.88, -0.76, Math.sin(angle) * 1.88);
        _dummy.rotation.set(0, -angle, 0);
        _dummy.scale.set(1, amp, 1);
        _dummy.updateMatrix();
        latticeMesh.setMatrixAt(i, _dummy.matrix);

        if (amp > 0.6) _targetColor.setHex(0xdc2626);
        else if (amp > 0.4) _targetColor.setHex(0x4f46e5);
        else _targetColor.setHex(0x2563eb);
        latticeMesh.setColorAt(i, _targetColor);
      }
      latticeMesh.instanceMatrix.needsUpdate = true;
      if (latticeMesh.instanceColor) latticeMesh.instanceColor.needsUpdate = true;

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObs.disconnect();
      canvas.removeEventListener('click', onPointerClick);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      controls.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      envTex.dispose();
      renderer.dispose();
    };
  }, []);

  const selectedModalityDetail = useMemo(() => {
    if (!selectedAxis) return null;
    const node = MODALITY_NODES.find((n) => n.key === selectedAxis);
    const detail = confidence ? confidence[selectedAxis] : null;
    return { node, detail };
  }, [selectedAxis, confidence]);

  const selectPreset = (next: CameraPreset) => {
    setPreset(next);
    presetRef.current = next;
  };

  return (
    <div className={`relative w-full ${heightClass} rounded-lg border border-slate-200 bg-[#F1F5F9] overflow-hidden select-none`}>
      {/* Dedicated isolated WebGL canvas container */}
      <div ref={mountRef} className="w-full h-full" />

      {contextLost && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#F1F5F9] p-6 text-center space-y-2 z-20">
          <img
            src="/src/assets/images/truthlens_emblem_1795059431139.jpg"
            alt="TruthLens Optical Prism"
            referrerPolicy="no-referrer"
            className="w-28 h-28 rounded object-cover border border-slate-200"
          />
          <p className="text-xs text-slate-600">WebGL context unavailable — displaying static optical emblem.</p>
        </div>
      )}

      {/* Clicked Pod Readout (zero clutter, zero backdrop-blur over WebGL) */}
      {selectedModalityDetail?.node && (
        <div className="absolute top-3 left-3 z-10 pointer-events-none flex flex-col gap-1">
          <span className="text-xs text-slate-800 bg-white/95 border border-slate-300 px-2.5 py-1.5 rounded max-w-xs shadow-sm">
            <strong>{selectedModalityDetail.node.label}:</strong>{' '}
            {selectedModalityDetail.detail?.score !== null && selectedModalityDetail.detail?.score !== undefined
              ? `${selectedModalityDetail.detail.score}/100 (${selectedModalityDetail.detail.status})`
              : 'No active investigation'}
          </span>
        </div>
      )}

      {/* Interactive 3D Controls Dock (shown on full 3D Signal Core view, omitted on Dashboard compact view) */}
      {!compact && (
        <div
          className={`absolute bottom-3 left-1/2 -translate-x-1/2 z-10 transition-transform duration-300 max-w-[94%] ${
            dockCollapsed ? 'translate-y-[calc(100%-28px)]' : 'translate-y-0'
          }`}
        >
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setDockCollapsed((c) => !c)}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium bg-white border border-b-0 border-slate-200 text-slate-700 hover:text-slate-900 rounded-t-md shadow-xs"
            >
              {dockCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {dockCollapsed ? 'Camera & Layers (H)' : 'Hide Controls (H)'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 px-3.5 py-2 bg-white/95 border border-slate-200 rounded-md shadow-md">
            <div className="flex items-center gap-1">
              {(['overview', 'optical', 'lattice', 'top'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => selectPreset(p)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded capitalize transition-colors whitespace-nowrap ${
                    preset === p ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-slate-200 hidden sm:block" />

            <label className="flex items-center gap-2 text-[11px] text-slate-700 whitespace-nowrap">
              <Layers className="w-3.5 h-3.5 text-slate-600" />
              <span>Explode</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={explodeFactor}
                onChange={(e) => setExplodeFactor(Number(e.target.value))}
                className="w-20 accent-blue-600 cursor-pointer"
              />
            </label>

            <button
              type="button"
              onClick={() => {
                setExplodeFactor(0);
                setSelectedAxis(null);
                selectPreset('overview');
              }}
              title="Reset camera and layers"
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-slate-700 hover:text-slate-900 bg-slate-50 border border-slate-200 rounded"
            >
              <RotateCcw className="w-3 h-3" />
              <Compass className="w-3 h-3 hidden sm:inline" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
