import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';

const threatData = [
  { name: 'Conventional', count: 12 },
  { name: 'Asymmetric', count: 8 },
  { name: 'Cyber', count: 5 },
  { name: 'Reconnaissance', count: 10 },
  { name: 'Electronic Warfare', count: 3 },
  { name: 'Strategic', count: 6 },
];

const assetData = [
  { date: '2023-11-01', 'In Transit': 5, 'In Stock': 15, 'Deployed': 20 },
  { date: '2023-11-02', 'In Transit': 7, 'In Stock': 12, 'Deployed': 21 },
  { date: '2023-11-03', 'In Transit': 6, 'In Stock': 14, 'Deployed': 20 },
  { date: '2023-11-04', 'In Transit': 8, 'In Stock': 10, 'Deployed': 22 },
  { date: '2023-11-05', 'In Transit': 5, 'In Stock': 15, 'Deployed': 20 },
  { date: '2023-11-06', 'In Transit': 9, 'In Stock': 11, 'Deployed': 20 },
];

const DashboardGraphs: React.FC = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
      <div className="bg-gray-800 p-4 rounded-lg">
        <h3 className="text-lg font-semibold text-white mb-4">Threat Type Distribution</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={threatData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip contentStyle={{ background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff' }} />
            <Legend />
            <Bar isAnimationActive dataKey="count" fill="#60a5fa" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-gray-800 p-4 rounded-lg">
        <h3 className="text-lg font-semibold text-white mb-4">Asset Status Over Time</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={assetData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip contentStyle={{ background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff' }} />
            <Legend />
            <Line isAnimationActive type="monotone" dataKey="In Transit" stroke="#60a5fa" strokeWidth={2} />
            <Line isAnimationActive type="monotone" dataKey="In Stock" stroke="#22c55e" strokeWidth={2} />
            <Line isAnimationActive type="monotone" dataKey="Deployed" stroke="#f59e0b" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default DashboardGraphs;