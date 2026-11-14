// Ready-made option strategies. Strikes are expressed as an offset (in strike
// steps) from ATM so the client can materialise them for any underlying.
// `expiryIndex` selects the nth available expiry (calendar spreads use 1).

const leg = (side, optionType, offset = 0, lots = 1, expiryIndex = 0) => ({
  side,
  optionType,
  offset,
  lots,
  expiryIndex,
});

const TEMPLATES = {
  bullish: [
    { id: 'buy-call', name: 'Buy Call', legs: [leg('B', 'CE')] },
    { id: 'sell-put', name: 'Sell Put', legs: [leg('S', 'PE')] },
    { id: 'bull-call-spread', name: 'Bull Call Spread', legs: [leg('B', 'CE'), leg('S', 'CE', 4)] },
    { id: 'bull-put-spread', name: 'Bull Put Spread', legs: [leg('S', 'PE'), leg('B', 'PE', -4)] },
    {
      id: 'call-ratio-back-spread',
      name: 'Call Ratio Back Spread',
      legs: [leg('S', 'CE'), leg('B', 'CE', 4, 2)],
    },
    {
      id: 'long-calendar-calls',
      name: 'Long Calendar with Calls',
      legs: [leg('S', 'CE', 0, 1, 0), leg('B', 'CE', 0, 1, 1)],
    },
    {
      id: 'bull-condor',
      name: 'Bull Condor',
      legs: [leg('B', 'CE', -2), leg('S', 'CE', 0), leg('S', 'CE', 4), leg('B', 'CE', 6)],
    },
    {
      id: 'bull-butterfly',
      name: 'Bull Butterfly',
      legs: [leg('B', 'CE'), leg('S', 'CE', 3, 2), leg('B', 'CE', 6)],
    },
    { id: 'range-forward', name: 'Range Forward', legs: [leg('S', 'PE', -4), leg('B', 'CE', 4)] },
    { id: 'long-synthetic-future', name: 'Long Synthetic Future', legs: [leg('B', 'CE'), leg('S', 'PE')] },
  ],
  bearish: [
    { id: 'buy-put', name: 'Buy Put', legs: [leg('B', 'PE')] },
    { id: 'sell-call', name: 'Sell Call', legs: [leg('S', 'CE')] },
    { id: 'bear-call-spread', name: 'Bear Call Spread', legs: [leg('S', 'CE'), leg('B', 'CE', 4)] },
    { id: 'bear-put-spread', name: 'Bear Put Spread', legs: [leg('B', 'PE'), leg('S', 'PE', -4)] },
    {
      id: 'put-ratio-back-spread',
      name: 'Put Ratio Back Spread',
      legs: [leg('S', 'PE'), leg('B', 'PE', -4, 2)],
    },
    {
      id: 'long-calendar-puts',
      name: 'Long Calendar with Puts',
      legs: [leg('S', 'PE', 0, 1, 0), leg('B', 'PE', 0, 1, 1)],
    },
    {
      id: 'bear-condor',
      name: 'Bear Condor',
      legs: [leg('B', 'PE', 2), leg('S', 'PE', 0), leg('S', 'PE', -4), leg('B', 'PE', -6)],
    },
    {
      id: 'bear-butterfly',
      name: 'Bear Butterfly',
      legs: [leg('B', 'PE'), leg('S', 'PE', -3, 2), leg('B', 'PE', -6)],
    },
    { id: 'risk-reversal', name: 'Risk Reversal', legs: [leg('B', 'PE', -4), leg('S', 'CE', 4)] },
    { id: 'short-synthetic-future', name: 'Short Synthetic Future', legs: [leg('S', 'CE'), leg('B', 'PE')] },
  ],
  neutral: [
    { id: 'short-straddle', name: 'Short Straddle', legs: [leg('S', 'CE'), leg('S', 'PE')] },
    {
      id: 'iron-butterfly',
      name: 'Iron Butterfly',
      legs: [leg('S', 'CE'), leg('S', 'PE'), leg('B', 'CE', 6), leg('B', 'PE', -6)],
    },
    { id: 'short-strangle', name: 'Short Strangle', legs: [leg('S', 'CE', 4), leg('S', 'PE', -4)] },
    {
      id: 'short-iron-condor',
      name: 'Short Iron Condor',
      legs: [leg('S', 'CE', 4), leg('S', 'PE', -4), leg('B', 'CE', 8), leg('B', 'PE', -8)],
    },
    {
      id: 'batman',
      name: 'Batman',
      legs: [leg('B', 'CE', 2), leg('S', 'CE', 4, 2), leg('B', 'CE', 6), leg('B', 'PE', -2), leg('S', 'PE', -4, 2), leg('B', 'PE', -6)],
    },
    {
      id: 'double-plateau',
      name: 'Double Plateau',
      legs: [leg('B', 'CE', 2), leg('S', 'CE', 4), leg('S', 'CE', 6), leg('B', 'CE', 8), leg('B', 'PE', -2), leg('S', 'PE', -4), leg('S', 'PE', -6), leg('B', 'PE', -8)],
    },
    {
      id: 'jade-lizard',
      name: 'Jade Lizard',
      legs: [leg('S', 'PE', -4), leg('S', 'CE', 4), leg('B', 'CE', 8)],
    },
    {
      id: 'reverse-jade-lizard',
      name: 'Reverse Jade Lizard',
      legs: [leg('S', 'CE', 4), leg('S', 'PE', -4), leg('B', 'PE', -8)],
    },
  ],
  other: [
    { id: 'call-ratio-spread', name: 'Call Ratio Spread', legs: [leg('B', 'CE'), leg('S', 'CE', 4, 2)] },
    { id: 'put-ratio-spread', name: 'Put Ratio Spread', legs: [leg('B', 'PE'), leg('S', 'PE', -4, 2)] },
    { id: 'long-straddle', name: 'Long Straddle', legs: [leg('B', 'CE'), leg('B', 'PE')] },
    {
      id: 'long-iron-butterfly',
      name: 'Long Iron Butterfly',
      legs: [leg('B', 'CE'), leg('B', 'PE'), leg('S', 'CE', 6), leg('S', 'PE', -6)],
    },
    { id: 'long-strangle', name: 'Long Strangle', legs: [leg('B', 'CE', 4), leg('B', 'PE', -4)] },
    {
      id: 'long-iron-condor',
      name: 'Long Iron Condor',
      legs: [leg('B', 'CE', 4), leg('B', 'PE', -4), leg('S', 'CE', 8), leg('S', 'PE', -8)],
    },
    { id: 'strip', name: 'Strip', legs: [leg('B', 'CE'), leg('B', 'PE', 0, 2)] },
    { id: 'strap', name: 'Strap', legs: [leg('B', 'CE', 0, 2), leg('B', 'PE')] },
  ],
};

module.exports = { TEMPLATES };
