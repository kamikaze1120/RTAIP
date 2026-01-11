// In a real application, this file would contain functions to fetch data from the DTIC and ODIN APIs.
// For now, we'll simulate the API calls with a delay to mimic network latency.

const dticData = [
  { 
    id: 1, 
    title: 'Advanced Composite Materials for Aerospace Applications', 
    source: 'DTIC', 
    date: '2023-10-26', 
    summary: 'A comprehensive study on the development and testing of new composite materials designed for use in next-generation military and civilian aircraft. The report details material properties, performance under stress, and potential applications in fuselage and wing construction.',
    report_url: '/mock-report-dtic-1.pdf',
    classification: 'UNCLASSIFIED'
  },
  { 
    id: 2, 
    title: 'Unmanned Aerial Vehicle (UAV) Swarm Tactics', 
    source: 'DTIC', 
    date: '2023-08-02', 
    summary: 'An in-depth analysis of autonomous swarm tactics for UAVs in reconnaissance and combat scenarios. This research explores decentralized coordination algorithms, communication protocols, and tactical formations for effective mission execution.',
    report_url: '/mock-report-dtic-2.pdf',
    classification: 'UNCLASSIFIED'
  },
];

const odinData = [
  { 
    id: 3, 
    title: 'Cyber Warfare: Defense and Countermeasures', 
    source: 'ODIN', 
    date: '2023-09-15', 
    summary: 'This report outlines the latest strategies for defending critical infrastructure against sophisticated cyber attacks. It covers threat identification, network hardening, intrusion detection systems, and methods for effective countermeasures and attribution.',
    report_url: '/mock-report-odin-1.pdf',
    classification: 'UNCLASSIFIED'
  },
  {
    id: 4,
    title: 'Threat Assessment: Red Force Artillery Capabilities',
    source: 'ODIN',
    date: '2023-11-01',
    summary: 'An operational-level assessment of the 2A65 Msta-B towed howitzer, including its effective range, rate of fire, and logistical support requirements. The document is intended for training and operational planning.',
    report_url: '/mock-report-odin-2.pdf',
    classification: 'UNCLASSIFIED'
  }
];

const usaceData = [
  {
    id: 5,
    title: 'Infrastructure Resilience Study: Coastal Regions',
    source: 'USACE',
    date: '2023-07-19',
    summary: 'Analysis of critical infrastructure vulnerabilities in coastal areas due to climate change and seismic activity. Provides recommendations for structural hardening and disaster response planning.',
    report_url: '/mock-report-usace-1.pdf',
    classification: 'UNCLASSIFIED'
  }
];

const publogData = [
  {
    id: 6,
    title: 'Global Logistics Chain Analysis: Q3 2023',
    source: 'PUB LOG',
    date: '2023-10-05',
    summary: 'A quarterly report on the status of global public logistics chains, highlighting potential disruptions, chokepoints, and efficiency metrics for major shipping routes.',
    report_url: '/mock-report-publog-1.pdf',
    classification: 'UNCLASSIFIED'
  }
];

const ngaData = [
  {
    id: 7,
    title: 'Geospatial Analysis of Contested Zone',
    source: 'NGA Tearline',
    date: '2023-11-10',
    summary: 'High-resolution imagery and geospatial intelligence analysis of a contested region, detailing force dispositions, infrastructure changes, and patterns of life.',
    report_url: '/mock-report-nga-1.pdf',
    classification: 'FOR OFFICIAL USE ONLY'
  }
];

const periscopeData = [
  {
    id: 8,
    title: 'Next-Generation Fighter Jet Capabilities',
    source: 'Military Periscope',
    date: '2023-06-22',
    summary: 'A comparative analysis of emerging 5th and 6th generation fighter aircraft, focusing on stealth, avionics, and weapon systems.',
    report_url: '/mock-report-periscope-1.pdf',
    classification: 'UNCLASSIFIED'
  }
];

const janesData = [
  {
    id: 9,
    title: 'Defense Spending Trends in East Asia',
    source: 'Janes',
    date: '2023-09-28',
    summary: 'An intelligence briefing on defense budget allocations and procurement priorities for key nations in the East Asian region.',
    report_url: '/mock-report-janes-1.pdf',
    classification: 'UNCLASSIFIED'
  }
];

const gtdbData = [
  {
    id: 10,
    title: 'Global Terrorism Index: 2023 Report',
    source: 'Global Terrorism DB',
    date: '2023-05-15',
    summary: 'A statistical overview of global terrorism trends, including attack frequency, target types, and perpetrator profiles from the last calendar year.',
    report_url: '/mock-report-gtdb-1.pdf',
    classification: 'UNCLASSIFIED'
  }
];

export const searchDtic = async (term: string) => {
  console.log(`Searching DTIC for: ${term}`);
  await new Promise(resolve => setTimeout(resolve, 500));
  if (!term) return dticData;
  return dticData.filter(d => d.title.toLowerCase().includes(term.toLowerCase()) || d.summary.toLowerCase().includes(term.toLowerCase()));
};

export const searchOdin = async (term: string) => {
  console.log(`Searching ODIN for: ${term}`);
  await new Promise(resolve => setTimeout(resolve, 500));
  if (!term) return odinData;
  return odinData.filter(d => d.title.toLowerCase().includes(term.toLowerCase()) || d.summary.toLowerCase().includes(term.toLowerCase()));
};

export const searchUsace = async (term: string) => {
  console.log(`Searching USACE for: ${term}`);
  await new Promise(resolve => setTimeout(resolve, 500));
  if (!term) return usaceData;
  return usaceData.filter(d => d.title.toLowerCase().includes(term.toLowerCase()) || d.summary.toLowerCase().includes(term.toLowerCase()));
};

export const searchPublog = async (term: string) => {
  console.log(`Searching PUB LOG for: ${term}`);
  await new Promise(resolve => setTimeout(resolve, 500));
  if (!term) return publogData;
  return publogData.filter(d => d.title.toLowerCase().includes(term.toLowerCase()) || d.summary.toLowerCase().includes(term.toLowerCase()));
};

export const searchNga = async (term: string) => {
  console.log(`Searching NGA Tearline for: ${term}`);
  await new Promise(resolve => setTimeout(resolve, 500));
  if (!term) return ngaData;
  return ngaData.filter(d => d.title.toLowerCase().includes(term.toLowerCase()) || d.summary.toLowerCase().includes(term.toLowerCase()));
};

export const searchPeriscope = async (term: string) => {
  console.log(`Searching Military Periscope for: ${term}`);
  await new Promise(resolve => setTimeout(resolve, 500));
  if (!term) return periscopeData;
  return periscopeData.filter(d => d.title.toLowerCase().includes(term.toLowerCase()) || d.summary.toLowerCase().includes(term.toLowerCase()));
};

export const searchJanes = async (term: string) => {
  console.log(`Searching Janes for: ${term}`);
  await new Promise(resolve => setTimeout(resolve, 500));
  if (!term) return janesData;
  return janesData.filter(d => d.title.toLowerCase().includes(term.toLowerCase()) || d.summary.toLowerCase().includes(term.toLowerCase()));
};

export const searchGtdb = async (term: string) => {
  console.log(`Searching Global Terrorism DB for: ${term}`);
  await new Promise(resolve => setTimeout(resolve, 500));
  if (!term) return gtdbData;
  return gtdbData.filter(d => d.title.toLowerCase().includes(term.toLowerCase()) || d.summary.toLowerCase().includes(term.toLowerCase()));
};