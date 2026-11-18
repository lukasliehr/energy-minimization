# Energy minimization

Interactive visualizations of energy-minimizing point configurations.

| Page | Problem | Paper |
| --- | --- | --- |
| [`8-S2`](8-S2/) | eight points on the sphere S² | L. Kryvonos, L. Liehr and M. A. Taylor, *Energy minimization for eight points on the sphere*, [arXiv:2609.22077](https://arxiv.org/abs/2609.22077) |

## 8-S2

The page shows the square antiprism `X(a_s)` that minimizes the Riesz `s`-energy of eight points on
the unit sphere. Visitors can rotate the sphere, drag any of the eight points and watch the energy rise
above the minimum, let the configuration relax back to an antiprism, start from the cube or from random
points, and move the exponent `s` from the logarithmic energy through Coulomb to larger values.

## Run locally

Requires [Node.js](https://nodejs.org) 20.19 or newer.

```bash
npm install
npm run dev
```

Then open the address that is printed, usually <http://localhost:5173>.

## Check the numerics

```bash
npm test
```

This compares `a_0`, `a_1` and the two minimal energies with the values stated in the paper, checks that the
antiprism and the cube are critical points, and runs the relaxation from random starts.

## Build and publish

```bash
npm run build
```

writes a static site to `dist/`. It uses relative paths, so the folder can be served from any address.

Every push to `main` builds and publishes the site with GitHub Pages through `.github/workflows/deploy.yml`.

## Structure

Each visualization is a page of its own in a folder named after its problem. To add one, create the folder
with an `index.html` and list it under `input` in `vite.config.js`.

| File | Content |
| --- | --- |
| `index.html` | forwards to the only visualization so far |
| `8-S2/index.html` | page and controls |
| `8-S2/src/math.js` | energy, forces, stationarity equation, relaxation, convex hull |
| `8-S2/src/scene.js` | three.js scene: sphere, points, polyhedron, force arrows |
| `8-S2/src/trace.js` | line of the energy above the minimum |
| `8-S2/src/main.js` | application state and wiring of the controls |
| `8-S2/src/style.css` | layout, the light and dark themes, and the colours of the two squares (`--upper`, `--lower`) |
| `8-S2/test/math.test.js` | numerical checks against the paper |

The energies shown on the pages are computed in double precision in the browser. They are illustrations and
not part of the proofs.
