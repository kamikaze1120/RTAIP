import React, { useState, useEffect } from 'react';
import api from '../services/api';

interface AuditLog {
    timestamp: string;
    event: string;
    user: string;
    details: object;
}

const SecurityPanel = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [cacSerialNumber, setCacSerialNumber] = useState('');
    const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
    const [policies, setPolicies] = useState({
        pkiRequired: true,
        abacEnabled: true,
        rbacEnabled: true,
    });

    const handleLogin = async () => {
        try {
            const response = await api.post('/auth/login', { username, password, cacSerialNumber });
            console.log('Login successful:', response.data);
        } catch (error) {
            console.error('Login failed:', error);
        }
    };

    const fetchAuditLogs = async () => {
        try {
            const response = await api.get('/security/audit-logs');
            setAuditLogs(response.data);
        } catch (error) {
            console.error('Failed to fetch audit logs:', error);
        }
    };

    const handlePolicyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setPolicies({ ...policies, [event.target.name]: event.target.checked });
    };

    useEffect(() => {
        fetchAuditLogs();
    }, []);

    return (
        <div className="bg-white/10 backdrop-blur-md rounded-lg shadow-lg p-6 space-y-8">
            <h2 className="text-2xl font-bold text-white">Security & Access Control</h2>

            <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-4">
                    <h3 className="text-xl font-semibold text-white">PKI/CAC Authentication</h3>
                    <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full bg-black/20 border border-gray-700 rounded-md px-3 py-2 text-white" />
                    <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-black/20 border border-gray-700 rounded-md px-3 py-2 text-white" />
                    <input type="text" placeholder="CAC Serial Number" value={cacSerialNumber} onChange={(e) => setCacSerialNumber(e.target.value)} className="w-full bg-black/20 border border-gray-700 rounded-md px-3 py-2 text-white" />
                    <button onClick={handleLogin} className="w-full bg-blue-600/50 text-white rounded-md py-2">Login</button>
                </div>

                <div className="space-y-4">
                    <h3 className="text-xl font-semibold text-white">Access Control Policies</h3>
                    <div className="flex items-center justify-between bg-black/20 p-3 rounded-md">
                        <label htmlFor="pkiRequired" className="text-gray-300">Require PKI/CAC for Login</label>
                        <input type="checkbox" id="pkiRequired" name="pkiRequired" checked={policies.pkiRequired} onChange={handlePolicyChange} className="form-checkbox h-5 w-5 text-blue-600 bg-gray-800 border-gray-600 rounded" />
                    </div>
                    <div className="flex items-center justify-between bg-black/20 p-3 rounded-md">
                        <label htmlFor="abacEnabled" className="text-gray-300">Enable Attribute-Based Access Control (ABAC)</label>
                        <input type="checkbox" id="abacEnabled" name="abacEnabled" checked={policies.abacEnabled} onChange={handlePolicyChange} className="form-checkbox h-5 w-5 text-blue-600 bg-gray-800 border-gray-600 rounded" />
                    </div>
                    <div className="flex items-center justify-between bg-black/20 p-3 rounded-md">
                        <label htmlFor="rbacEnabled" className="text-gray-300">Enable Role-Based Access Control (RBAC)</label>
                        <input type="checkbox" id="rbacEnabled" name="rbacEnabled" checked={policies.rbacEnabled} onChange={handlePolicyChange} className="form-checkbox h-5 w-5 text-blue-600 bg-gray-800 border-gray-600 rounded" />
                    </div>
                </div>
            </div>

            <div>
                <h3 className="text-xl font-semibold text-white mb-4">Tamper-Evident Audit Logs</h3>
                <div className="overflow-x-auto bg-black/20 rounded-lg">
                    <table className="min-w-full text-sm text-left text-gray-300">
                        <thead className="bg-black/30 text-xs uppercase">
                            <tr>
                                <th scope="col" className="px-6 py-3">Timestamp</th>
                                <th scope="col" className="px-6 py-3">Event</th>
                                <th scope="col" className="px-6 py-3">User</th>
                                <th scope="col" className="px-6 py-3">Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {auditLogs.map((log: AuditLog, index) => (
                                <tr key={index} className="border-b border-gray-700">
                                    <td className="px-6 py-4">{new Date(log.timestamp).toLocaleString()}</td>
                                    <td className="px-6 py-4">{log.event}</td>
                                    <td className="px-6 py-4">{log.user}</td>
                                    <td className="px-6 py-4 font-mono text-xs">{JSON.stringify(log.details)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default SecurityPanel;