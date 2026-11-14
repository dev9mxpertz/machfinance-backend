// Black-Scholes pricing used by the simulated option chain and margin engine.

function normPdf(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// Abramowitz & Stegun 26.2.17 (max abs error ~7.5e-8)
function normCdf(x) {
  const k = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly =
    k * (0.31938153 + k * (-0.356563782 + k * (1.781477937 + k * (-1.821255978 + k * 1.330274429))));
  const value = 1 - normPdf(x) * poly;
  return x >= 0 ? value : 1 - value;
}

function intrinsic(spot, strike, type) {
  return type === 'CE' ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
}

function price({ spot, strike, years, rate, iv, type }) {
  if (years <= 0 || iv <= 0) return intrinsic(spot, strike, type);
  const sqrtT = Math.sqrt(years);
  const d1 = (Math.log(spot / strike) + (rate + (iv * iv) / 2) * years) / (iv * sqrtT);
  const d2 = d1 - iv * sqrtT;
  const discount = Math.exp(-rate * years);
  if (type === 'CE') return spot * normCdf(d1) - strike * discount * normCdf(d2);
  return strike * discount * normCdf(-d2) - spot * normCdf(-d1);
}

module.exports = { normCdf, normPdf, price, intrinsic };
