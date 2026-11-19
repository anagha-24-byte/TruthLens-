import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RotateCcw } from 'lucide-react';
import type { AudioDspSummary } from '../types/forensics';

export function SpectralTerrain3D({ audio }: { audio: AudioDspSummary }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const resetCamRef = useRef<(() => void) | null>(null);
  const [contextLost, setContextLost] = useState(false);

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
      });
    } catch {
      setContextLost(true);
      return;
    }

    const w = container.clientWidth || 640;
    const h = container.clientHeight || 260;

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.innerHTML = '';
    container.appendChild(canvas);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => setContextLost(false);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    const bgColor = 0xf1f5f9;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(bgColor);
    scene.fog = new THREE.FogExp2(bgColor, 0.045);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 80);
    camera.position.set(4.5, 3.2, 5.2);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.target.set(0, 0.2, 0);

    resetCamRef.current = () => {
      camera.position.set(4.5, 3.2, 5.2);
      controls.target.set(0, 0.2, 0);
      controls.update();
      requestRender();
    };

    const key = new THREE.DirectionalLight(0xfffaf0, 1.6);
    key.position.set(4, 6, 4);
    scene.add(key);
    scene.add(new THREE.HemisphereLight(0xf8fafc, 0xcbd5e1, 1.0));

    // Build 3D spectral mesh from real timelineMetrics
    const points = audio.timelineMetrics.length > 1 ? audio.timelineMetrics : [
      { timestampSec: 0, rms: 0.05, zcr: 0.05, spectralCentroidHz: 1000, spectralBandwidthHz: 600, pitchHz: null, voiceActive: false },
      { timestampSec: 1, rms: 0.05, zcr: 0.05, spectralCentroidHz: 1000, spectralBandwidthHz: 600, pitchHz: null, voiceActive: false },
    ];

    const segX = Math.min(64, Math.max(12, points.length - 1));
    const segZ = 14;
    const widthX = 6.2;
    const depthZ = 3.2;

    const geo = new THREE.PlaneGeometry(widthX, depthZ, segX, segZ);
    geo.rotateX(-Math.PI / 2);

    const posAttr = geo.attributes.position;
    const colors = new Float32Array(posAttr.count * 3);
    const color = new THREE.Color();

    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      const u = (vx + widthX / 2) / widthX;
      const v = (vz + depthZ / 2) / depthZ;

      const pIdx = Math.min(points.length - 1, Math.max(0, Math.round(u * (points.length - 1))));
      const pt = points[pIdx];

      const rmsNorm = Math.min(1, pt.rms * 4.2);
      const centroidNorm = Math.min(1, pt.spectralCentroidHz / 3800);
      const bandEnvelope = Math.exp(-Math.pow((v - centroidNorm) * 3.1, 2));
      const mfccMod = audio.mfccSummary[Math.min(12, Math.floor(v * 12))] ?? 0.5;

      const elevation = rmsNorm * bandEnvelope * (0.65 + mfccMod * 0.35) * 1.85;
      posAttr.setY(i, elevation);

      if (elevation > 1.15) color.setHex(0xdc2626);
      else if (elevation > 0.65) color.setHex(0xd97706);
      else if (elevation > 0.25) color.setHex(0x2563eb);
      else color.setHex(0x94a3b8);

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.45,
      metalness: 0.15,
      flatShading: false,
      side: THREE.DoubleSide,
    });
    const terrain = new THREE.Mesh(geo, mat);
    scene.add(terrain);

    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x475569,
      wireframe: true,
      transparent: true,
      opacity: 0.18,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const wireMesh = new THREE.Mesh(geo, wireMat);
    wireMesh.position.y = 0.005;
    scene.add(wireMesh);

    const grid = new THREE.GridHelper(7.5, 16, 0xcbd5e1, 0xe2e8f0);
    grid.position.y = -0.02;
    scene.add(grid);

    let frameId = 0;
    let disposed = false;
    let renderBusy = false;
    let renderDirty = false;

    function afterDraw(done: () => void) {
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
          frameId = window.setTimeout(done, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function requestRender() {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;
        controls.update();
        renderer.render(scene, camera);
        const done = () => {
          renderBusy = false;
          if (renderDirty) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    controls.addEventListener('change', requestRender);
    const resizeObs = new ResizeObserver(() => {
      if (!container) return;
      const nw = container.clientWidth || 640;
      const nh = container.clientHeight || 260;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
      requestRender();
    });
    resizeObs.observe(container);

    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObs.disconnect();
      controls.removeEventListener('change', requestRender);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      controls.dispose();
      geo.dispose();
      mat.dispose();
      wireMat.dispose();
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      envTex.dispose();
      renderer.dispose();
    };
  }, [audio]);

  return (
    <div className="relative w-full h-[270px] rounded-md border border-slate-200 bg-[#F1F5F9] overflow-hidden">
      <div ref={mountRef} className="w-full h-full" />
      {contextLost && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-600 bg-[#F1F5F9]">
          3D spectral ridge unavailable on this device context.
        </div>
      )}
      <div className="absolute top-2.5 left-3 pointer-events-none text-[11px] font-mono text-slate-700 bg-white/95 border border-slate-200 px-2 py-1 rounded shadow-xs">
        3D Acoustic Spectral Terrain (Time × Centroid × RMS)
      </div>
      <button
        type="button"
        onClick={() => resetCamRef.current?.()}
        className="absolute top-2.5 right-3 inline-flex items-center gap-1 px-2.5 py-1 text-[11px] text-slate-700 hover:text-slate-900 bg-white/95 border border-slate-200 rounded shadow-xs"
      >
        <RotateCcw className="w-3 h-3" /> Reset Orbit
      </button>
    </div>
  );
}
