export type OptType = 'C' | 'P'

export interface BsResult {
  price: number
  delta: number
  gamma: number
  /** Per calendar day. */
  theta: number
  /** Per 1 volatility point. */
  vega: number
}

export function npdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI)
}

/** Normal CDF (Zelen & Severo / A&S 26.2.17), error < 7.5e-8. */
export function ncdf(x: number): number {
  const b1 = 0.31938153, b2 = -0.356563782, b3 = 1.781477937, b4 = -1.821255978, b5 = 1.330274429
  const p = 0.2316419
  const ax = Math.abs(x)
  const t = 1 / (1 + p * ax)
  const poly = ((((b5 * t + b4) * t + b3) * t + b2) * t + b1) * t
  const c = 1 - npdf(ax) * poly
  return x >= 0 ? c : 1 - c
}

export function intrinsic(type: OptType, S: number, K: number): number {
  return type === 'C' ? Math.max(0, S - K) : Math.max(0, K - S)
}

/**
 * Black-Scholes-Merton with continuous dividend yield.
 * T in years. iv as a decimal (0.2 = 20%).
 */
export function bs(type: OptType, S: number, K: number, T: number, iv: number, r: number, q = 0): BsResult {
  if (T <= 0 || iv <= 0) {
    const itm = type === 'C' ? S > K : S < K
    return { price: intrinsic(type, S, K), delta: itm ? (type === 'C' ? 1 : -1) : 0, gamma: 0, theta: 0, vega: 0 }
  }
  const sqrtT = Math.sqrt(T)
  const d1 = (Math.log(S / K) + (r - q + 0.5 * iv * iv) * T) / (iv * sqrtT)
  const d2 = d1 - iv * sqrtT
  const dfR = Math.exp(-r * T)
  const dfQ = Math.exp(-q * T)
  const pdf = npdf(d1)
  let price: number, delta: number, thetaYear: number
  if (type === 'C') {
    price = S * dfQ * ncdf(d1) - K * dfR * ncdf(d2)
    delta = dfQ * ncdf(d1)
    thetaYear = (-S * dfQ * pdf * iv) / (2 * sqrtT) - r * K * dfR * ncdf(d2) + q * S * dfQ * ncdf(d1)
  } else {
    price = K * dfR * ncdf(-d2) - S * dfQ * ncdf(-d1)
    delta = -dfQ * ncdf(-d1)
    thetaYear = (-S * dfQ * pdf * iv) / (2 * sqrtT) + r * K * dfR * ncdf(-d2) - q * S * dfQ * ncdf(-d1)
  }
  const gamma = (dfQ * pdf) / (S * iv * sqrtT)
  const vega = (S * dfQ * pdf * sqrtT) / 100
  return { price: Math.max(price, 0), delta, gamma, theta: thetaYear / 365, vega }
}
