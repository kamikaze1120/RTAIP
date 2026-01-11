const pubLogData = [
  { 
    id: 1, 
    nsn: '5962-01-123-4567', 
    name: 'Microcircuit, Digital', 
    location: { lon: -95.3698, lat: 29.7604 }, 
    status: 'In Transit',
    quantity: 500,
    eta: '2023-11-10',
    type: 'Electronics',
    description: 'Critical components for repairing communication systems. En route to main depot.'
  },
  { 
    id: 2, 
    nsn: '1005-00-589-1271', 
    name: 'Rifle, 5.56mm, M16A4', 
    location: { lon: -118.2437, lat: 34.0522 }, 
    status: 'In Stock',
    quantity: 150,
    type: 'Weaponry',
    description: 'Standard issue service rifles. Stored at main armory.'
  },
  { 
    id: 3, 
    nsn: '8415-01-538-6739', 
    name: 'Glove, Combat, Foliage Green', 
    location: { lon: -74.006, lat: 40.7128 }, 
    status: 'Low Stock',
    quantity: 30,
    type: 'Apparel',
    description: 'Personal protective equipment for ground personnel. Reorder required.'
  },
  {
    id: 4,
    nsn: '6135-01-490-4316',
    name: 'Battery, Lithium, Non-Rechargeable',
    location: { lon: -84.3880, lat: 33.7490 },
    status: 'In Stock',
    quantity: 2500,
    type: 'Electronics',
    description: 'Power source for various portable electronic devices.'
  },
  {
    id: 5,
    nsn: '2320-01-541-2077',
    name: 'Truck, Utility, HMMWV, M1151A1',
    location: { lon: -95.3698, lat: 29.7604 },
    status: 'In Transit',
    quantity: 5,
    eta: '2023-11-12',
    type: 'Vehicle',
    description: 'Up-armored utility vehicles being transported to forward operating base.'
  }
];

export const getAssets = async () => {
    console.log('Fetching assets from PUB LOG...');
    await new Promise(resolve => setTimeout(resolve, 500));
    return pubLogData;
};