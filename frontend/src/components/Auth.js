import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://your-supabase-url', 'your-anon-key');

const Auth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    const { user, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) console.error(error);
    else console.log('User:', user);
  };

  return (
    <div>
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
      <button onClick={handleLogin}>Login</button>
    </div>
  );
};

export default Auth;