export const seeded01 = (seed) => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// Fisher–Yates: every ordering is equally likely. `rng` returns [0,1); it is
// injectable only so tests can run the real code on a seeded generator.
export const shuffleArr = (arr, rng = Math.random) => {
  const r = [...arr];
  for(let i=r.length-1;i>0;i--){
    const j = Math.floor(rng()*(i+1));
    [r[i],r[j]] = [r[j],r[i]];
  }
  return r;
};
