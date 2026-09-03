// Interactive dartboard picker — mobile first.
// Press and drag on the board; a magnifier + live score follow your finger,
// and the dart is placed where you lift off. Same gesture works with a mouse.

const NUMBERS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const SIZE = 500;
const C = SIZE / 2;
const R = 200; // outer edge of the double ring

// ring radii, scaled from a regulation board (170 mm outer double)
const RING = {
  innerBull: (R * 6.35) / 170,
  outerBull: (R * 15.9) / 170,
  tripleIn: (R * 99) / 170,
  tripleOut: (R * 107) / 170,
  doubleIn: (R * 162) / 170,
  doubleOut: R,
};
const NUM_RING = R + 24;

const LOUPE_R = 92; // magnifier radius, in board units
const LOUPE_ZOOM = 2.8;
const OFF_BOARD = R + 34; // lifting off past this cancels the throw

const rad = (d) => (d * Math.PI) / 180;
const polar = (radius, angle) => [C + radius * Math.cos(rad(angle)), C + radius * Math.sin(rad(angle))];

function sector(rIn, rOut, a0, a1) {
  const [x1, y1] = polar(rOut, a0);
  const [x2, y2] = polar(rOut, a1);
  const [x3, y3] = polar(rIn, a1);
  const [x4, y4] = polar(rIn, a0);
  return `M${x1} ${y1} A${rOut} ${rOut} 0 0 1 ${x2} ${y2} L${x3} ${y3} A${rIn} ${rIn} 0 0 0 ${x4} ${y4} Z`;
}

// point (board coords) -> { points, label }
function scoreAt(x, y) {
  const dx = x - C;
  const dy = y - C;
  const dist = Math.hypot(dx, dy);
  if (dist > RING.doubleOut) return { points: 0, label: "Miss" };
  if (dist <= RING.innerBull) return { points: 50, label: "Bull" };
  if (dist <= RING.outerBull) return { points: 25, label: "25" };

  const a = (Math.atan2(dy, dx) * 180) / Math.PI; // -90 = straight up
  const idx = ((Math.round((a + 90) / 18) % 20) + 20) % 20;
  const base = NUMBERS[idx];

  if (dist > RING.tripleIn && dist <= RING.tripleOut) return { points: base * 3, label: `T${base}` };
  if (dist > RING.doubleIn && dist <= RING.doubleOut) return { points: base * 2, label: `D${base}` };
  return { points: base, label: String(base) };
}

// The board face, as a reusable <g> (also referenced by the magnifier).
function boardFace() {
  let wedges = "";
  let labels = "";
  for (let i = 0; i < 20; i++) {
    const mid = -90 + i * 18;
    const a0 = mid - 9;
    const a1 = mid + 9;
    const dark = i % 2 === 0;
    const single = dark ? "#191919" : "#e7d3a6";
    const ring = dark ? "#c9302c" : "#2f9e44";
    wedges += `<path d="${sector(RING.outerBull, RING.tripleIn, a0, a1)}" fill="${single}"/>`;
    wedges += `<path d="${sector(RING.tripleIn, RING.tripleOut, a0, a1)}" fill="${ring}"/>`;
    wedges += `<path d="${sector(RING.tripleOut, RING.doubleIn, a0, a1)}" fill="${single}"/>`;
    wedges += `<path d="${sector(RING.doubleIn, RING.doubleOut, a0, a1)}" fill="${ring}"/>`;
    const [lx, ly] = polar(NUM_RING, mid);
    labels += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="central" fill="#e8eef4" font-size="21" font-family="system-ui, sans-serif">${NUMBERS[i]}</text>`;
  }
  return `<g id="dartFace">
      <circle cx="${C}" cy="${C}" r="${R + 42}" fill="#0c0f13"/>
      <circle cx="${C}" cy="${C}" r="${R + 2}" fill="#0c0c0c"/>
      <g stroke="#0c0c0c" stroke-width="1">${wedges}</g>
      <circle cx="${C}" cy="${C}" r="${RING.outerBull}" fill="#2f9e44" stroke="#0c0c0c"/>
      <circle cx="${C}" cy="${C}" r="${RING.innerBull}" fill="#c9302c" stroke="#0c0c0c"/>
      ${labels}
    </g>`;
}

function boardMarkup() {
  return `
    <svg id="dartSvg" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="Dartboard — press and drag to aim">
      <defs>
        <clipPath id="dartLoupeClip" clipPathUnits="userSpaceOnUse">
          <circle cx="0" cy="0" r="${LOUPE_R}"/>
        </clipPath>
      </defs>
      ${boardFace()}
      <g id="dartMarks"></g>
      <g id="dartPointCross" style="display:none">
        <line x1="-20" y1="0" x2="20" y2="0" stroke="#000" stroke-width="6"/>
        <line x1="0" y1="-20" x2="0" y2="20" stroke="#000" stroke-width="6"/>
        <line x1="-20" y1="0" x2="20" y2="0" stroke="#fff" stroke-width="2.5"/>
        <line x1="0" y1="-20" x2="0" y2="20" stroke="#fff" stroke-width="2.5"/>
      </g>
      <g id="dartLoupe" style="display:none">
        <circle cx="0" cy="0" r="${LOUPE_R}" fill="#0c0f13"/>
        <g clip-path="url(#dartLoupeClip)">
          <g id="dartLoupeZoom">
            <use href="#dartFace"/>
          </g>
        </g>
        <circle cx="0" cy="0" r="${LOUPE_R}" fill="none" stroke="#e8eef4" stroke-width="3"/>
        <line x1="-16" y1="0" x2="16" y2="0" stroke="#000" stroke-width="5"/>
        <line x1="0" y1="-16" x2="0" y2="16" stroke="#000" stroke-width="5"/>
        <line x1="-16" y1="0" x2="16" y2="0" stroke="#fff" stroke-width="2"/>
        <line x1="0" y1="-16" x2="0" y2="16" stroke="#fff" stroke-width="2"/>
      </g>
    </svg>`;
}

/**
 * Wire the dartboard modal.
 * @param {{ openButton: HTMLElement, onApply: (points:number[]) => void }} opts
 */
export function initDartboard({ openButton, onApply }) {
  const modal = document.getElementById("dartModal");
  const wrap = document.getElementById("dartBoardWrap");
  const list = document.getElementById("dartMarksList");
  const undoBtn = document.getElementById("dartUndo");
  const clearBtn = document.getElementById("dartClear");
  const applyBtn = document.getElementById("dartApply");

  wrap.innerHTML = boardMarkup();
  const aimLabel = document.createElement("div");
  aimLabel.className = "dart-aim-label";
  aimLabel.hidden = true;
  wrap.appendChild(aimLabel);

  const svg = document.getElementById("dartSvg");
  const marksG = document.getElementById("dartMarks");
  const loupe = document.getElementById("dartLoupe");
  const loupeZoom = document.getElementById("dartLoupeZoom");
  const pointCross = document.getElementById("dartPointCross");

  let marks = [];
  let aiming = false;

  function evtPoint(e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  function showAim(p) {
    const s = scoreAt(p.x, p.y);

    let ly = p.y < SIZE * 0.42 ? p.y + 150 : p.y - 150;
    let lx = Math.max(LOUPE_R + 4, Math.min(SIZE - LOUPE_R - 4, p.x));
    ly = Math.max(LOUPE_R + 4, Math.min(SIZE - LOUPE_R - 4, ly));
    loupe.setAttribute("transform", `translate(${lx} ${ly})`);
    loupeZoom.setAttribute("transform", `scale(${LOUPE_ZOOM}) translate(${-p.x} ${-p.y})`);
    loupe.style.display = "";

    pointCross.setAttribute("transform", `translate(${p.x} ${p.y})`);
    pointCross.style.display = "";

    aimLabel.hidden = false;
    aimLabel.textContent =
      s.points && s.label !== String(s.points) ? `${s.label}  ·  ${s.points}` : s.label;
    aimLabel.classList.toggle("miss", s.points === 0);
  }

  function hideAim() {
    loupe.style.display = "none";
    pointCross.style.display = "none";
    aimLabel.hidden = true;
  }

  function render() {
    marksG.innerHTML = marks
      .map(
        (m, i) =>
          `<circle cx="${m.x}" cy="${m.y}" r="8" fill="#fff" stroke="#111" stroke-width="2"/>` +
          `<circle cx="${m.x}" cy="${m.y}" r="2.5" fill="#111"/>` +
          `<text x="${m.x + 11}" y="${m.y - 11}" fill="#fff" stroke="#000" stroke-width="4" paint-order="stroke" font-size="20" font-family="system-ui, sans-serif">${i + 1}</text>`
      )
      .join("");

    const total = marks.reduce((s, m) => s + m.points, 0);
    list.innerHTML =
      [0, 1, 2]
        .map((i) => {
          const m = marks[i];
          return `<li><span>Dart ${i + 1}</span><strong>${m ? `${m.label} = ${m.points}` : "—"}</strong></li>`;
        })
        .join("") + `<li class="total"><span>Total</span><strong>${total}</strong></li>`;

    undoBtn.disabled = marks.length === 0;
    clearBtn.disabled = marks.length === 0;
    applyBtn.textContent = marks.length ? `Use these scores (${total})` : "Use these scores";
  }

  svg.addEventListener("pointerdown", (e) => {
    if (marks.length >= 3) return;
    e.preventDefault();
    aiming = true;
    try {
      svg.setPointerCapture(e.pointerId);
    } catch {}
    showAim(evtPoint(e));
  });

  svg.addEventListener("pointermove", (e) => {
    if (aiming) showAim(evtPoint(e));
  });

  function finishAim(e, commit) {
    if (!aiming) return;
    aiming = false;
    const p = evtPoint(e);
    hideAim();
    if (!commit) return;
    if (Math.hypot(p.x - C, p.y - C) > OFF_BOARD) return; // dragged away to cancel
    marks.push({ x: p.x, y: p.y, ...scoreAt(p.x, p.y) });
    render();
  }

  svg.addEventListener("pointerup", (e) => finishAim(e, true));
  svg.addEventListener("pointercancel", (e) => finishAim(e, false));

  undoBtn.addEventListener("click", () => {
    marks.pop();
    render();
  });
  clearBtn.addEventListener("click", () => {
    marks = [];
    render();
  });

  function open() {
    marks = [];
    aiming = false;
    hideAim();
    render();
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function close() {
    modal.hidden = true;
    document.body.style.overflow = "";
  }

  openButton.addEventListener("click", open);
  modal.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", close));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener("keydown", (e) => {
    if (!modal.hidden && e.key === "Escape") close();
  });

  applyBtn.addEventListener("click", () => {
    onApply([0, 1, 2].map((i) => (marks[i] ? marks[i].points : 0)));
    close();
  });
}
