const gtdData = [
  { 
    id: 1, 
    date: '2023-10-26', 
    title: 'Attack on Outpost Kilo', 
    location: { lon: -74.006, lat: 40.7128 }, 
    description: 'A coordinated small-arms attack on a remote military outpost. The engagement lasted approximately 20 minutes before the assailants withdrew. No casualties were reported.',
    threat_level: 'High',
    group: 'Unknown Insurgent Group'
  },
  { 
    id: 2, 
    date: '2023-09-15', 
    title: 'Convoy IED Detonation', 
    location: { lon: 34.35, lat: 31.5 }, 
    description: 'An improvised explosive device was detonated near a logistical convoy, disabling one vehicle. The convoy was able to repel a follow-on ambush.',
    threat_level: 'Critical',
    group: 'Local Militia'
  },
  { 
    id: 3, 
    date: '2023-08-02', 
    title: 'Cyber Attack on Comms Network', 
    location: { lon: 139.6917, lat: 35.6895 }, 
    description: 'A sophisticated cyber attack targeted critical communication infrastructure, causing intermittent outages for several hours. The attack vector is under investigation.',
    threat_level: 'Medium',
    group: 'State-Sponsored Actor'
  },
  {
    id: 4,
    date: '2023-11-05',
    title: 'UAV Sighting Near Airbase',
    location: { lon: -118.2437, lat: 34.0522 },
    description: 'An unidentified unmanned aerial vehicle was sighted conducting reconnaissance near a major airbase. The UAV was not engaged and its origin is unknown.',
    threat_level: 'Medium',
    group: 'Unknown'
  }
];

export const getGtdEvents = async () => {
  console.log('Fetching GTD events...');
  await new Promise(resolve => setTimeout(resolve, 500));
  return gtdData;
};