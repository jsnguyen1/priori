// R3F molecular viewer: real PDB 6J8E Cα trace of human NaV1.2 in membrane context.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Billboard, Html, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Crosshair, RotateCcw } from 'lucide-react';
import { useStore } from '../../state/store';
import { getVariant } from '../../data/variants';
import { regionById, regionAt } from '../../data/published';
import { REFERENCE_PARAMS, relativeConductanceAt } from '../../sim/channel';
import { C, MOTION, prefersReducedMotion } from '../../ui/tokens';
import { Button, EvidenceBadge, Segmented, cx, fmt } from '../../ui/primitives';
import {
  DOMAIN_COLOR,
  DOMAIN_LEGEND,
  MEMBRANE,
  REGION_GEOM,
  RESIDUES,
  buildChunks,
  lipidHeadgroups,
  nearestResolved,
  type Chunk,
} from './structure';
import { MEASUREMENT_LINK, useLabUi, useVariantStatus } from './labUi';

/** Minimal surface of three-stdlib OrbitControls used here. */
interface OrbitControlsImpl {
  target: THREE.Vector3;
  update: () => void;
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
}

// ─── Camera poses ────────────────────────────────────────────────────────

interface Pose { pos: THREE.Vector3; target: THREE.Vector3 }

const OVERVIEW: Pose = (() => {
  const target = new THREE.Vector3(0, 4, 0);
  const az = THREE.MathUtils.degToRad(38);
  const el = THREE.MathUtils.degToRad(17);
  const d = 375;
  return { target, pos: target.clone().add(new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(d)) };
})();

/** Look at a point from outside the protein (radially outward from the pore axis), slightly elevated. */
function poseAround(center: THREE.Vector3, distance: number, fallbackDir: THREE.Vector3): Pose {
  const radial = new THREE.Vector3(center.x, 0, center.z);
  const dir = radial.length() > 4 ? radial.normalize() : new THREE.Vector3(fallbackDir.x, 0, fallbackDir.z).normalize();
  // bias toward the default 3/4 azimuth so successive framings feel coherent
  dir.lerp(new THREE.Vector3(OVERVIEW.pos.x, 0, OVERVIEW.pos.z).normalize(), 0.25).normalize();
  const el = THREE.MathUtils.degToRad(center.y < -18 ? -8 : 18);
  const v = dir.multiplyScalar(Math.cos(el)).add(new THREE.Vector3(0, Math.sin(el), 0)).normalize();
  return { target: center.clone(), pos: center.clone().addScaledVector(v, distance) };
}

// cubic-bezier easing matching MOTION.ease
function bezierEase([x1, y1, x2, y2]: [number, number, number, number]) {
  const bx = (t: number) => 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
  const by = (t: number) => 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
  return (x: number) => {
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 24; k++) {
      const m = (lo + hi) / 2;
      if (bx(m) < x) lo = m;
      else hi = m;
    }
    return by((lo + hi) / 2);
  };
}
const ease = bezierEase(MOTION.ease);

function CameraRig({ mutationPos }: { mutationPos: THREE.Vector3 | null }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const invalidate = useThree((s) => s.invalidate);
  const tween = useRef<{ from: Pose; to: Pose; t0: number; dur: number } | null>(null);
  const nonce = useStore((s) => s.lab.cameraNonce);
  const variantId = useStore((s) => s.selectedVariantId);
  const baseline = useRef({ nonce, variantId });
  const mutRef = useRef(mutationPos);
  mutRef.current = mutationPos;

  const go = useCallback(
    (to: Pose) => {
      if (!controls) return;
      if (prefersReducedMotion()) {
        camera.position.copy(to.pos);
        controls.target.copy(to.target);
        controls.update();
        invalidate();
        return;
      }
      tween.current = { from: { pos: camera.position.clone(), target: controls.target.clone() }, to, t0: performance.now(), dur: MOTION.camera * 1000 };
      invalidate();
    },
    [camera, controls, invalidate],
  );

  const poseFor = useCallback(
    (target: 'overview' | 'mutation' | 'region', regionId: string | null): Pose => {
      const cur = camera.position.clone().sub(controls?.target ?? new THREE.Vector3());
      if (target === 'mutation' && mutRef.current) return poseAround(mutRef.current, 250, cur);
      if (target === 'region' && regionId) {
        const g = REGION_GEOM.get(regionId);
        if (g?.centroid) return poseAround(g.centroid, THREE.MathUtils.clamp(g.radius * 4 + 160, 190, 380), cur);
      }
      return OVERVIEW;
    },
    [camera, controls],
  );

  // Entry: start from the default composition, then glide toward the mutation.
  useEffect(() => {
    if (!controls) return;
    camera.position.copy(OVERVIEW.pos);
    controls.target.copy(OVERVIEW.target);
    controls.update();
    invalidate();
    if (!mutRef.current) return;
    const id = setTimeout(() => go(poseFor('mutation', null)), 450);
    return () => clearTimeout(id);
  }, [controls]); // eslint-disable-line react-hooks/exhaustive-deps

  // Explicit camera requests from the store.
  useEffect(() => {
    if (nonce === baseline.current.nonce) return;
    baseline.current.nonce = nonce;
    const { cameraTarget, focusRegionId } = useStore.getState().lab;
    go(poseFor(cameraTarget, focusRegionId));
  }, [nonce, go, poseFor]);

  // Variant change while in the module → frame the new mutation.
  useEffect(() => {
    if (variantId === baseline.current.variantId) return;
    baseline.current.variantId = variantId;
    const id = setTimeout(() => go(poseFor('mutation', null)), 30);
    return () => clearTimeout(id);
  }, [variantId, go, poseFor]);

  // User interaction cancels a tween.
  useEffect(() => {
    if (!controls) return;
    const cancel = () => (tween.current = null);
    controls.addEventListener('start', cancel);
    return () => controls.removeEventListener('start', cancel);
  }, [controls]);

  useFrame(() => {
    const tw = tween.current;
    if (!tw || !controls) return;
    const k = Math.min(1, (performance.now() - tw.t0) / tw.dur);
    const e = ease(k);
    const target = tw.from.target.clone().lerp(tw.to.target, e);
    const d0 = tw.from.pos.distanceTo(tw.from.target);
    const d1 = tw.to.pos.distanceTo(tw.to.target);
    const dir0 = tw.from.pos.clone().sub(tw.from.target).normalize();
    const dir1 = tw.to.pos.clone().sub(tw.to.target).normalize();
    const dir = dir0.lerp(dir1, e);
    if (dir.lengthSq() < 1e-6) dir.copy(dir1);
    dir.normalize();
    controls.target.copy(target);
    camera.position.copy(target).addScaledVector(dir, d0 + (d1 - d0) * e);
    controls.update();
    if (k >= 1) tween.current = null;
    else invalidate();
  });
  return null;
}

// ─── Colour state ────────────────────────────────────────────────────────

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();
const CANVAS = new THREE.Color(C.canvas);
const WHITE = new THREE.Color('#ffffff');

function baseColor(regionId: string): string {
  const r = regionById(regionId);
  return DOMAIN_COLOR[r?.domain ?? 'linker'];
}

interface HighlightState {
  hover: string | null;
  focus: string | null;
  linked: Set<string> | null;
}

function shade(regionId: string, h: HighlightState): { color: THREE.Color; emissive: THREE.Color } {
  tmpA.set(baseColor(regionId));
  const emissive = new THREE.Color(0x000000);
  const isLinked = h.linked?.has(regionId) ?? false;
  if (h.linked && h.linked.size) {
    if (isLinked) {
      tmpA.lerp(WHITE, 0.2);
      emissive.copy(tmpA).multiplyScalar(0.26);
    } else tmpA.lerp(CANVAS, 0.62);
  } else if (h.focus) {
    if (regionId === h.focus) {
      tmpA.lerp(WHITE, 0.16);
      emissive.copy(tmpA).multiplyScalar(0.22);
    } else tmpA.lerp(CANVAS, 0.35);
  }
  if (h.hover === regionId) {
    tmpA.lerp(WHITE, 0.22);
    emissive.add(tmpB.copy(tmpA).multiplyScalar(0.1));
  }
  return { color: tmpA.clone(), emissive };
}

function useHighlight(): HighlightState {
  const hover = useLabUi((s) => s.hoverRegionId);
  const linkKey = useLabUi((s) => s.linkKey);
  const focus = useStore((s) => s.lab.focusRegionId);
  const linked = useMemo(() => (linkKey ? new Set(MEASUREMENT_LINK[linkKey].regionIds) : null), [linkKey]);
  return { hover, focus, linked };
}

// ─── Protein ─────────────────────────────────────────────────────────────

function usePicking() {
  const setUi = useLabUi((s) => s.set);
  const requestCamera = useStore((s) => s.requestCamera);
  useEffect(() => () => void (document.body.style.cursor = ''), []);
  return {
    over: (regionId: string) => {
      setUi({ hoverRegionId: regionId });
      document.body.style.cursor = 'pointer';
    },
    out: () => {
      setUi({ hoverRegionId: null });
      document.body.style.cursor = '';
    },
    click: (e: ThreeEvent<MouseEvent>, regionId: string) => {
      e.stopPropagation();
      if (e.delta > 4) return; // drag, not click
      requestCamera('region', regionId);
    },
  };
}

function ChunkMesh({ chunk, h, pick }: { chunk: Chunk; h: HighlightState; pick: ReturnType<typeof usePicking> }) {
  const { color, emissive } = useMemo(() => shade(chunk.regionId, h), [chunk.regionId, h]);
  return (
    <mesh
      geometry={chunk.geometry}
      onPointerOver={(e) => {
        e.stopPropagation();
        pick.over(chunk.regionId);
      }}
      onPointerOut={pick.out}
      onClick={(e) => pick.click(e, chunk.regionId)}
    >
      <meshStandardMaterial color={color} emissive={emissive} roughness={0.55} metalness={0.02} />
    </mesh>
  );
}

function TubeProtein({ style }: { style: 'cartoon' | 'trace' }) {
  const chunks = useMemo(() => buildChunks(style), [style]);
  useEffect(() => () => chunks.forEach((c) => c.geometry.dispose()), [chunks]);
  const h = useHighlight();
  const pick = usePicking();
  return (
    <group>
      {chunks.map((c) => (
        <ChunkMesh key={c.key} chunk={c} h={h} pick={pick} />
      ))}
    </group>
  );
}

function SphereProtein() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geom = useMemo(() => new THREE.SphereGeometry(1.9, 12, 9), []);
  const h = useHighlight();
  const pick = usePicking();
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    RESIDUES.forEach((r, i) => {
      o.position.copy(r.pos);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, []);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const cache = new Map<string, THREE.Color>();
    RESIDUES.forEach((r, i) => {
      let c = cache.get(r.regionId);
      if (!c) {
        const s = shade(r.regionId, h);
        c = s.color.add(s.emissive);
        cache.set(r.regionId, c);
      }
      m.setColorAt(i, c);
    });
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    invalidate();
  }, [h, invalidate]);
  useEffect(() => () => geom.dispose(), [geom]);
  const regionOf = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.instanceId != null ? RESIDUES[e.instanceId]?.regionId : undefined);
  return (
    <instancedMesh
      ref={ref}
      args={[geom, undefined, RESIDUES.length]}
      onPointerMove={(e) => {
        e.stopPropagation();
        const id = regionOf(e);
        if (id && id !== useLabUi.getState().hoverRegionId) pick.over(id);
      }}
      onPointerOut={pick.out}
      onClick={(e) => {
        const id = regionOf(e);
        if (id) pick.click(e, id);
      }}
    >
      <meshStandardMaterial roughness={0.6} metalness={0.02} />
    </instancedMesh>
  );
}

// ─── Membrane ────────────────────────────────────────────────────────────

const noRaycast = () => null;

function Membrane() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const heads = useMemo(() => lipidHeadgroups(), []);
  const geom = useMemo(() => new THREE.SphereGeometry(1.45, 10, 7), []);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    heads.forEach((p, i) => {
      o.position.copy(p);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [heads]);
  useEffect(() => () => geom.dispose(), [geom]);
  const ring = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let k = 0; k <= 96; k++) {
      const a = (k / 96) * Math.PI * 2;
      pts.push([Math.cos(a) * MEMBRANE.radius, 0, Math.sin(a) * MEMBRANE.radius]);
    }
    return pts;
  }, []);
  const H = MEMBRANE.halfThickness;
  return (
    <group>
      <mesh raycast={noRaycast} renderOrder={-1}>
        <cylinderGeometry args={[MEMBRANE.radius, MEMBRANE.radius, 2 * H, 96, 1, false]} />
        <meshBasicMaterial color="#7B97A8" transparent opacity={0.045} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <group position={[0, H, 0]}>
        <Line points={ring} color={C.line} lineWidth={1} transparent opacity={0.9} raycast={noRaycast} />
      </group>
      <group position={[0, -H, 0]}>
        <Line points={ring} color={C.line} lineWidth={1} transparent opacity={0.9} raycast={noRaycast} />
      </group>
      <instancedMesh ref={ref} args={[geom, undefined, heads.length]} raycast={noRaycast}>
        <meshStandardMaterial color="#62737F" roughness={0.85} metalness={0} transparent opacity={0.8} />
      </instancedMesh>
      <Html position={[-22, 31, 40]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <SideLabel text="EXTRACELLULAR" arrow="▲" />
      </Html>
      <Html position={[-22, -31, 40]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <SideLabel text="INTRACELLULAR" arrow="▼" />
      </Html>
      <Html position={[-22, 0, 40]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div className="font-mono text-[9px] tracking-[0.12em] text-dim whitespace-nowrap">BILAYER · ~30 Å</div>
      </Html>
    </group>
  );
}

function SideLabel({ text, arrow }: { text: string; arrow: string }) {
  return (
    <div className="font-mono text-[10px] tracking-[0.14em] text-mute whitespace-nowrap select-none">
      <span className="text-dim mr-1">{arrow}</span>
      {text}
    </div>
  );
}

// ─── Pore axis & ions ────────────────────────────────────────────────────

const AXIS_TOP = 56;
const AXIS_BOTTOM = -48;

function PoreAxis() {
  return (
    <group>
      <Line points={[[0, AXIS_TOP, 0], [0, AXIS_BOTTOM, 0]]} color={C.dim} lineWidth={1} dashed dashSize={2.2} gapSize={2.2} raycast={noRaycast} />
      <Html position={[0, AXIS_TOP + 4, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div className="font-mono text-[9px] tracking-[0.12em] text-dim whitespace-nowrap">PORE AXIS</div>
      </Html>
    </group>
  );
}

const ION_POOL = 44;
const ION_SPEED = 16; // Å/s (visual only)
const golden = 0.6180339887;

/** Pore radius envelope for the illustrative path: narrow through the membrane, wider in the vestibules. */
const envelope = (y: number) => {
  const a = Math.abs(y);
  return a < 12 ? 0.5 : Math.min(9, 0.5 + (a - 12) * 0.42);
};

function Ions({ fraction, animate }: { fraction: number; animate: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geom = useMemo(() => new THREE.SphereGeometry(0.95, 10, 8), []);
  const shown = useRef(fraction);
  const o = useMemo(() => new THREE.Object3D(), []);
  const invalidate = useThree((s) => s.invalidate);
  const L = AXIS_TOP - AXIS_BOTTOM;
  const place = useCallback(
    (time: number) => {
      const m = ref.current;
      if (!m) return;
      for (let i = 0; i < ION_POOL; i++) {
        const offset = ((i * golden) % 1) * L;
        const y = AXIS_TOP - ((time * ION_SPEED + offset) % L);
        // low-discrepancy subset: index rank decides membership, so any fraction is evenly spread
        const rank = (i + 0.5) / ION_POOL;
        const on = rank < shown.current;
        const edge = Math.min(1, (AXIS_TOP - y) / 6, (y - AXIS_BOTTOM) / 6);
        const s = on ? Math.max(0, edge) : 0;
        const theta = i * 2.39996 + y * 0.05;
        const r = envelope(y) * (0.4 + ((i * 0.37) % 1) * 0.6);
        o.position.set(Math.cos(theta) * r, y, Math.sin(theta) * r);
        o.scale.setScalar(s);
        o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
      }
      m.instanceMatrix.needsUpdate = true;
    },
    [L, o],
  );
  useLayoutEffect(() => {
    if (!animate) {
      shown.current = fraction;
      place(2.4);
      invalidate();
    }
  }, [animate, fraction, place, invalidate]);
  useFrame((state, dt) => {
    if (!animate) return;
    shown.current += (fraction - shown.current) * Math.min(1, dt * 2.5);
    place(state.clock.elapsedTime);
  });
  useEffect(() => () => geom.dispose(), [geom]);
  return (
    <instancedMesh ref={ref} args={[geom, undefined, ION_POOL]} raycast={noRaycast} frustumCulled={false}>
      <meshStandardMaterial color="#D3E4EE" emissive="#5F7684" roughness={0.35} metalness={0} />
    </instancedMesh>
  );
}

// ─── Mutation marker ─────────────────────────────────────────────────────

function MutationMarker({ pos, color, label, sub, pulse }: { pos: THREE.Vector3; color: string; label: string; sub: string; pulse: boolean }) {
  const halo = useRef<THREE.MeshBasicMaterial>(null);
  const labelPos = useMemo(() => {
    const radial = new THREE.Vector3(pos.x, 0, pos.z);
    const out = radial.length() > 3 ? radial.normalize() : new THREE.Vector3(1, 0, 0);
    return pos.clone().addScaledVector(out, 14).add(new THREE.Vector3(0, 14, 0));
  }, [pos]);
  useFrame((state) => {
    if (!pulse || !halo.current) return;
    halo.current.opacity = 0.16 + 0.08 * (0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 2.2));
  });
  return (
    <group>
      <mesh position={pos} raycast={noRaycast}>
        <sphereGeometry args={[2.2, 20, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55} roughness={0.4} />
      </mesh>
      <mesh position={pos} raycast={noRaycast} renderOrder={5}>
        <sphereGeometry args={[3.8, 24, 18]} />
        <meshBasicMaterial ref={halo} color={color} transparent opacity={0.2} depthWrite={false} depthTest={false} />
      </mesh>
      <Billboard position={pos}>
        <mesh raycast={noRaycast} renderOrder={10}>
          <ringGeometry args={[4.9, 5.4, 48]} />
          <meshBasicMaterial color={color} transparent opacity={0.95} depthTest={false} depthWrite={false} />
        </mesh>
      </Billboard>
      <Line points={[pos, labelPos]} color={color} lineWidth={1} transparent opacity={0.8} depthTest={false} raycast={noRaycast} />
      <Html position={labelPos} zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
        <div className="-translate-y-1/2 pl-1.5 whitespace-nowrap">
          <div className="font-mono text-[11px] leading-tight" style={{ color }}>{label}</div>
          <div className="font-mono text-[9px] leading-tight text-mute">{sub}</div>
        </div>
      </Html>
    </group>
  );
}

// ─── Scene ───────────────────────────────────────────────────────────────

function Lights() {
  return (
    <>
      <hemisphereLight args={['#D6E2EA', '#0E161D', 0.85]} />
      <directionalLight position={[90, 140, 110]} intensity={1.6} color="#F2F5F7" />
      <directionalLight position={[-120, -40, -140]} intensity={0.5} color="#8FB0C4" />
    </>
  );
}

export function MolecularViewer() {
  const lab = useStore((s) => s.lab);
  const setLab = useStore((s) => s.setLab);
  const requestCamera = useStore((s) => s.requestCamera);
  const variantId = useStore((s) => s.selectedVariantId);
  const variant = getVariant(variantId);
  const { classified, color: mechColor } = useVariantStatus(variantId);
  const hoverRegionId = useLabUi((s) => s.hoverRegionId);
  const linkKey = useLabUi((s) => s.linkKey);
  const reduced = useMemo(() => prefersReducedMotion(), []);

  const anchor = useMemo(() => (variant ? nearestResolved(variant.position) : null), [variant]);
  const mutationPos = anchor?.residue.pos ?? null;

  // Ion flux ∝ modelled conductance at −10 mV (steady-state approximation).
  const gRef = useMemo(() => relativeConductanceAt(-10, REFERENCE_PARAMS), []);
  const gVar = useMemo(() => (variant ? relativeConductanceAt(-10, variant.params) : gRef), [variant, gRef]);
  const ratio = gVar / gRef;
  const variantFluxAvailable = classified;
  const showingVariant = lab.channelState === 'variant';
  // Until the variant is characterized, the flux shown is the reference channel (stated explicitly).
  const ionFraction = showingVariant && variantFluxAvailable ? Math.min(1, 0.55 * ratio) : 0.55;
  const ionsAnimate = lab.showIons && !reduced && ionFraction > 0;

  const hoverRegion = hoverRegionId ? regionById(hoverRegionId) : null;
  const focusRegion = lab.focusRegionId ? regionById(lab.focusRegionId) : null;
  const region = variant ? regionAt(variant.position) : null;

  const [ready, setReady] = useState(false);

  return (
    <div className="absolute inset-0 overflow-hidden bg-canvas" data-tour="lab.viewer">
      <Canvas
        frameloop={ionsAnimate ? 'always' : 'demand'}
        dpr={[1, 2]}
        camera={{ fov: 30, near: 2, far: 1600, position: OVERVIEW.pos.toArray() as [number, number, number] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={() => setReady(true)}
      >
        <color attach="background" args={[C.canvas]} />
        <fog attach="fog" args={[C.canvas, 230, 560]} />
        <Lights />
        {lab.representation === 'spheres' ? <SphereProtein /> : <TubeProtein style={lab.representation} />}
        {lab.showMembrane && <Membrane />}
        <PoreAxis />
        {lab.showIons && <Ions fraction={ionFraction} animate={ionsAnimate} />}
        {variant && mutationPos && (
          <MutationMarker
            pos={mutationPos}
            color={classified ? mechColor : C.ink}
            label={`${variant.hgvsP}`}
            sub={anchor?.resolved ? `residue ${variant.position} · ${region?.label ?? ''}` : `residue ${variant.position} unresolved · shown at ${anchor?.residue.res}`}
            pulse={ionsAnimate}
          />
        )}
        <CameraRig mutationPos={mutationPos} />
        <OrbitControls makeDefault enableDamping dampingFactor={0.09} rotateSpeed={0.6} zoomSpeed={0.8} panSpeed={0.7} minDistance={30} maxDistance={700} />
      </Canvas>

      {/* ── Toolbar ── */}
      <div className="absolute top-2.5 left-2.5 right-2.5 flex items-start justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-1.5 pointer-events-auto">
          <Segmented
            value={lab.representation}
            onChange={(v) => setLab({ representation: v })}
            options={[
              { value: 'cartoon', label: 'Cartoon', title: 'Helices as thick cylinders along the local helix axis; loops as thin tubes' },
              { value: 'trace', label: 'Trace', title: 'Thin Cα trace' },
              { value: 'spheres', label: 'Spheres', title: 'One sphere per resolved Cα' },
            ]}
          />
          <Button size="sm" onClick={() => requestCamera('mutation')} disabled={!variant}>
            <Crosshair size={12} /> <span className="whitespace-nowrap">Focus mutation</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => requestCamera('overview')}>
            <RotateCcw size={12} /> Reset
          </Button>
        </div>
        <div className="flex flex-col items-end gap-1 pointer-events-auto">
          <div className="flex items-center gap-2.5 px-2 h-6 border border-line2 bg-bg/80 rounded font-mono text-[10px] text-mute">
            {DOMAIN_LEGEND.map((d) => (
              <span key={d.id} className="inline-flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-[1px]" style={{ background: DOMAIN_COLOR[d.id] }} />
                {d.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Hover / linkage readout ── */}
      <div className="absolute top-11 left-2.5 flex flex-col gap-1 pointer-events-none">
        {hoverRegion && (
          <div className="px-2 py-1 border border-line bg-bg/90 rounded font-mono text-[10px] text-ink">
            {hoverRegion.label} <span className="text-dim">· {hoverRegion.start}–{hoverRegion.end} · {hoverRegion.topology} · click to select</span>
          </div>
        )}
        {linkKey && (
          <div className="px-2 py-1 border border-cyan/40 bg-bg/90 rounded font-mono text-[10px] text-cyan">
            STRUCTURAL CORRELATE · {MEASUREMENT_LINK[linkKey].label}
          </div>
        )}
      </div>

      {/* ── Focused region annotation ── */}
      {focusRegion && !linkKey && (
        <div className="absolute left-2.5 bottom-[74px] w-[300px] border border-line bg-bg/90 rounded px-2.5 py-2 pointer-events-auto">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] text-ink">{focusRegion.label}</span>
            <button className="font-mono text-[10px] text-dim hover:text-ink" onClick={() => setLab({ focusRegionId: null })}>CLEAR</button>
          </div>
          <div className="font-mono text-[10px] text-mute mt-0.5">
            {focusRegion.start}–{focusRegion.end} · {focusRegion.topology} · resolved {REGION_GEOM.get(focusRegion.id)?.resolved}/{REGION_GEOM.get(focusRegion.id)?.total}
          </div>
        </div>
      )}

      {/* ── Ion flux note ── */}
      {lab.showIons && (
        <div className="absolute right-2.5 bottom-[74px] max-w-[300px] text-right pointer-events-none">
          <div className="font-mono text-[10px] text-mute">
            Na⁺ flux · {showingVariant ? 'VARIANT' : 'REFERENCE'} ·{' '}
            {showingVariant ? (variantFluxAvailable ? <span style={{ color: mechColor }}>{fmt.num(ratio, 2)}× reference conductance</span> : <span className="text-dim">not yet characterized · showing reference</span>) : '1.00× reference conductance'}
          </div>
          <div className="font-mono text-[9px] text-dim">g(−10 mV) from shared gating model · Illustrative ion flux — not a molecular dynamics simulation</div>
        </div>
      )}

      {/* ── Provenance ── */}
      <div className={cx('absolute left-0 right-0 bottom-0 px-2.5 py-1.5 border-t border-line2 bg-bg/85 flex flex-col gap-0.5 transition-opacity', ready ? 'opacity-100' : 'opacity-0')}>
        <div className="flex items-center gap-2 font-mono text-[10px] text-mute">
          <EvidenceBadge category="published" />
          <span>Structure: PDB 6J8E · human NaV1.2 · cryo-EM · Pan et al. 2019 · Cα trace (β2 and KIIIA omitted)</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-mute">
          <EvidenceBadge category="hypothetical" />
          <span>
            {variant ? `${variant.hgvsP} · ` : ''}Mutation position mapped by residue number; structural effect not modeled
            {anchor && !anchor.resolved && <span className="text-warn"> · residue {variant?.position} unresolved in 6J8E — marker at nearest resolved residue {anchor.residue.res}</span>}
          </span>
        </div>
      </div>
    </div>
  );
}
