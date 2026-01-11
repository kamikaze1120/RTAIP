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