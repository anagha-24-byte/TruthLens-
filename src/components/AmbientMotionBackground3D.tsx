import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

interface ShardNode {
  baseY: number;
  orbitR: number;
  speed: number;
  phase: number;
  scale: number;
}

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

function createParticleDiscTexture(): THREE.CanvasTexture {
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.96)');
  grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.72)');
  grad.addColorStop(0.78, 'rgba(255, 255, 255, 0.18)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function AmbientMotionBackground3D() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [fallbackVisible, setFallbackVisible] = useState(false);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
      setFallbackVisible(true);
      return;
    }

    const width = window.innerWidth || 1440;
    const height = window.innerHeight || 900;

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.85));
    renderer.setSize(width, height);

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.innerHTML = '';
    container.appendChild(canvas);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setFallbackVisible(true);
    };
    const onContextRestored = () => setFallbackVisible(false);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeef2f8);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 130);
    camera.position.set(0, 1.35, 13.6);
    camera.lookAt(0, 0, -3.2);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 1.45);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffaf2, 1.85);
    keyLight.position.set(8, 12, 9);
    scene.add(keyLight);

    const coolFill = new THREE.DirectionalLight(0xbfdbfe, 1.1);
    coolFill.position.set(-9, 5, 4);
    scene.add(coolFill);

    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [];

    // 1. Luminous Daylight Atmospheric Sky Dome
    const skyGeo = new THREE.SphereGeometry(58, 32, 24);
    const skyUniforms = { uTime: { value: 0 } };
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: skyUniforms,
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec3 vWorldPos;

        void main() {
          vec3 dir = normalize(vWorldPos);
          float drift = sin(dir.x * 2.8 + uTime * 0.24) * cos(dir.y * 2.4 - uTime * 0.18);
          float band = smoothstep(-0.35, 0.75, drift);

          vec3 pearlBase = vec3(0.945, 0.962, 0.988);
          vec3 skySapphire = vec3(0.80, 0.88, 0.99);
          vec3 mistViolet = vec3(0.88, 0.84, 0.98);
          vec3 aquaWash = vec3(0.81, 0.94, 0.96);

          vec3 col = mix(pearlBase, skySapphire, smoothstep(-0.3, 0.75, dir.x + drift * 0.25) * 0.78);
          col = mix(col, mistViolet, band * 0.56 * smoothstep(-0.4, 0.65, dir.y));
          col = mix(col, aquaWash, smoothstep(0.1, 0.9, -dir.x * dir.y) * 0.48);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    geometries.push(skyGeo);
    materials.push(skyMat);
    scene.add(new THREE.Mesh(skyGeo, skyMat));

    // 2. Full-Viewport High-Level 3D Radiation Wave Manifold (rich multi-spectrum interference waves)
    const radGeo = new THREE.PlaneGeometry(46, 36, 112, 80);
    const radUniforms = { uTime: { value: 0 } };
    const radMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      uniforms: radUniforms,
      vertexShader: `
        uniform float uTime;
        varying float vWave;
        varying float vDist;

        void main() {
          vec3 pos = position;
          float d = length(pos.xy * vec2(0.72, 1.0));
          vDist = d;

          float primaryPulse = sin(d * 2.1 - uTime * 2.35);
          float harmonicPulse = sin(d * 4.2 - uTime * 3.4) * 0.35;
          float crossWave = cos(pos.x * 0.52 - uTime * 1.1) * sin(pos.y * 0.48 + uTime * 0.9);
          float fade = exp(-d * 0.065);
          float h = (primaryPulse * 0.52 + harmonicPulse + crossWave * 0.3) * fade;
          pos.z += h * 1.45;
          vWave = h;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying float vWave;
        varying float vDist;

        void main() {
          float ringA = abs(sin(vDist * 2.15 - uTime * 2.35));
          float ringB = abs(sin(vDist * 4.3 - uTime * 3.4));
          float ringMask = smoothstep(0.76, 0.99, ringA) * 0.85 + smoothstep(0.88, 0.995, ringB) * 0.45;
          float radialFade = smoothstep(22.0, 1.8, vDist);

          vec3 cobalt = vec3(0.145, 0.388, 0.922);
          vec3 violet = vec3(0.486, 0.227, 0.929);
          vec3 teal = vec3(0.051, 0.580, 0.533);
          vec3 amber = vec3(0.851, 0.467, 0.024);
          vec3 rose = vec3(0.859, 0.153, 0.467);

          float t = 0.5 + 0.5 * sin(vDist * 0.42 - uTime * 0.95);
          vec3 col = mix(cobalt, violet, t);
          col = mix(col, teal, smoothstep(-0.3, 0.5, cos(vDist * 0.38 + uTime * 0.7)) * 0.5);
          col = mix(col, rose, smoothstep(0.4, 0.85, sin(vDist * 0.25 - uTime * 1.2)) * 0.32);
          col = mix(col, amber, smoothstep(0.24, 0.58, vWave) * 0.48);

          float alpha = (ringMask * 0.46 + max(0.0, vWave) * 0.28) * radialFade;
          gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.72));
        }
      `,
    });
    geometries.push(radGeo);
    materials.push(radMat);
    const radiationField = new THREE.Mesh(radGeo, radMat);
    radiationField.rotation.x = -Math.PI / 3.15;
    radiationField.position.set(0, -1.1, -4.4);
    scene.add(radiationField);

    // 3. Expanding 3D Spherical Volumetric Radiation Shells (radiating continuously from behind focal UI)
    const shellGeo = new THREE.IcosahedronGeometry(1, 3);
    geometries.push(shellGeo);

    const shellColors = [0x2563eb, 0x7c3aed, 0x0d9488, 0xd97706];
    const shellEntries: Array<{ mesh: THREE.Mesh; uniforms: { uTime: { value: number }; uColor: { value: THREE.Color }; uPhase: { value: number } }; phase: number }> = [];

    for (let i = 0; i < 4; i++) {
      const u = {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(shellColors[i]) },
        uPhase: { value: i * 0.25 },
      };
      const shellMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide,
        uniforms: u,
        vertexShader: `
          uniform float uTime;
          uniform float uPhase;
          varying vec3 vNormal;
          varying vec3 vViewDir;
          varying float vProgress;

          void main() {
            float prog = fract(uTime * 0.22 + uPhase);
            vProgress = prog;
            float waveDisp = 1.0 + 0.045 * sin(position.x * 5.0 + uTime * 2.4) * cos(position.y * 5.0 - uTime * 1.9);
            vec3 scaled = position * waveDisp;
            vec4 mvPos = modelViewMatrix * vec4(scaled, 1.0);
            vNormal = normalize(normalMatrix * normal);
            vViewDir = normalize(-mvPos.xyz);
            gl_Position = projectionMatrix * mvPos;
          }
        `,
        fragmentShader: `
          uniform vec3 uColor;
          varying vec3 vNormal;
          varying vec3 vViewDir;
          varying float vProgress;

          void main() {
            float fresnel = pow(1.0 - abs(dot(vNormal, vViewDir)), 2.2);
            float fadeIn = smoothstep(0.0, 0.14, vProgress);
            float fadeOut = 1.0 - smoothstep(0.5, 1.0, vProgress);
            float alpha = fresnel * fadeIn * fadeOut * 0.55;
            gl_FragColor = vec4(uColor, alpha);
          }
        `,
      });
      materials.push(shellMat);

      const shellMesh = new THREE.Mesh(shellGeo, shellMat);
      shellMesh.position.set(0, 0.05, -3.5);
      scene.add(shellMesh);
      shellEntries.push({ mesh: shellMesh, uniforms: u, phase: i * 0.25 });
    }

    // 4. Central Iridescent Forensic Crystal Core (visible behind blurred glass & on page flanks)
    const coreGroup = new THREE.Group();
    coreGroup.position.set(0, 0.05, -3.5);
    scene.add(coreGroup);

    const coreGeo = new THREE.IcosahedronGeometry(1.55, 1);
    const coreMat = new THREE.MeshPhysicalMaterial({
      color: 0x60a5fa,
      metalness: 0.1,
      roughness: 0.07,
      ior: 1.56,
      iridescence: 1.0,
      iridescenceIOR: 1.5,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      transmission: isSoftwareGl ? 0 : 0.78,
      thickness: 1.8,
      attenuationColor: new THREE.Color(0x4f46e5),
      attenuationDistance: 2.0,
      transparent: isSoftwareGl,
      opacity: isSoftwareGl ? 0.65 : 1,
    });
    const innerGeo = new THREE.OctahedronGeometry(0.68, 0);
    const innerMat = new THREE.MeshPhysicalMaterial({
      color: 0x2563eb,
      metalness: 0.42,
      roughness: 0.18,
      iridescence: 0.8,
      clearcoat: 0.9,
    });
    geometries.push(coreGeo, innerGeo);
    materials.push(coreMat, innerMat);

    const coreCrystal = new THREE.Mesh(coreGeo, coreMat);
    const innerCore = new THREE.Mesh(innerGeo, innerMat);
    coreGroup.add(coreCrystal, innerCore);

    // 5. Orbiting Colored Crystal Shards (26 solid crystal gems orbiting outward)
    const shardGeo = new THREE.OctahedronGeometry(0.28, 0);
    const shardMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.35,
      roughness: 0.15,
      iridescence: 0.8,
      clearcoat: 0.9,
    });
    geometries.push(shardGeo);
    materials.push(shardMat);

    const shardCount = 26;
    const shardNodes: ShardNode[] = [];
    const shardPalette = [0x2563eb, 0x7c3aed, 0x0d9488, 0xd97706, 0xe11d48, 0x4f46e5];
    const shardMesh = new THREE.InstancedMesh(shardGeo, shardMat, shardCount);
    shardMesh.frustumCulled = false;

    for (let i = 0; i < shardCount; i++) {
      const angle = (i / shardCount) * Math.PI * 2;
      const orbitR = 3.5 + (i % 5) * 1.25;
      shardNodes.push({
        baseY: ((i % 5) - 2) * 0.95,
        orbitR,
        speed: 0.15 + (i % 4) * 0.045,
        phase: angle,
        scale: 0.65 + (i % 3) * 0.36,
      });
      _color.setHex(shardPalette[i % shardPalette.length]);
      shardMesh.setColorAt(i, _color);
    }
    if (shardMesh.instanceColor) shardMesh.instanceColor.needsUpdate = true;
    scene.add(shardMesh);

    // 6. Outward-Radiating Cosmic Forensic Particle Field (1,600 multi-spectrum particles)
    const particleCount = isSoftwareGl ? 700 : 1600;
    const pPositions = new Float32Array(particleCount * 3);
    const pColors = new Float32Array(particleCount * 3);
    const pDirs = new Float32Array(particleCount * 3);
    const pSpeeds = new Float32Array(particleCount);
    const pOffsets = new Float32Array(particleCount);

    const cosmicColors = [
      new THREE.Color(0x2563eb),
      new THREE.Color(0x7c3aed),
      new THREE.Color(0x0d9488),
      new THREE.Color(0xd97706),
      new THREE.Color(0xdb2777),
      new THREE.Color(0x4338ca),
    ];

    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const dx = Math.sin(phi) * Math.cos(theta);
      const dy = Math.sin(phi) * Math.sin(theta) * 0.62;
      const dz = Math.cos(phi) * 0.55;

      pDirs[i * 3] = dx;
      pDirs[i * 3 + 1] = dy;
      pDirs[i * 3 + 2] = dz;
      pSpeeds[i] = 0.08 + Math.random() * 0.12;
      pOffsets[i] = Math.random();

      const r0 = 1.5 + pOffsets[i] * 13.0;
      pPositions[i * 3] = dx * r0;
      pPositions[i * 3 + 1] = dy * r0;
      pPositions[i * 3 + 2] = -3.5 + dz * r0;

      const c = cosmicColors[i % cosmicColors.length];
      pColors[i * 3] = c.r;
      pColors[i * 3 + 1] = c.g;
      pColors[i * 3 + 2] = c.b;
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(pColors, 3));
    geometries.push(particleGeo);

    const discTex = createParticleDiscTexture();
    textures.push(discTex);

    const particleMat = new THREE.PointsMaterial({
      size: 0.24,
      map: discTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      blending: THREE.NormalBlending,
      sizeAttenuation: true,
    });
    materials.push(particleMat);

    scene.add(new THREE.Points(particleGeo, particleMat));

    // Smooth pointer parallax
    let targetPtrX = 0;
    let targetPtrY = 0;
    let smoothPtrX = 0;
    let smoothPtrY = 0;

    const onPointerMove = (e: PointerEvent) => {
      targetPtrX = (e.clientX / window.innerWidth - 0.5) * 2;
      targetPtrY = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    const onResize = () => {
      const w = window.innerWidth || 1440;
      const h = window.innerHeight || 900;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    const updateScene = (elapsed: number, delta: number) => {
      skyUniforms.uTime.value = elapsed;
      radUniforms.uTime.value = elapsed;

      smoothPtrX = THREE.MathUtils.damp(smoothPtrX, targetPtrX, 3.0, delta);
      smoothPtrY = THREE.MathUtils.damp(smoothPtrY, targetPtrY, 3.0, delta);

      camera.position.x = Math.sin(elapsed * 0.16) * 0.45 + smoothPtrX * 1.05;
      camera.position.y = 1.35 + Math.cos(elapsed * 0.19) * 0.22 - smoothPtrY * 0.6;
      camera.lookAt(0, -0.05, -3.4);

      // Volumetric expanding spherical radiation shells
      for (let i = 0; i < shellEntries.length; i++) {
        const s = shellEntries[i];
        s.uniforms.uTime.value = elapsed;
        const prog = (elapsed * 0.22 + s.phase) % 1;
        const radius = 1.7 + prog * 8.2;
        s.mesh.scale.setScalar(radius);
        s.mesh.rotation.y = elapsed * 0.12 + i * 0.8;
      }

      // Central crystal core
      coreCrystal.rotation.y = elapsed * 0.26;
      coreCrystal.rotation.x = Math.sin(elapsed * 0.34) * 0.24;
      innerCore.rotation.y = -elapsed * 0.48;
      innerCore.rotation.z = elapsed * 0.3;
      coreGroup.position.y = 0.05 + Math.sin(elapsed * 0.7) * 0.18;

      // Orbiting shards
      for (let i = 0; i < shardCount; i++) {
        const s = shardNodes[i];
        const a = s.phase + elapsed * s.speed;
        _dummy.position.set(
          Math.cos(a) * s.orbitR,
          s.baseY + Math.sin(elapsed * 0.85 + s.phase) * 0.48,
          -3.5 + Math.sin(a) * (s.orbitR * 0.45)
        );
        _dummy.rotation.set(elapsed * 0.48 + s.phase, elapsed * 0.7, s.phase);
        _dummy.scale.setScalar(s.scale);
        _dummy.updateMatrix();
        shardMesh.setMatrixAt(i, _dummy.matrix);
      }
      shardMesh.instanceMatrix.needsUpdate = true;

      // Outward-radiating particle flow + gentle swirl
      const posAttr = particleGeo.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const rotCos = Math.cos(elapsed * 0.045);
      const rotSin = Math.sin(elapsed * 0.045);

      for (let i = 0; i < particleCount; i++) {
        const ix = i * 3;
        const prog = (pOffsets[i] + elapsed * pSpeeds[i]) % 1;
        const r = 1.4 + prog * 13.5;

        const dx = pDirs[ix];
        const dy = pDirs[ix + 1];
        const dz = pDirs[ix + 2];

        const sx = dx * r;
        const sz = dz * r;
        const rx = sx * rotCos - sz * rotSin;
        const rz = sx * rotSin + sz * rotCos - 3.5;

        arr[ix] = rx;
        arr[ix + 1] = dy * r + Math.sin(elapsed * 0.9 + pOffsets[i] * 6.28) * 0.22;
        arr[ix + 2] = rz;
      }
      posAttr.needsUpdate = true;
    };

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
      updateScene(elapsed, delta);
      renderer.render(scene, camera);
      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }

    if (prefersReducedMotion) {
      updateScene(0, 0.016);
      renderer.render(scene, camera);
    } else {
      tick();
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      envTex.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-[#EEF2F8]"
    >
      <div ref={mountRef} className="w-full h-full" />
      {fallbackVisible && (
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 50% 45%, rgba(37, 99, 235, 0.16) 0%, rgba(124, 58, 237, 0.12) 38%, rgba(238, 242, 248, 0.95) 75%)',
          }}
        />
      )}
    </div>
  );
}
