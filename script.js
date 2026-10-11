import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const container = document.getElementById("cube-container");
const loading = document.getElementById("loading");

const moveCountEl = document.getElementById("move-count");
const timerEl = document.getElementById("timer");
const progressEl = document.getElementById("progress");
const statusEl = document.getElementById("cube-status");
const historyEl = document.getElementById("history");

const scrambleButton = document.getElementById("scramble");
const solveButton = document.getElementById("solve");
const resetButton = document.getElementById("reset");
const inverseButton = document.getElementById("inverse-toggle");
const doubleButton = document.getElementById("double-toggle");

let scene, camera, renderer, orbit;
let cubies = [];
let moveHistory = [];
let solutionStack = [];
let moveCount = 0;
let busy = false;
let timerStarted = false;
let startTime = 0;
let timerInterval = null;
let inverseMode = false;
let doubleMode = false;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const cubeGroup = new THREE.Group();

const SPACING = 1.04;
const CUBIE_SIZE = 0.98;
const TURN_DURATION = 220;

const FACE_INFO = {
  U: { axis: "y", layer: 1, direction: -1, normal: new THREE.Vector3(0, 1, 0) },
  D: { axis: "y", layer: -1, direction: 1, normal: new THREE.Vector3(0, -1, 0) },
  L: { axis: "x", layer: -1, direction: 1, normal: new THREE.Vector3(-1, 0, 0) },
  R: { axis: "x", layer: 1, direction: -1, normal: new THREE.Vector3(1, 0, 0) },
  F: { axis: "z", layer: 1, direction: -1, normal: new THREE.Vector3(0, 0, 1) },
  B: { axis: "z", layer: -1, direction: 1, normal: new THREE.Vector3(0, 0, -1) }
};

// Standard Rubik's Cube face colors.
const COLORS = {
  U: 0xffffff,
  D: 0xffd500,
  L: 0xff7b19,
  R: 0xd92639,
  F: 0x22d66b,
  B: 0x2584ff,
  inside: 0x171b24
};

const AXES = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1)
};

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101726);

  camera = new THREE.PerspectiveCamera(
    40,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );

  camera.position.set(5.5, 5, 7);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;

  container.appendChild(renderer.domElement);

  orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.08;
  orbit.rotateSpeed = 0.75;
  orbit.enablePan = false;
  orbit.minDistance = 5;
  orbit.maxDistance = 13;
  orbit.target.set(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x526078, 2));

  const light1 = new THREE.DirectionalLight(0xffffff, 2.5);
  light1.position.set(5, 8, 7);
  scene.add(light1);

  const light2 = new THREE.DirectionalLight(0x8baaff, 1.2);
  light2.position.set(-5, 2, -5);
  scene.add(light2);

  scene.add(cubeGroup);

  createCube();
  setupControls();
  setupTouchTurns();

  window.addEventListener("resize", resizeRenderer);

  loading.style.display = "none";

  animate();
  updateInterface();
}

function createCube() {
  cubies = [];
  cubeGroup.clear();

  const geometry = new THREE.BoxGeometry(
    CUBIE_SIZE,
    CUBIE_SIZE,
    CUBIE_SIZE
  );

  const materialOrder = [
    new THREE.MeshStandardMaterial({ color: COLORS.R, roughness: 0.32 }),
    new THREE.MeshStandardMaterial({ color: COLORS.L, roughness: 0.32 }),
    new THREE.MeshStandardMaterial({ color: COLORS.U, roughness: 0.32 }),
    new THREE.MeshStandardMaterial({ color: COLORS.D, roughness: 0.32 }),
    new THREE.MeshStandardMaterial({ color: COLORS.F, roughness: 0.32 }),
    new THREE.MeshStandardMaterial({ color: COLORS.B, roughness: 0.32 })
  ];

  const blackMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.inside,
    roughness: 0.42
  });

  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        const materials = [
          x === 1 ? materialOrder[0] : blackMaterial,
          x === -1 ? materialOrder[1] : blackMaterial,
          y === 1 ? materialOrder[2] : blackMaterial,
          y === -1 ? materialOrder[3] : blackMaterial,
          z === 1 ? materialOrder[4] : blackMaterial,
          z === -1 ? materialOrder[5] : blackMaterial
        ];

        const mesh = new THREE.Mesh(geometry, materials);

        mesh.position.set(
          x * SPACING,
          y * SPACING,
          z * SPACING
        );

        mesh.userData.home = { x, y, z };
        mesh.userData.cubie = true;

        // Thin dark lines separate the stickers.
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(geometry),
          new THREE.LineBasicMaterial({
            color: 0x05070b,
            transparent: true,
            opacity: 0.95
          })
        );

        mesh.add(edges);
        cubeGroup.add(mesh);
        cubies.push(mesh);
      }
    }
  }
}

function resizeRenderer() {
  if (!camera || !renderer) return;

  const width = container.clientWidth;
  const height = container.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function animate() {
  requestAnimationFrame(animate);

  if (orbit) orbit.update();

  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

function startTimer() {
  if (timerStarted) return;

  timerStarted = true;
  startTime = Date.now();

  timerInterval = setInterval(() => {
    const seconds = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    timerEl.textContent =
      String(minutes).padStart(2, "0") + ":" +
      String(remainingSeconds).padStart(2, "0");
  }, 250);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerStarted = false;
}

function resetTimer() {
  stopTimer();
  timerEl.textContent = "00:00";
}

function getNotation(face, inverse, double) {
  if (double) return face + "2";
  return face + (inverse ? "'" : "");
}

function recordMove(face, inverse, double) {
  const notation = getNotation(face, inverse, double);

  moveCount++;
  moveCountEl.textContent = String(moveCount);

  moveHistory.push(notation);
  solutionStack.push({ face, inverse, double });

  renderHistory();
  updateInterface();
}

function renderHistory() {
  historyEl.replaceChildren();

  if (moveHistory.length === 0) {
    historyEl.textContent = "No moves yet";
    return;
  }

  for (const notation of moveHistory) {
    const item = document.createElement("span");
    item.className = "history-move";
    item.textContent = notation;
    historyEl.appendChild(item);
  }
}

function getLayerCubies(face) {
  const info = FACE_INFO[face];

  return cubies.filter(cubie => {
    const coordinate = cubie.position[info.axis];
    return Math.round(coordinate / SPACING) === info.layer;
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function animateTurn(face, inverse = false, double = false, options = {}) {
  if (busy) return false;

  busy = true;
  setButtonsDisabled(true);

  if (options.record !== false) {
    startTimer();
  }

  const info = FACE_INFO[face];
  if (!info) {
    busy = false;
    setButtonsDisabled(false);
    return false;
  }

  const selected = getLayerCubies(face);

  const pivot = new THREE.Group();
  scene.add(pivot);

  // Move selected cubies into a temporary pivot without changing
  // their world position or orientation.
  for (const cubie of selected) {
    pivot.attach(cubie);
  }

  const signedAngle = info.direction * (inverse ? -1 : 1) * Math.PI / 2;
  const totalAngle = signedAngle * (double ? 2 : 1);
  const duration = double ? TURN_DURATION * 1.6 : TURN_DURATION;

  const start = performance.now();

  await new Promise(resolve => {
    function step(now) {
      const raw = Math.min((now - start) / duration, 1);

      // Smooth ease-in/ease-out animation.
      const eased = raw * raw * (3 - 2 * raw);
      pivot.rotation[info.axis] = totalAngle * eased;

      if (raw < 1) {
        requestAnimationFrame(step);
      } else {
        resolve();
      }
    }

    requestAnimationFrame(step);
  });

  // Bake the completed turn into each cubie's world transform.
  pivot.updateMatrixWorld(true);

  for (const cubie of selected) {
    cubeGroup.attach(cubie);

    // Snap tiny floating-point errors to exact cube positions.
    cubie.position.set(
      Math.round(cubie.position.x / SPACING) * SPACING,
      Math.round(cubie.position.y / SPACING) * SPACING,
      Math.round(cubie.position.z / SPACING) * SPACING
    );

    cubie.quaternion.normalize();
  }

  scene.remove(pivot);

  if (options.record !== false) {
    recordMove(face, inverse, double);
  }

  busy = false;
  setButtonsDisabled(false);
  updateInterface();

  return true;
}

function setButtonsDisabled(disabled) {
  document.querySelectorAll("button").forEach(button => {
    // Leave the modifier buttons usable only when no move is running.
    button.disabled = disabled;
  });
}

function updateInterface() {
  const solved = isSolved();

  statusEl.textContent = solved ? "Solved" : "In progress";
  statusEl.style.color = solved ? "#53f6e5" : "#c1a5ff";
  statusEl.style.borderColor = solved ? "#53f6e544" : "#9c78ff55";

  const total = 54;
  const correct = countCorrectStickers();
  const percentage = Math.round((correct / total) * 100);

  progressEl.textContent = percentage + "%";
}

function isSolved() {
  const faceNormals = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1)
  ];

  for (const normal of faceNormals) {
    const faceCubies = cubies.filter(cubie => {
      const worldPosition = cubie.position;
      return Math.round(
        worldPosition.dot(normal) / SPACING
      ) === 1;
    });

    let faceColor = null;

    for (const cubie of faceCubies) {
      const color = getStickerColorOnWorldFace(cubie, normal);

      if (color === null) return false;

      if (faceColor === null) faceColor = color;
      if (color !== faceColor) return false;
    }
  }

  return true;
}

function getStickerColorOnWorldFace(cubie, worldNormal) {
  const localNormal = worldNormal.clone()
    .applyQuaternion(cubie.quaternion.clone().invert());

  const abs = [
    Math.abs(localNormal.x),
    Math.abs(localNormal.y),
    Math.abs(localNormal.z)
  ];

  const axis = abs.indexOf(Math.max(...abs));
  let materialIndex;

  if (axis === 0) {
    materialIndex = localNormal.x >= 0 ? 0 : 1;
  } else if (axis === 1) {
    materialIndex = localNormal.y >= 0 ? 2 : 3;
  } else {
    materialIndex = localNormal.z >= 0 ? 4 : 5;
  }

  const material = cubie.material[materialIndex];

  if (!material) return null;

  // Only count a sticker if that cubie's original outer face
  // actually had a sticker at this local position.
  const localColor = material.color.getHex();
  return localColor === COLORS.inside ? null : localColor;
}

function countCorrectStickers() {
  // A solved face has nine stickers of one color.
  // This gives a simple visual progress estimate.
  const faceNormals = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1)
  ];

  let totalCorrect = 0;

  for (const normal of faceNormals) {
    const faceCubies = cubies.filter(cubie =>
      Math.round(cubie.position.dot(normal) / SPACING) === 1
    );

    const stickers = faceCubies
      .map(cubie => getStickerColorOnWorldFace(cubie, normal))
      .filter(color => color !== null);

    if (stickers.length === 0) continue;

    const counts = new Map();

    for (const color of stickers) {
      counts.set(color, (counts.get(color) || 0) + 1);
    }

    totalCorrect += Math.max(...counts.values());
  }

  return Math.min(54, totalCorrect);
}

async function performMove(face, inverse = false, double = false) {
  if (busy) return;

  await animateTurn(face, inverse, double);
}

async function scrambleCube() {
  if (busy) return;

  const faces = Object.keys(FACE_INFO);
  let previousFace = "";

  for (let i = 0; i < 20; i++) {
    let face;

    do {
      face = faces[Math.floor(Math.random() * faces.length)];
    } while (face === previousFace);

    previousFace = face;

    const inverse = Math.random() < 0.5;
    const double = Math.random() < 0.2;

    await animateTurn(face, inverse, double);
    await sleep(45);
  }
}

async function solveCube() {
  if (busy) return;

  if (solutionStack.length === 0) {
    // Nothing to undo.
    updateInterface();
    return;
  }

  const movesToUndo = [...solutionStack].reverse();

  // Do not record solver turns: they undo the existing history.
  solutionStack = [];

  for (const move of movesToUndo) {
    await animateTurn(
      move.face,
      move.double ? false : !move.inverse,
      move.double,
      { record: false }
    );

    await sleep(35);
  }

  moveHistory = [];
  moveCount = 0;
  moveCountEl.textContent = "0";
  renderHistory();
  resetTimer();
  updateInterface();
}

function resetCube() {
  if (busy) return;

  stopTimer();
  createCube();

  moveHistory = [];
  solutionStack = [];
  moveCount = 0;

  moveCountEl.textContent = "0";
  timerEl.textContent = "00:00";
  inverseMode = false;
  doubleMode = false;

  inverseButton.classList.remove("active");
  doubleButton.classList.remove("active");
  inverseButton.setAttribute("aria-pressed", "false");
  doubleButton.setAttribute("aria-pressed", "false");

  renderHistory();
  updateInterface();
}

function setupControls() {
  document.querySelectorAll("[data-move]").forEach(button => {
    button.addEventListener("click", () => {
      const face = button.dataset.move;

      // The selected modifiers apply to the next button move.
      const inverse = inverseMode;
      const double = doubleMode;

      inverseMode = false;
      doubleMode = false;

      inverseButton.classList.remove("active");
      doubleButton.classList.remove("active");
      inverseButton.setAttribute("aria-pressed", "false");
      doubleButton.setAttribute("aria-pressed", "false");

      performMove(face, inverse, double);
    });
  });

  inverseButton.addEventListener("click", () => {
    inverseMode = !inverseMode;
    inverseButton.classList.toggle("active", inverseMode);
    inverseButton.setAttribute("aria-pressed", String(inverseMode));
  });

  doubleButton.addEventListener("click", () => {
    doubleMode = !doubleMode;
    doubleButton.classList.toggle("active", doubleMode);
    doubleButton.setAttribute("aria-pressed", String(doubleMode));
  });

  scrambleButton.addEventListener("click", scrambleCube);
  solveButton.addEventListener("click", solveCube);
  resetButton.addEventListener("click", resetCube);

  document.getElementById("clear-history").addEventListener("click", () => {
    // Clearing the display does not erase the moves needed by Solve.
    moveHistory = [];
    renderHistory();
  });
}

// Swipe on a visible sticker to turn that face.
// Dragging outside the cube continues to rotate the 3D camera.
function setupTouchTurns() {
  let gesture = null;

  const canvas = renderer.domElement;

  canvas.addEventListener("pointerdown", event => {
    if (busy) return;

    const rect = canvas.getBoundingClientRect();

    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);

    const hits = raycaster.intersectObjects(cubies, false);
    const hit = hits[0];

    if (!hit || !hit.face) {
      gesture = null;
      return;
    }

    const localNormal = hit.face.normal.clone();
    const worldNormal = localNormal
      .applyQuaternion(hit.object.quaternion)
      .round();

    const face = getFaceFromNormal(worldNormal);

    if (!face) {
      gesture = null;
      return;
    }

    gesture = {
      x: event.clientX,
      y: event.clientY,
      face,
      pointerId: event.pointerId
    };

    // Stop OrbitControls from interpreting a face swipe as a camera drag.
    orbit.enabled = false;

    try {
      canvas.setPointerCapture(event.pointerId);
    } catch (_) {
      // Pointer capture may be unavailable on some browsers.
    }
  });

  canvas.addEventListener("pointerup", event => {
    if (!gesture || gesture.pointerId !== event.pointerId) {
      orbit.enabled = true;
      return;
    }

    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    const face = gesture.face;

    gesture = null;
    orbit.enabled = true;

    if (Math.hypot(dx, dy) < 25) return;

    // Convert the swipe to a quarter-turn.
    // Horizontal and vertical swipes are both supported.
    const dominant = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
    const inverse = dominant < 0;

    performMove(face, inverse, false);
  });

  canvas.addEventListener("pointercancel", () => {
    gesture = null;
    orbit.enabled = true;
  });
}

function getFaceFromNormal(normal) {
  const key = [
    Math.round(normal.x),
    Math.round(normal.y),
    Math.round(normal.z)
  ].join(",");

  const mapping = {
    "0,1,0": "U",
    "0,-1,0": "D",
    "-1,0,0": "L",
    "1,0,0": "R",
    "0,0,1": "F",
    "0,0,-1": "B"
  };

  return mapping[key] || null;
}

init();