import React, { useState, useEffect } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

export default function Auth({ onAuthChange }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState(''); // For login: email, for register: username
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('patient');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userInfo, setUserInfo] = useState(null);

  useEffect(() => {
    // Check if user is already authenticated
    const token = localStorage.getItem('auth_token');
    if (token) {
      setIsAuthenticated(true);
      // Try to decode token to get user info (basic JWT decode)
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUserInfo({ username: payload.username, role: payload.role });
      } catch (e) {
        // If token decode fails, still consider authenticated
        setUserInfo({ username: 'User', role: 'unknown' });
      }
      if (onAuthChange) onAuthChange(true);
    }
  }, [onAuthChange]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Backend login uses email, not username
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: username, password }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Login failed');
      }

      const token = data.data.accessToken;
      localStorage.setItem('auth_token', token);
      setIsAuthenticated(true);
      
      // Decode token for user info
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUserInfo({ username: payload.username, role: payload.role });
      } catch (e) {
        setUserInfo({ username: username, role: 'unknown' });
      }

      setSuccess('Login successful!');
      if (onAuthChange) onAuthChange(true);
      
      // Clear form
      setUsername('');
      setPassword('');
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (!username || !email || !password || !role) {
      setError('Please fill in all required fields');
      setLoading(false);
      return;
    }

    try {
      // Backend only accepts: username, email, password, role (no firstName/lastName)
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          email,
          password,
          role,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || data.errors?.[0]?.msg || 'Registration failed');
      }

      const token = data.data.accessToken;
      localStorage.setItem('auth_token', token);
      setIsAuthenticated(true);
      
      // Decode token for user info
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUserInfo({ username: payload.username, role: payload.role });
      } catch (e) {
        setUserInfo({ username: username, role: role });
      }

      setSuccess('Registration successful! You are now logged in.');
      if (onAuthChange) onAuthChange(true);
      
      // Clear form
      setUsername('');
      setEmail('');
      setPassword('');
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    setIsAuthenticated(false);
    setUserInfo(null);
    setError(null);
    setSuccess(null);
    if (onAuthChange) onAuthChange(false);
  };

  if (isAuthenticated) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '20px',
        borderRadius: '12px',
        marginBottom: '20px',
        color: 'white',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: '0 0 5px 0' }}>🔐 Authenticated</h3>
            <p style={{ margin: 0, opacity: 0.9 }}>
              Logged in as <strong>{userInfo?.username}</strong> ({userInfo?.role || 'user'})
            </p>
          </div>
          <button
            onClick={handleLogout}
            style={{
              padding: '10px 20px',
              background: 'rgba(255,255,255,0.2)',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '6px',
              color: 'white',
              cursor: 'pointer',
              fontWeight: 'bold',
              transition: 'all 0.3s'
            }}
            onMouseOver={(e) => e.target.style.background = 'rgba(255,255,255,0.3)'}
            onMouseOut={(e) => e.target.style.background = 'rgba(255,255,255,0.2)'}
          >
            Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'white',
      padding: '30px',
      borderRadius: '12px',
      marginBottom: '20px',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      maxWidth: '500px',
      margin: '0 auto 20px auto'
    }}>
      <div style={{ marginBottom: '20px', textAlign: 'center' }}>
        <h2 style={{ margin: '0 0 10px 0', color: '#333' }}>
          {isLogin ? '🔐 Login' : '📝 Register'}
        </h2>
        <p style={{ color: '#666', margin: 0 }}>
          {isLogin 
            ? 'Login to access prescription verification and other features'
            : 'Create an account to get started'}
        </p>
      </div>

      <div style={{ marginBottom: '15px', display: 'flex', gap: '10px', justifyContent: 'center' }}>
        <button
          onClick={() => {
            setIsLogin(true);
            setError(null);
            setSuccess(null);
          }}
          style={{
            padding: '8px 16px',
            background: isLogin ? '#667eea' : '#f0f0f0',
            color: isLogin ? 'white' : '#333',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: isLogin ? 'bold' : 'normal'
          }}
        >
          Login
        </button>
        <button
          onClick={() => {
            setIsLogin(false);
            setError(null);
            setSuccess(null);
          }}
          style={{
            padding: '8px 16px',
            background: !isLogin ? '#667eea' : '#f0f0f0',
            color: !isLogin ? 'white' : '#333',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: !isLogin ? 'bold' : 'normal'
          }}
        >
          Register
        </button>
      </div>

      {error && (
        <div style={{
          padding: '12px',
          background: '#fee',
          border: '1px solid #fcc',
          borderRadius: '6px',
          color: '#c33',
          marginBottom: '15px'
        }}>
          ⚠️ {error}
        </div>
      )}

      {success && (
        <div style={{
          padding: '12px',
          background: '#efe',
          border: '1px solid #cfc',
          borderRadius: '6px',
          color: '#3c3',
          marginBottom: '15px'
        }}>
          ✅ {success}
        </div>
      )}

      <form onSubmit={isLogin ? handleLogin : handleRegister}>
        {isLogin ? (
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' }}>
              Email *
            </label>
            <input
              type="email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
              placeholder="Enter your email"
            />
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' }}>
                Username *
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
                placeholder="Enter your username (alphanumeric only)"
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' }}>
                Email *
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
                placeholder="Enter your email"
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' }}>
                Role *
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              >
                <option value="patient">Patient</option>
                <option value="doctor">Doctor</option>
                <option value="educator">Educator</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </>
        )}

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' }}>
            Password *
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '14px',
              boxSizing: 'border-box'
            }}
            placeholder="Enter your password"
            minLength="6"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px',
            background: loading ? '#ccc' : '#667eea',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s'
          }}
          onMouseOver={(e) => {
            if (!loading) e.target.style.background = '#5568d3';
          }}
          onMouseOut={(e) => {
            if (!loading) e.target.style.background = '#667eea';
          }}
        >
          {loading ? '⏳ Processing...' : (isLogin ? '🔐 Login' : '📝 Register')}
        </button>
      </form>
    </div>
  );
}
