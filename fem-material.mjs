// Voigt ordering xx, yy, zz, xy, yz, zx. Strains use engineering shear.
export const MATERIAL = Object.freeze({E: 70e9, nu: .3, yield: 140e6, H: 1e9});
export const zeroState = () => ({plastic: Array(6).fill(0), peeq: 0});
export function elasticMatrix(m = MATERIAL) {
  const G = m.E / (2 * (1 + m.nu)), lambda = m.E * m.nu / ((1 + m.nu) * (1 - 2 * m.nu));
  return Array.from({length: 6}, (_, i) => Array.from({length: 6}, (_, j) =>
    i < 3 && j < 3 ? lambda + (i === j ? 2 * G : 0) : i === j ? G : 0));
}
export const matvec = (A, x) => A.map(row => row.reduce((s, v, j) => s + v * x[j], 0));
export function vonMises(s) {
  return Math.sqrt(Math.max(0, .5 * ((s[0] - s[1]) ** 2 + (s[1] - s[2]) ** 2 + (s[2] - s[0]) ** 2)
    + 3 * (s[3] ** 2 + s[4] ** 2 + s[5] ** 2)));
}
export function principal(s) {
  const A = [[s[0], s[3], s[5]], [s[3], s[1], s[4]], [s[5], s[4], s[2]]];
  for (let k = 0; k < 24; k++) {
    let p = 0, q = 1;
    for (const [i,j] of [[0,2],[1,2]]) if (Math.abs(A[i][j]) > Math.abs(A[p][q])) { p = i; q = j; }
    if (Math.abs(A[p][q]) < 1e-10) break;
    const phi = .5 * Math.atan2(2 * A[p][q], A[q][q] - A[p][p]);
    const c = Math.cos(phi), t = Math.sin(phi);
    const app = A[p][p], aqq = A[q][q], apq = A[p][q];
    A[p][p] = c*c*app - 2*c*t*apq + t*t*aqq;
    A[q][q] = t*t*app + 2*c*t*apq + c*c*aqq;
    A[p][q] = A[q][p] = 0;
    for (let i = 0; i < 3; i++) if (i !== p && i !== q) {
      const a = A[i][p], b = A[i][q];
      A[i][p] = A[p][i] = c*a-t*b;
      A[i][q] = A[q][i] = t*a+c*b;
    }
  }
  return [A[0][0], A[1][1], A[2][2]].sort((a,b)=>b-a);
}

export function integrate(strain, state = zeroState(), plastic = false, m = MATERIAL) {
  const D = elasticMatrix(m), trial = matvec(D, strain.map((v,i)=>v-state.plastic[i]));
  const q = vonMises(trial), yieldValue = m.yield + m.H * state.peeq, f = q - yieldValue;
  if (!plastic || f <= Math.max(1, m.yield * 1e-10)) {
    return {stress: trial, state: {plastic: state.plastic.slice(), peeq: state.peeq},
      trial, trialMises: q, f, deltaGamma: 0, yielded: false};
  }
  const G = m.E / (2 * (1 + m.nu)), dg = f / (3 * G + m.H);
  const pressure = (trial[0] + trial[1] + trial[2]) / 3;
  const dev = trial.map((v,i)=>v-(i<3?pressure:0));
  const stress = dev.map((v,i)=>(1-3*G*dg/q)*v+(i<3?pressure:0));
  const ep = state.plastic.map((v,i)=>v + dg * (i<3?1.5:3) * dev[i]/q);
  return {stress, state: {plastic: ep, peeq: state.peeq + dg}, trial,
    trialMises: q, f, deltaGamma: dg, yielded: true};
}

export function constitutive(strain, state, plastic, m = MATERIAL) {
  const result = integrate(strain, state, plastic, m);
  if (!result.yielded) return {...result, tangent: elasticMatrix(m)};
  // Consistent derivative of the discrete radial return, in engineering Voigt form.
  const tangent = Array.from({length:6},()=>Array(6).fill(0));
  for (let j=0;j<6;j++) {
    const h = 1e-7, plus = strain.slice(), minus = strain.slice();
    plus[j]+=h; minus[j]-=h;
    const sp=integrate(plus,state,true,m).stress, sm=integrate(minus,state,true,m).stress;
    for(let i=0;i<6;i++) tangent[i][j]=(sp[i]-sm[i])/(2*h);
  }
  return {...result, tangent};
}
