// Static reference data for the instruments the dashboard supports.

const INDICES = {
  NIFTY: {
    symbol: 'NIFTY',
    name: 'NIFTY 50',
    basePrice: 23719.3,
    lotSize: 65,
    strikeStep: 50,
    baseIv: 0.145,
    weeklyExpiry: true,
    vix: 17.9,
    ivPercentile: 70,
  },
  BANKNIFTY: {
    symbol: 'BANKNIFTY',
    name: 'NIFTY BANK',
    basePrice: 53813.6,
    lotSize: 35,
    strikeStep: 100,
    baseIv: 0.162,
    weeklyExpiry: false,
    vix: 17.9,
    ivPercentile: 64,
  },
};

const SECTORS = [
  'Financial Services',
  'Oil & Gas',
  'IT',
  'Automobile',
  'FMCG',
  'Telecommunication',
  'Metals & Mining',
  'Healthcare',
  'Construction',
  'Power',
  'Consumer Durables',
  'Construction Materials',
  'Capital Goods',
];

// [symbol, display name, sector, reference price, index weight]
const RAW_CONSTITUENTS = [
  ['RELIANCE', 'Reliance', 'Oil & Gas', 1285.4, 8.7],
  ['HDFCBANK', 'HDFC Bank', 'Financial Services', 1720.15, 6.1],
  ['INFY', 'Infosys', 'IT', 1530.6, 5.8],
  ['ICICIBANK', 'ICICI Bank', 'Financial Services', 1245.3, 5.3],
  ['TCS', 'TCS', 'IT', 3480.75, 4.1],
  ['LT', 'L&T', 'Construction', 3560.2, 3.9],
  ['ITC', 'ITC', 'FMCG', 425.85, 3.4],
  ['AXISBANK', 'Axis Bank', 'Financial Services', 1130.4, 4.1],
  ['BHARTIARTL', 'Bharti Airtel', 'Telecommunication', 1620.5, 3.6],
  ['KOTAKBANK', 'Kotak Mahindra Bank', 'Financial Services', 2010.0, 2.9],
  ['SBIN', 'State Bank of India', 'Financial Services', 815.35, 2.8],
  ['HINDUNILVR', 'Hindustan Unilever', 'FMCG', 2390.1, 2.2],
  ['M&M', 'Mahindra & Mahindra', 'Automobile', 2950.4, 2.2],
  ['BAJFINANCE', 'Bajaj Finance', 'Financial Services', 8650.0, 2.1],
  ['SUNPHARMA', 'Sun Pharma', 'Healthcare', 1750.25, 1.7],
  ['HCLTECH', 'HCL Technologies', 'IT', 1610.9, 1.6],
  ['MARUTI', 'Maruti Suzuki', 'Automobile', 12400.0, 1.5],
  ['NTPC', 'NTPC', 'Power', 360.45, 1.5],
  ['TATAMOTORS', 'Tata Motors', 'Automobile', 720.3, 1.4],
  ['POWERGRID', 'Power Grid', 'Power', 305.2, 1.3],
  ['TITAN', 'Titan Company', 'Consumer Durables', 3320.55, 1.3],
  ['ULTRACEMCO', 'UltraTech Cement', 'Construction Materials', 11300.0, 1.2],
  ['TATASTEEL', 'Tata Steel', 'Metals & Mining', 152.4, 1.1],
  ['BEL', 'Bharat Electronics', 'Capital Goods', 385.6, 1.1],
  ['BAJAJFINSV', 'Bajaj Finserv', 'Financial Services', 1880.3, 1.0],
  ['ETERNAL', 'Eternal', 'Consumer Durables', 300.15, 1.0],
  ['ONGC', 'ONGC', 'Oil & Gas', 245.8, 0.9],
  ['JSWSTEEL', 'JSW Steel', 'Metals & Mining', 980.1, 0.9],
  ['ADANIPORTS', 'Adani Ports', 'Construction', 1240.7, 0.9],
  ['ASIANPAINT', 'Asian Paints', 'Consumer Durables', 2380.0, 0.9],
  ['TECHM', 'Tech Mahindra', 'IT', 1590.4, 0.9],
  ['HINDALCO', 'Hindalco', 'Metals & Mining', 690.25, 0.9],
  ['TRENT', 'Trent', 'Consumer Durables', 5600.0, 0.9],
  ['COALINDIA', 'Coal India', 'Metals & Mining', 390.65, 0.8],
  ['GRASIM', 'Grasim', 'Construction Materials', 2650.3, 0.8],
  ['BAJAJ-AUTO', 'Bajaj Auto', 'Automobile', 8400.0, 0.8],
  ['JIOFIN', 'Jio Financial', 'Financial Services', 320.4, 0.8],
  ['WIPRO', 'Wipro', 'IT', 295.3, 0.7],
  ['NESTLEIND', 'Nestle India', 'FMCG', 2380.6, 0.7],
  ['CIPLA', 'Cipla', 'Healthcare', 1490.2, 0.7],
  ['SBILIFE', 'SBI Life', 'Financial Services', 1830.5, 0.7],
  ['HDFCLIFE', 'HDFC Life', 'Financial Services', 760.35, 0.7],
  ['SHRIRAMFIN', 'Shriram Finance', 'Financial Services', 640.1, 0.7],
  ['DRREDDY', "Dr. Reddy's", 'Healthcare', 1260.45, 0.6],
  ['APOLLOHOSP', 'Apollo Hospitals', 'Healthcare', 7100.0, 0.6],
  ['TATACONSUM', 'Tata Consumer', 'FMCG', 1080.2, 0.6],
  ['EICHERMOT', 'Eicher Motors', 'Automobile', 5450.0, 0.6],
  ['ADANIENT', 'Adani Enterprises', 'Metals & Mining', 2400.5, 0.6],
  ['BRITANNIA', 'Britannia', 'FMCG', 5600.4, 0.5],
  ['HEROMOTOCO', 'Hero MotoCorp', 'Automobile', 4500.0, 0.5],
];

const totalWeight = RAW_CONSTITUENTS.reduce((sum, row) => sum + row[4], 0);

const NIFTY50 = RAW_CONSTITUENTS.map(([symbol, name, sector, basePrice, weight]) => ({
  symbol,
  name,
  sector,
  basePrice,
  weight: (weight / totalWeight) * 100,
}));

const STOCKS = Object.fromEntries(NIFTY50.map((stock) => [stock.symbol, stock]));

function getInstrument(symbol) {
  const key = String(symbol || '').toUpperCase();
  if (INDICES[key]) return { ...INDICES[key], kind: 'index' };
  if (STOCKS[key]) return { ...STOCKS[key], kind: 'stock' };
  return null;
}

module.exports = { INDICES, SECTORS, NIFTY50, STOCKS, getInstrument };
