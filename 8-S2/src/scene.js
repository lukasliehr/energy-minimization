// Three-dimensional view: glass sphere, eight draggable points, inscribed polyhedron
// and force arrows. Coordinates are those of the paper, with the z-axis pointing up.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { N } from './math.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const POINT_RADIUS = 0.055;
const FIT_RADIUS = 1.3;

// The colours of the two squares and of the background come from the CSS
// variables --upper, --lower and --page in style.css.
const SCENE_THEMES = {
  light: {
    neutral: '#7d7c76',
    edge: '#6f6e68',
    face: '#6a7f9e',
    faceOpacity: 0.085,
    arrow: '#2b2b29',
    glassTint: '#8794a8',
    glassRim: '#5b6b84',
    glassAlpha: 0.045,
    rimAlpha: 0.5,
    specular: 0.55,
  },
  dark: {
    neutral: '#8f8e87',
    edge: '#a3a29a',
    face: '#9db4d6',
    faceOpacity: 0.075,
    arrow: '#e8e7e2',
    glassTint: '#7f93ad',
    glassRim: '#a9c1e3',
    glassAlpha: 0.04,
    rimAlpha: 0.42,
    specular: 0.4,
  },
};

const sphereVertexShader = /* glsl */ `
  varying vec3 vNormalView;
  varying vec3 vToCamera;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormalView = normalize(normalMatrix * normal);
    vToCamera = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const sphereFragmentShader = /* glsl */ `
  precision highp float;
  uniform vec3 uTint;
  uniform vec3 uRim;
  uniform float uGlassAlpha;
  uniform float uRimAlpha;
  uniform float uSpecular;
  uniform vec3 uLight;
  varying vec3 vNormalView;
  varying vec3 vToCamera;

  void main() {
    vec3 n = normalize(vNormalView);
    vec3 v = normalize(vToCamera);
    float fresnel = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.4);
    float highlight = uSpecular * pow(max(dot(n, normalize(uLight + v)), 0.0), 120.0);
    vec3 color = mix(mix(uTint, uRim, fresnel), vec3(1.0), highlight);
    gl_FragColor = vec4(color, min(1.0, uGlassAlpha + uRimAlpha * fresnel + highlight));
  }
`;

/** A colour whose components are sent to a shader unchanged, as display values. */
const displayColor = (hex) => new THREE.Color().setStyle(hex, THREE.LinearSRGBColorSpace);

export class SphereScene {
  constructor(canvas, handlers = {}) {
    this.canvas = canvas;
    this.handlers = handlers;
    this.positions = new Float64Array(3 * N);
    this.groups = new Array(N).fill(-1);
    this.dragIndex = -1;
    this.dragFar = false;
    this.hoverIndex = -1;
    this.zoom = 1;
    this.theme = { ...SCENE_THEMES.light, background: '#f9f9f7', groups: ['#2a78d6', '#149a6b'] };

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xffffff, 1, 10);

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
    this.camera.up.set(0, 0, 1);
    const azimuth = (-62 * Math.PI) / 180, elevation = (20 * Math.PI) / 180;
    this.camera.position.set(
      Math.cos(elevation) * Math.cos(azimuth),
      Math.cos(elevation) * Math.sin(azimuth),
      Math.sin(elevation),
    ).multiplyScalar(6);
    this.scene.add(this.camera);

    this.hemisphere = new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 2.3);
    this.hemisphere.position.set(0, 0, 1);
    this.scene.add(this.hemisphere);
    this.keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
    this.keyLight.position.set(-2.2, 3.2, 4);
    this.camera.add(this.keyLight);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enablePan = false;
    this.controls.autoRotateSpeed = 0.55;
    this.controls.addEventListener('start', () => this.handlers.onInteract?.());

    this._buildSphere();
    this._buildPoints();
    this._buildEdges();
    this._buildFaces();
    this._buildArrows();
    this._bindPointer();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  // ---- construction -------------------------------------------------------

  _buildSphere() {
    this.sphereUniforms = {
      uTint: { value: new THREE.Color() },
      uRim: { value: new THREE.Color() },
      uGlassAlpha: { value: 0.05 },
      uRimAlpha: { value: 0.5 },
      uSpecular: { value: 0.5 },
      uLight: { value: new THREE.Vector3(-0.3, 0.42, 0.86).normalize() },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: this.sphereUniforms,
      vertexShader: sphereVertexShader,
      fragmentShader: sphereFragmentShader,
      transparent: true,
      depthWrite: false,
    });
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), material);
    this.sphere.renderOrder = 3;
    this.scene.add(this.sphere);
  }

  _buildPoints() {
    const geometry = new THREE.SphereGeometry(POINT_RADIUS, 40, 28);
    this.outlineMaterial = new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false });
    this.points = [];
    this.pointTargets = [];
    for (let i = 0; i < N; i++) {
      const material = new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0.05 });
      const mesh = new THREE.Mesh(geometry, material);
      const outline = new THREE.Mesh(geometry, this.outlineMaterial);
      outline.scale.setScalar(1.16);
      mesh.add(outline);
      mesh.userData.scale = 1;
      this.scene.add(mesh);
      this.points.push(mesh);
      this.pointTargets.push(new THREE.Color());
    }
  }

  _buildEdges() {
    const geometry = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.edges = new THREE.InstancedMesh(geometry, material, (N * (N - 1)) / 2);
    this.edges.count = 0;
    this.edges.frustumCulled = false;
    this.scene.add(this.edges);
  }

  _buildFaces() {
    const geometry = new THREE.BufferGeometry();
    this.facePositions = new Float32Array(12 * 3 * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(this.facePositions, 3));
    geometry.setDrawRange(0, 0);
    const material = new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
      flatShading: true,
      roughness: 0.9,
    });
    this.faces = new THREE.Mesh(geometry, material);
    this.faces.frustumCulled = false;
    this.faces.renderOrder = 1;
    this.scene.add(this.faces);
  }

  _buildArrows() {
    const shaft = new THREE.CylinderGeometry(0.0115, 0.0115, 1, 12).translate(0, 0.5, 0);
    const head = new THREE.ConeGeometry(0.036, 0.1, 20).translate(0, 0.05, 0);
    this.arrowMaterial = new THREE.MeshStandardMaterial({ roughness: 0.5 });
    this.arrows = [];
    for (let i = 0; i < N; i++) {
      const group = new THREE.Group();
      const shaftMesh = new THREE.Mesh(shaft, this.arrowMaterial);
      const headMesh = new THREE.Mesh(head, this.arrowMaterial);
      group.add(shaftMesh, headMesh);
      group.visible = false;
      group.userData = { shaftMesh, headMesh };
      this.scene.add(group);
      this.arrows.push(group);
    }
  }

  // ---- state setters ------------------------------------------------------

  /** Call after <html data-theme> has changed. */
  setTheme(name) {
    const css = getComputedStyle(document.documentElement);
    const read = (variable, fallback) => css.getPropertyValue(variable).trim() || fallback;
    const theme = {
      ...(SCENE_THEMES[name] || SCENE_THEMES.light),
      background: read('--page', '#f9f9f7'),
      groups: [read('--upper', '#2a78d6'), read('--lower', '#149a6b')],
    };
    this.theme = theme;
    this.renderer.setClearColor(new THREE.Color(theme.background), 1);
    this.scene.fog.color.set(theme.background);
    this.outlineMaterial.color.set(theme.background);
    this.faces.material.color.set(theme.face);
    this.faces.material.opacity = theme.faceOpacity;
    this.arrowMaterial.color.set(theme.arrow);
    const u = this.sphereUniforms;
    u.uTint.value = displayColor(theme.glassTint);
    u.uRim.value = displayColor(theme.glassRim);
    u.uGlassAlpha.value = theme.glassAlpha;
    u.uRimAlpha.value = theme.rimAlpha;
    u.uSpecular.value = theme.specular;
    this.setGroups(this.groups, true);
    if (this.lastEdges) this.setEdges(this.lastEdges);
  }

  /** groups[i] is 0 (upper square), 1 (lower square) or -1 (no structure). */
  setGroups(groups, immediate = false) {
    this.groups = groups.slice();
    for (let i = 0; i < N; i++) {
      const hex = groups[i] === 0 || groups[i] === 1 ? this.theme.groups[groups[i]] : this.theme.neutral;
      this.pointTargets[i].set(hex);
      if (immediate) this.points[i].material.color.set(hex);
    }
  }

  setPositions(Y) {
    this.positions.set(Y);
    for (let i = 0; i < N; i++) this.points[i].position.set(Y[3 * i], Y[3 * i + 1], Y[3 * i + 2]);
  }

  /** edges is a list of [i, j] pairs. An edge inside one square takes the colour of that square. */
  setEdges(edges) {
    this.lastEdges = edges;
    const Y = this.positions, radius = 0.0065;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), direction = new THREE.Vector3();
    const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
    const color = new THREE.Color();
    edges.forEach(([i, j], index) => {
      a.set(Y[3 * i], Y[3 * i + 1], Y[3 * i + 2]);
      b.set(Y[3 * j], Y[3 * j + 1], Y[3 * j + 2]);
      direction.subVectors(b, a);
      const length = direction.length();
      quaternion.setFromUnitVectors(Y_AXIS, direction.divideScalar(length || 1));
      scale.set(radius, length, radius);
      matrix.compose(a.add(b).multiplyScalar(0.5), quaternion, scale);
      this.edges.setMatrixAt(index, matrix);
      const gi = this.groups[i], gj = this.groups[j];
      color.set(gi === gj && gi >= 0 ? this.theme.groups[gi] : this.theme.edge);
      this.edges.setColorAt(index, color);
    });
    this.edges.count = edges.length;
    this.edges.instanceMatrix.needsUpdate = true;
    if (this.edges.instanceColor) this.edges.instanceColor.needsUpdate = true;
  }

  /** faces is a list of polygons given by vertex indices in cyclic order. */
  setFaces(faces) {
    const Y = this.positions, out = this.facePositions;
    let k = 0;
    for (const face of faces) {
      for (let t = 1; t + 1 < face.length && k + 9 <= out.length; t++) {
        for (const m of [face[0], face[t], face[t + 1]]) {
          out[k++] = Y[3 * m]; out[k++] = Y[3 * m + 1]; out[k++] = Y[3 * m + 2];
        }
      }
    }
    this.faces.geometry.attributes.position.needsUpdate = true;
    this.faces.geometry.setDrawRange(0, k / 3);
  }

  /** F holds the tangential forces. reference is the force that gives a medium arrow. */
  setForces(F, reference) {
    const direction = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const arrow = this.arrows[i];
      direction.set(F[3 * i], F[3 * i + 1], F[3 * i + 2]);
      const magnitude = direction.length();
      const length = 0.62 * (1 - Math.exp(-magnitude / reference));
      if (length < 0.03) { arrow.visible = false; continue; }
      arrow.visible = true;
      arrow.position.copy(this.points[i].position);
      arrow.quaternion.setFromUnitVectors(Y_AXIS, direction.divideScalar(magnitude));
      const total = POINT_RADIUS + length;
      arrow.userData.shaftMesh.scale.set(1, Math.max(total - 0.095, 0.001), 1);
      arrow.userData.headMesh.position.set(0, total - 0.1, 0);
    }
  }

  setAutoRotate(on) {
    this.controls.autoRotate = on;
  }

  // ---- pointer interaction ------------------------------------------------

  _bindPointer() {
    const canvas = this.canvas;
    const pointer = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    const projected = new THREE.Vector3();
    // A point of the unit sphere is on the near side when p . camera > 1.
    const isNear = (p) => p.dot(this.camera.position) > 0.9;

    // Points on the far side are seen through the glass and can be grabbed too,
    // but a point on the near side always wins.
    const pick = (event) => {
      const rect = canvas.getBoundingClientRect();
      const threshold = event.pointerType === 'touch' ? 34 : 22;
      let best = -1, bestScore = Infinity;
      for (let i = 0; i < N; i++) {
        const p = this.points[i].position;
        projected.copy(p).project(this.camera);
        const px = rect.left + (0.5 + 0.5 * projected.x) * rect.width;
        const py = rect.top + (0.5 - 0.5 * projected.y) * rect.height;
        const distance = Math.hypot(px - event.clientX, py - event.clientY);
        if (distance >= threshold) continue;
        const score = distance + (isNear(p) ? 0 : 1000);
        if (score < bestScore) { bestScore = score; best = i; }
      }
      return best;
    };

    const toSphere = (event, far) => {
      const rect = canvas.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, this.camera);
      const o = raycaster.ray.origin, d = raycaster.ray.direction;
      const b = o.dot(d), c = o.lengthSq() - 1;
      const disc = b * b - c;
      // Outside the silhouette, take the point of the ray closest to the centre.
      const t = disc >= 0 ? -b + (far ? 1 : -1) * Math.sqrt(disc) : -b;
      return new THREE.Vector3().copy(d).multiplyScalar(t).add(o).normalize();
    };

    const setHover = (index) => {
      if (index === this.hoverIndex) return;
      this.hoverIndex = index;
      canvas.style.cursor = index >= 0 ? 'grab' : '';
    };

    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const index = pick(event);
      if (index < 0) return;
      // Runs in the capture phase, before OrbitControls sees the event.
      this.controls.enabled = false;
      this.dragIndex = index;
      this.dragFar = !isNear(this.points[index].position);
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = 'grabbing';
      this.handlers.onInteract?.();
      this.handlers.onDragStart?.(index);
    }, { capture: true });

    canvas.addEventListener('pointermove', (event) => {
      if (this.dragIndex >= 0) {
        const p = toSphere(event, this.dragFar);
        this.handlers.onDrag?.(this.dragIndex, p.x, p.y, p.z);
      } else if (event.pointerType !== 'touch' && event.buttons === 0) {
        setHover(pick(event));
      }
    });

    const release = (event) => {
      if (this.dragIndex < 0) return;
      const index = this.dragIndex;
      this.dragIndex = -1;
      this.controls.enabled = true;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      canvas.style.cursor = this.hoverIndex >= 0 ? 'grab' : '';
      this.handlers.onDragEnd?.(index);
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('pointerleave', () => { if (this.dragIndex < 0) setHover(-1); });

    // Plain scrolling moves the page. Zooming needs a pinch or a modifier key.
    canvas.parentElement.addEventListener('wheel', (event) => {
      if (!event.ctrlKey && !event.metaKey) event.stopPropagation();
    }, { capture: true });
  }

  // ---- frame --------------------------------------------------------------

  resize() {
    const width = Math.max(this.canvas.clientWidth, 1), height = Math.max(this.canvas.clientHeight, 1);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const half = Math.tan((this.camera.fov * Math.PI) / 360);
    this.fitDistance = FIT_RADIUS / (half * Math.min(1, this.camera.aspect));
    // Keep the zoom chosen by the user and let the limits follow the size of the view.
    this.controls.minDistance = 0.42 * this.fitDistance;
    this.controls.maxDistance = 2.4 * this.fitDistance;
    this.camera.position.setLength(this.fitDistance * this.zoom);
  }

  render() {
    const distance = this.camera.position.length();
    // Direct rotation without easing: the point of the sphere under the pointer stays under it.
    // OrbitControls turns by 2 pi * rotateSpeed / height per pixel, and the front of the unit
    // sphere, at distance - 1 from the camera, moves by height / (2 tan(fov / 2) (distance - 1))
    // pixels per radian.
    this.controls.rotateSpeed = (Math.tan((this.camera.fov * Math.PI) / 360) * (distance - 1)) / Math.PI;
    this.controls.update();
    this.zoom = Math.max(0.42, Math.min(2.4, distance / this.fitDistance));
    this.scene.fog.near = distance - 0.4;
    this.scene.fog.far = distance + 3.4;
    for (let i = 0; i < N; i++) {
      const mesh = this.points[i];
      mesh.material.color.lerp(this.pointTargets[i], 0.14);
      const target = i === this.dragIndex ? 1.35 : i === this.hoverIndex ? 1.22 : 1;
      mesh.userData.scale += (target - mesh.userData.scale) * 0.25;
      mesh.scale.setScalar(mesh.userData.scale);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
