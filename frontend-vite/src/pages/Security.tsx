import React, { useState, useEffect } from 'react';
import { NewHeader } from '../components/NewHeader';
import api from '../services/api';

interface AuditLog {
    timestamp: string;
    event: string;
    user: string;
    details: object;
}

export default function Security() {
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
        <div className="flow-gradient text-white min-h-screen">
            <NewHeader />
            <div className="p-4 lg:p-6">
                <div className="mb-8">
                    <h1 className="text-4xl font-bold">Security & Access Control</h1>
                    <p className="text-gray-400">Manage authentication, access policies, and audit logs.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Login Form */}
                    <div className="bg-white/10 backdrop-blur-md rounded-lg shadow-lg p-6 border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 to-violet-500/10">
                        <h3 className="text-xl font-semibold text-white mb-4">PKI/CAC Authentication</h3>
                        <div className="space-y-4">
                            <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full px-4 py-2 bg-black/20 text-white placeholder-gray-500 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-2 bg-black/20 text-white placeholder-gray-500 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                            <input type="text" placeholder="CAC Serial Number" value={cacSerialNumber} onChange={(e) => setCacSerialNumber(e.target.value)} className="w-full px-4 py-2 bg-black/20 text-white placeholder-gray-500 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                            <button onClick={handleLogin} className="w-full bg-gradient-to-r from-cyan-500 to-violet-500 text-black font-bold py-2 px-4 rounded-lg transition-opacity hover:opacity-90">
                                Authenticate
                            </button>
                        </div>
                    </div>

                    {/* Access Control Policies */}
                    <div className="bg-white/10 backdrop-blur-md rounded-lg shadow-lg p-6 border border-cyan-500/20 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10">
                        <h3 className="text-xl font-semibold text-white mb-4">Access Control Policies</h3>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between bg-black/20 p-3 rounded-lg border border-white/10">
                                <label htmlFor="pkiRequired" className="text-gray-300">Require PKI/CAC for Login</label>
                                <input type="checkbox" id="pkiRequired" name="pkiRequired" checked={policies.pkiRequired} onChange={handlePolicyChange} className="form-checkbox h-5 w-5 text-blue-600 bg-gray-800 border-gray-600 rounded focus:ring-blue-500" />
                            </div>
                            <div className="flex items-center justify-between bg-black/20 p-3 rounded-lg border border-white/10">
                                <label htmlFor="abacEnabled" className="text-gray-300">Enable Attribute-Based Access Control (ABAC)</label>
                                <input type="checkbox" id="abacEnabled" name="abacEnabled" checked={policies.abacEnabled} onChange={handlePolicyChange} className="form-checkbox h-5 w-5 text-blue-600 bg-gray-800 border-gray-600 rounded focus:ring-blue-500" />
                            </div>
                            <div className="flex items-center justify-between bg-black/20 p-3 rounded-lg border border-white/10">
                                <label htmlFor="rbacEnabled" className="text-gray-300">Enable Role-Based Access Control (RBAC)</label>
                                <input type="checkbox" id="rbacEnabled" name="rbacEnabled" checked={policies.rbacEnabled} onChange={handlePolicyChange} className="form-checkbox h-5 w-5 text-blue-600 bg-gray-800 border-gray-600 rounded focus:ring-blue-500" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Audit Logs */}
                <div className="mt-8 bg-white/10 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/10">
                    <h3 className="text-xl font-semibold text-white mb-4">Tamper-Evident Audit Logs</h3>
                    <div className="overflow-x-auto">
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
                                {auditLogs.length > 0 ? auditLogs.map((log: AuditLog, index) => (
                                    <tr key={index} className="border-b border-white/10 hover:bg-white/10">
                                        <td className="px-6 py-4">{new Date(log.timestamp).toLocaleString()}</td>
                                        <td className="px-6 py-4">{log.event}</td>
                                        <td className="px-6 py-4">{log.user}</td>
                                        <td className="px-6 py-4 font-mono text-xs">{JSON.stringify(log.details)}</td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={4} className="text-center py-8 text-gray-500">No audit logs found.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}