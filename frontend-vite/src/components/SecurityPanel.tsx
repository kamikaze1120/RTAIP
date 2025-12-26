import React, { useState, useEffect } from 'react';
import { Paper, Typography, TextField, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Switch, FormGroup, FormControlLabel } from '@mui/material';
import api from '../services/api';

interface AuditLog {
    timestamp: string;
    event: string;
    user: string;
    details: object; // Consider defining a more specific type if the structure of details is known
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
            // Store token and user info
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
        // Here you would typically also send the updated policy to the backend
    };

    useEffect(() => {
        fetchAuditLogs();
    }, []);

    return (
        <Paper elevation={3} style={{ padding: '20px', margin: '20px' }}>
            <Typography variant="h6">Security & Access Control</Typography>
            
            <div style={{ marginTop: '20px' }}>
                <Typography variant="subtitle1">PKI/CAC Authentication</Typography>
                <TextField label="Username" value={username} onChange={(e) => setUsername(e.target.value)} fullWidth margin="normal" />
                <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} fullWidth margin="normal" />
                <TextField label="CAC Serial Number" value={cacSerialNumber} onChange={(e) => setCacSerialNumber(e.target.value)} fullWidth margin="normal" />
                <Button variant="contained" color="primary" onClick={handleLogin}>Login</Button>
            </div>

            <div style={{ marginTop: '20px' }}>
                <Typography variant="subtitle1">Access Control Policies</Typography>
                <FormGroup>
                    <FormControlLabel control={<Switch checked={policies.pkiRequired} onChange={handlePolicyChange} name="pkiRequired" />} label="Require PKI/CAC for Login" />
                    <FormControlLabel control={<Switch checked={policies.abacEnabled} onChange={handlePolicyChange} name="abacEnabled" />} label="Enable Attribute-Based Access Control (ABAC)" />
                    <FormControlLabel control={<Switch checked={policies.rbacEnabled} onChange={handlePolicyChange} name="rbacEnabled" />} label="Enable Role-Based Access Control (RBAC)" />
                </FormGroup>
            </div>

            <div style={{ marginTop: '20px' }}>
                <Typography variant="subtitle1">Tamper-Evident Audit Logs</Typography>
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Timestamp</TableCell>
                                <TableCell>Event</TableCell>
                                <TableCell>User</TableCell>
                                <TableCell>Details</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {auditLogs.map((log: AuditLog, index) => (
                                <TableRow key={index}>
                                    <TableCell>{new Date(log.timestamp).toLocaleString()}</TableCell>
                                    <TableCell>{log.event}</TableCell>
                                    <TableCell>{log.user}</TableCell>
                                    <TableCell>{JSON.stringify(log.details)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </div>
        </Paper>
    );
};

export default SecurityPanel;